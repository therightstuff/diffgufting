#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

function parseArguments(arguments_) {
  let artifactDirectory = 'test-results/runs';
  let statusId = null;
  let failureDetailsId = null;
  let verbose = false;
  let timeoutMs = null;
  let commandIndex = -1;
  for (let index = 0; index < arguments_.length; index++) {
    if (arguments_[index] === '--') { commandIndex = index; break; }
    if (arguments_[index] === '--artifact-dir') {
      artifactDirectory = arguments_[++index];
      if (!artifactDirectory) throw new Error('--artifact-dir requires a directory');
    } else if (arguments_[index] === '--status') {
      statusId = arguments_[++index];
      if (!statusId) throw new Error('--status requires a run identity');
    } else if (arguments_[index] === '--failure-details') {
      failureDetailsId = arguments_[++index];
      if (!failureDetailsId) throw new Error('--failure-details requires a run identity');
    } else if (arguments_[index] === '--verbose') {
      verbose = true;
    } else if (arguments_[index] === '--timeout-ms') {
      timeoutMs = Number(arguments_[++index]);
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout-ms requires a positive integer');
    } else throw new Error(`Unknown option: ${arguments_[index]}`);
  }
  if (statusId || failureDetailsId) {
    if (statusId && failureDetailsId) throw new Error('--status and --failure-details cannot be combined');
    if (commandIndex !== -1) throw new Error('A query cannot be combined with a command');
    return { artifactDirectory, statusId, failureDetailsId };
  }
  if (commandIndex === -1 || commandIndex === arguments_.length - 1) throw new Error('Usage: test-runner.mjs [--artifact-dir DIRECTORY] -- COMMAND [ARGUMENT...]');
  return { artifactDirectory, command: arguments_.slice(commandIndex + 1), verbose, timeoutMs };
}

async function writeAtomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}

