import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enumerateWithOpendir, enumerateWithReaddir } from '../scripts/benchmark-enumeration.mjs';
import { runBenchmark } from '../scripts/run-comparison-benchmark.mjs';

test('directory enumeration candidates return the same sorted wide and deep fixture paths', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-enumeration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'deep', 'nested'), { recursive: true });
  await Promise.all(['a', 'b', 'deep/nested/c'].map(file => writeFile(path.join(root, file), file)));
  await mkdir(path.join(root, '.git')); await writeFile(path.join(root, '.git', 'ignored'), 'ignored');
  const [readdirEntries, opendirEntries] = await Promise.all([enumerateWithReaddir(root), enumerateWithOpendir(root)]);
  assert.deepEqual(readdirEntries.map(entry => entry.path).sort(), ['a', 'b', 'deep', 'deep/nested', 'deep/nested/c']);
  assert.deepEqual(opendirEntries.map(entry => entry.path).sort(), readdirEntries.map(entry => entry.path).sort());
  const report = await runBenchmark({ candidates: { readdir: () => enumerateWithReaddir(root), opendir: () => enumerateWithOpendir(root) }, fixture: 'wide-deep-v1', repetitions: 2, warmups: 1 });
  assert.deepEqual(Object.keys(report.samples), ['readdir', 'opendir']);
  assert.ok(report.samples.readdir.every(Number.isFinite));
});
