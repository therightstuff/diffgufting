import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArguments } from '../src/core/arguments.mjs';
import { readSource, compareTrees, readDisk, saveDisk } from '../src/host/files.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-files-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('CLI parses explicit Git and filesystem sources and rejects ambiguous options', () => {
  const args = parseArguments(['--left-repo', '/repo one', '--left-ref', 'HEAD', '--right', '/file', '--wait']);
  assert.deepEqual(args.left, { kind: 'git', repo: '/repo one', ref: 'HEAD', path: '' });
  assert.equal(args.right.kind, 'file');
  assert.equal(args.wait, true);
  assert.throws(() => parseArguments(['--nonsense']), /Unknown/);
  assert.throws(() => parseArguments(['a']), /two sources/);
});

test('tree comparison reports changed and missing files without following symlinks', async t => {
  const dir = await fixture(t);
  const a = path.join(dir, 'a'); const b = path.join(dir, 'b');
  await mkdir(a); await mkdir(b);
  await writeFile(path.join(a, 'file'), 'before'); await writeFile(path.join(b, 'file'), 'after');
  await writeFile(path.join(b, 'added'), 'new');
  await symlink(a, path.join(a, 'loop'));
  const result = compareTrees(await readSource({ kind: 'file', path: a }), await readSource({ kind: 'file', path: b }));
  assert.equal(result.find(e => e.path === 'file').status, 'changed');
  assert.equal(result.find(e => e.path === 'added').status, 'added');
  assert.equal(result.find(e => e.path === 'loop').left.kind, 'symlink');
});

test('binary and malformed UTF-8 cannot become editable text', async t => {
  const dir = await fixture(t);
  for (const [name, bytes] of [['binary', Buffer.from([0, 1])], ['invalid', Buffer.from([255, 255])]]) {
    const file = path.join(dir, name); await writeFile(file, bytes);
    const state = await readDisk(file);
    assert.equal(state.text, null);
    assert.ok(state.error);
  }
});

test('save preserves CRLF and refuses a changed disk fingerprint', async t => {
  const dir = await fixture(t); const file = path.join(dir, 'file');
  await writeFile(file, 'a\r\nb\r\n');
  const initial = await readDisk(file);
  const saved = await saveDisk(file, 'A\nb\n', initial.fingerprint, initial.format);
  assert.equal(await readFile(file, 'utf8'), 'A\r\nb\r\n');
  await writeFile(file, 'external');
  await assert.rejects(saveDisk(file, 'local', saved.fingerprint, initial.format), /changed externally/i);
  assert.equal(await readFile(file, 'utf8'), 'external');
});

test('missing Git reports an actionable prerequisite while filesystem reads still work', async t => {
  const dir = await fixture(t); const file = path.join(dir, 'file'); await writeFile(file, 'text');
  const previous = process.env.PATH;
  try {
    process.env.PATH = dir;
    await assert.rejects(readSource({ kind: 'git', repo: dir, ref: 'HEAD', path: '' }), /Git is not installed/);
    assert.equal((await readSource({ kind: 'file', path: file })).entries[0].text, 'text');
  } finally { process.env.PATH = previous; }
});