async function readJsonOr(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nodeTestCounts(output) {
  const values = Object.fromEntries(['pass', 'fail', 'cancelled', 'skipped', 'todo'].map(name => [name, new RegExp(`(?:ℹ )?${name} (\\d+)`).exec(output)?.[1]]));
  if (Object.values(values).some(value => value === undefined)) return null;
  return { passed: Number(values.pass), failed: Number(values.fail), cancelled: Number(values.cancelled), skipped: Number(values.skipped), todo: Number(values.todo) };
}

async function status(directory, id) {
  let value;
  try {
    value = JSON.parse(await readFile(path.join(directory, `${id}.status.json`), 'utf8'));
  } catch (error) {
    throw new Error(`Run status ${id} is unavailable or corrupt: ${error.message}`);
  }
  if (value.state === 'running' && Number.isFinite(value.startedAt)) value.elapsedDurationMs = Date.now() - value.startedAt;
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function failureDetails(directory, id) {
  let report;
  try {
    report = JSON.parse(await readFile(path.join(directory, `${id}.report.json`), 'utf8'));
  } catch (error) {
    throw new Error(`Run report ${id} is unavailable or corrupt: ${error.message}`);
  }
  let diagnostics;
  try {
    const [stdout, stderr] = await Promise.all([readFile(report.artifacts.stdout, 'utf8'), readFile(report.artifacts.stderr, 'utf8')]);
    diagnostics = `${stdout}\n${stderr}`;
  } catch (error) {
    throw new Error(`Diagnostics for run ${id} are unavailable: ${error.message}`);
  }
  process.stdout.write(`${diagnostics.slice(-1024)}\n`);
}

function closed(stream) {
  return new Promise((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });
}

async function run() {
  const { artifactDirectory, command, statusId, failureDetailsId, verbose, timeoutMs } = parseArguments(process.argv.slice(2));
  const directory = path.resolve(artifactDirectory);
  if (statusId) return status(directory, statusId);
  if (failureDetailsId) return failureDetails(directory, failureDetailsId);
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const stdoutPath = path.join(directory, `${id}.stdout.log`);
  const stderrPath = path.join(directory, `${id}.stderr.log`);
  const reportPath = path.join(directory, `${id}.report.json`);
  const statusPath = path.join(directory, `${id}.status.json`);
  const historyPath = path.join(directory, 'history.json');
  const startedAt = Date.now();
  const startTime = new Date(startedAt).toISOString();
  const stdout = createWriteStream(stdoutPath);
  const stderr = createWriteStream(stderrPath);
  await writeAtomic(statusPath, {
    version: 1,
    id,
    state: 'running',
    startedAt,
    elapsedDurationMs: 0,
    currentSuite: command[0],
    completedCounts: null,
    recommendedPollingIntervalMs: 10000,
    timingHistory: 'no compatible completed history',
  });
  const child = spawn(command[0], command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
  let timedOut = false;
  let interruptedBy = null;
  const interrupt = signal => {
    interruptedBy ??= signal;
    child.kill('SIGTERM');
  };
  process.once('SIGINT', interrupt.bind(null, 'SIGINT'));
  process.once('SIGTERM', interrupt.bind(null, 'SIGTERM'));
  // Announce only after signal handling is active. Callers use this as the
  // readiness boundary before issuing cancellation.
  console.log(`test run started: ${id}`);
  const timeout = timeoutMs === null ? null : setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
  let outputTail = '';
  child.stdout.on('data', chunk => {
    stdout.write(chunk);
    outputTail = (outputTail + chunk).slice(-64 * 1024);
    if (verbose) process.stdout.write(chunk);
  });
  child.stderr.on('data', chunk => {
    stderr.write(chunk);
    outputTail = (outputTail + chunk).slice(-64 * 1024);
    if (verbose) process.stderr.write(chunk);
  });
  const outputComplete = Promise.all([
    new Promise(resolve => child.stdout.once('end', resolve)),
    new Promise(resolve => child.stderr.once('end', resolve)),
  ]);
  const outcome = await new Promise(resolve => {
    child.once('error', error => {
      stderr.write(`Unable to start test child: ${error.message}\n`);
      resolve({ code: 1, signal: null, error });
    });
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  await outputComplete;
  const writes = Promise.all([closed(stdout), closed(stderr)]);
  stdout.end(); stderr.end();
  await writes;
  const endedAt = Date.now();
  const compatibility = JSON.stringify({ command, node: process.version, platform: process.platform, architecture: process.arch });
  const history = await readJsonOr(historyPath, { version: 1, completed: [] });
  const compatible = history.completed.filter(entry => entry.compatibility === compatibility && Number.isFinite(entry.wallDurationMs));
  const recommendedPollingIntervalMs = compatible.length ? Math.max(10000, Math.min(60000, Math.round(median(compatible.map(entry => entry.wallDurationMs)) / 4))) : 10000;
  const timingHistory = compatible.length ? 'compatible completed history' : 'no compatible completed history';
  const report = {
    version: 1,
    id,
    outcome: outcome.code === 0 && !interruptedBy ? 'passed' : timedOut ? 'timed-out' : interruptedBy || outcome.signal ? 'interrupted' : 'failed',
    exitCode: outcome.code,
    signal: outcome.signal,
    startTime,
    endTime: new Date(endedAt).toISOString(),
    wallDurationMs: endedAt - startedAt,
    suites: [{ command, outcome: outcome.code === 0 ? 'passed' : 'failed', wallDurationMs: endedAt - startedAt, counts: nodeTestCounts(outputTail) }],
    artifacts: { stdout: stdoutPath, stderr: stderrPath },
    recommendedPollingIntervalMs,
    timingHistory,
    failure: outcome.error ? { message: outcome.error.message } : interruptedBy ? { message: `Test run canceled by ${interruptedBy}` } : null,
  };
  await writeAtomic(reportPath, report);
  if (report.outcome === 'passed') {
    history.completed.push({ compatibility, wallDurationMs: report.wallDurationMs, completedAt: report.endTime });
    history.completed = history.completed.slice(-100);
    await writeAtomic(historyPath, history);
  }
  await writeAtomic(statusPath, {
    version: 1,
    id,
    state: 'completed',
    elapsedDurationMs: report.wallDurationMs,
    currentSuite: null,
    completedCounts: null,
    recommendedPollingIntervalMs,
    timingHistory,
  });
  console.log(`test run ${report.outcome}: ${id}`);
  console.log(`stdout: ${stdoutPath}`);
  console.log(`stderr: ${stderrPath}`);
  console.log(`report: ${reportPath}`);
  if (outcome.signal) console.log(`signal: ${outcome.signal}`);
  process.exitCode = interruptedBy ? 128 + ({ SIGINT: 2, SIGTERM: 15 }[interruptedBy] ?? 1) : outcome.code ?? 1;
}

run().catch(error => {
  console.error(`test runner failed: ${error.message}`);
  process.exitCode = 1;
});
