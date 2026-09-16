import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd() });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function start(command, args) {
  const child = spawn(command, args, { cwd: process.cwd() });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  return {
    child,
    result: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal, get stdout() { return stdout; }, get stderr() { return stderr; } }));
    }),
    output: () => stdout,
  };
}

test('test wrapper stores noisy child output and returns a bounded summary', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const result = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', "console.log('noisy output '.repeat(2000))",
  ]);

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /noisy output/);
  const artifact = /stdout: (.+)/.exec(result.stdout)?.[1];
  assert.ok(artifact, `Expected stdout artifact path in ${result.stdout}`);
  assert.match(await readFile(artifact, 'utf8'), /noisy output/);
});

test('test wrapper writes a terminal report with outcome and elapsed time', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const result = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', "console.error('failure detail'); process.exit(3)",
  ]);

  assert.equal(result.code, 3);
  const reportPath = /report: (.+)/.exec(result.stdout)?.[1];
  assert.ok(reportPath, `Expected report path in ${result.stdout}`);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.outcome, 'failed');
  assert.equal(report.exitCode, 3);
  assert.ok(Number.isFinite(report.wallDurationMs));
  assert.ok(report.endTime >= report.startTime);
  assert.equal(report.artifacts.stderr, path.join(artifacts, `${report.id}.stderr.log`));
});

test('test wrapper records Node test counts without printing test output', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const result = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', "console.log('ℹ pass 1\\nℹ fail 0\\nℹ cancelled 0\\nℹ skipped 0\\nℹ todo 0')",
  ]);

  const reportPath = /report: (.+)/.exec(result.stdout)?.[1];
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.deepEqual(report.suites[0].counts, { passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
});

test('test wrapper returns compact status without replaying diagnostics', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const completed = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', "console.error('private diagnostic');",
  ]);
  const id = /test run passed: (.+)/.exec(completed.stdout)?.[1];
  assert.ok(id, `Expected run identity in ${completed.stdout}`);
  const status = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--status', id]);

  assert.equal(status.code, 0);
  assert.doesNotMatch(status.stdout, /private diagnostic/);
  const value = JSON.parse(status.stdout);
  assert.equal(value.id, id);
  assert.equal(value.state, 'completed');
  assert.equal(value.recommendedPollingIntervalMs, 10000);
});

test('test wrapper records compatible timing history for later status queries', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const command = [process.execPath, '-e', ''];
  await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', ...command]);
  const later = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', ...command]);
  const id = /test run passed: (.+)/.exec(later.stdout)?.[1];
  const status = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--status', id]);

  assert.equal(JSON.parse(status.stdout).timingHistory, 'compatible completed history');
});

test('test wrapper exposes running status before its child completes', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const running = start(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', 'setTimeout(() => {}, 200)',
  ]);
  let id;
  for (let attempt = 0; attempt < 10 && !id; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 25));
    id = /test run started: (.+)/.exec(running.output())?.[1];
  }
  assert.ok(id, `Expected run identity in ${running.output()}`);
  const status = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--status', id]);

  const value = JSON.parse(status.stdout);
  assert.equal(value.state, 'running');
  assert.ok(value.elapsedDurationMs > 0);
  await running.result;
});

test('test wrapper exposes child output only when verbose mode is selected', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const result = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--verbose', '--', process.execPath, '-e', "console.log('selected diagnostic')",
  ]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /selected diagnostic/);
});

test('test wrapper returns scoped failure diagnostics from run artifacts', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const failed = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', "console.error('selected failure'); process.exit(1)",
  ]);
  const id = /test run failed: (.+)/.exec(failed.stdout)?.[1];
  const details = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--failure-details', id]);

  assert.equal(details.code, 0);
  assert.match(details.stdout, /selected failure/);
});

test('test wrapper writes a failed report when the child cannot be spawned', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const result = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', 'definitely-not-a-command',
  ]);

  assert.equal(result.code, 1);
  const reportPath = /report: (.+)/.exec(result.stdout)?.[1];
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.outcome, 'failed');
  assert.match(report.failure.message, /definitely-not-a-command/);
});

test('test wrapper records timed-out children', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const result = await run(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--timeout-ms', '20', '--', process.execPath, '-e', 'setTimeout(() => {}, 500)',
  ]);
  const reportPath = /report: (.+)/.exec(result.stdout)?.[1];
  const report = JSON.parse(await readFile(reportPath, 'utf8'));

  assert.equal(result.code, 1);
  assert.equal(report.outcome, 'timed-out');
});

test('test wrapper records cancellation and preserves its terminal report', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const running = start(process.execPath, [
    'scripts/test-runner.mjs', '--artifact-dir', artifacts, '--', process.execPath, '-e', 'setTimeout(() => {}, 500)',
  ]);
  for (let attempt = 0; attempt < 10 && !/test run started:/.test(running.output()); attempt++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.match(running.output(), /test run started:/);
  running.child.kill('SIGINT');
  const result = await running.result;
  assert.equal(result.code, 130);
  const reportPath = /report: (.+)/.exec(result.stdout)?.[1];
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.outcome, 'interrupted');
  assert.match(report.failure.message, /SIGINT/);
});

test('test wrapper reports missing and corrupt status artifacts without replaying logs', async t => {
  const artifacts = await mkdtemp(path.join(tmpdir(), 'diffgusting-test-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const missing = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--status', 'missing']);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /unavailable or corrupt/);
  await writeFile(path.join(artifacts, 'bad.status.json'), '{not json');
  const corrupt = await run(process.execPath, ['scripts/test-runner.mjs', '--artifact-dir', artifacts, '--status', 'bad']);
  assert.equal(corrupt.code, 1);
  assert.match(corrupt.stderr, /unavailable or corrupt/);
});

test('project test entrypoints use the shared test wrapper', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(packageJson.scripts.test, /scripts\/test-runner\.mjs/);
  assert.match(packageJson.scripts['test:desktop'], /scripts\/test-runner\.mjs/);
  assert.match(packageJson.scripts['test:focused'], /scripts\/test-runner\.mjs/);
  assert.match(packageJson.scripts['test:performance'], /scripts\/test-runner\.mjs/);
  assert.match(packageJson.scripts['test:stress'], /scripts\/test-runner\.mjs/);
});
