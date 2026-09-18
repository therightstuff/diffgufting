import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const execute = promisify(execFile);

async function launchedProcesses(fixture) {
  const { stdout } = await execute('ps', ['-axo', 'pid=,command=']);
  return stdout.split('\n').filter(line => line.includes(fixture) && line.includes('/MacOS/')).map(line => Number(line.trim().split(/\s+/)[0]));
}
async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgufting-cli-'));
  const left = path.join(dir, 'left file.txt'); const right = path.join(dir, 'right file.txt');
  await writeFile(left, 'left'); await writeFile(right, 'right');
  t.after(async () => { for (const pid of await launchedProcesses(dir)) process.kill(pid, 'SIGKILL'); await rm(dir, { recursive: true, force: true }); });
  return { dir, left, right };
}
test('CLI releases terminal after ready and leaves its desktop process alive', { skip: process.platform !== 'darwin' }, async t => {
  const { dir, left, right } = await setup(t);
  const result = await execute(process.execPath, ['bin/diffgufting.mjs', left, right], { timeout: 15000, env: { ...process.env, DIFFGUFTING_SETTINGS_DIR: dir } });
  assert.equal(result.stderr, '');
  const pids = await launchedProcesses(dir); assert.equal(pids.length, 1);
  process.kill(pids[0], 0);
});
test('CLI wait stays attached until the desktop process exits', { skip: process.platform !== 'darwin' }, async t => {
  const { dir, left, right } = await setup(t);
  const child = spawn(process.execPath, ['bin/diffgufting.mjs', left, right, '--wait'], { env: { ...process.env, DIFFGUFTING_SETTINGS_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stderr.on('data', data => { output += data; });
  const exit = new Promise(resolve => child.once('exit', resolve));
  const deadline = Date.now() + 15000; let pids = [];
  while (Date.now() < deadline) {
    pids = await launchedProcesses(dir);
    if (pids.length && child.exitCode === null) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(pids.length, 1, output); assert.equal(child.exitCode, null);
  process.kill(pids[0], 'SIGTERM');
  const code = await exit;
  assert.ok(code === 0 || code === 1, `unexpected exit ${code}: ${output}`);
});
test('CLI reports invalid sources without leaving a desktop process', { skip: process.platform !== 'darwin' }, async t => {
  const { dir, left } = await setup(t);
  await assert.rejects(execute(process.execPath, ['bin/diffgufting.mjs', left, path.join(dir, 'missing')], { timeout: 15000, env: { ...process.env, DIFFGUFTING_SETTINGS_DIR: dir } }), error => error.code === 1 && /ENOENT|no such file/i.test(error.stderr));
  assert.equal((await launchedProcesses(dir)).length, 0);
});
