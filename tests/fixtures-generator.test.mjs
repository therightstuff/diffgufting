import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateFixture } from '../scripts/generate-comparison-fixtures.mjs';

test('fixture generator creates deterministic versioned folder manifests', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await generateFixture({ root, seed: 7, scale: 3 });
  const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));

  assert.equal(manifest.version, 1);
  assert.equal(manifest.seed, 7);
  assert.equal(manifest.entries.length, 3);
  assert.deepEqual(manifest.entries.map(entry => entry.status), ['equal', 'changed', 'added']);
  assert.deepEqual(manifest.textCases.map(entry => entry.name), ['repeated-lines', 'unicode', 'multiline-shift']);
});
