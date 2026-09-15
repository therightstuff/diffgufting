import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readGitSource, gitLayers, discoverRepository, openHistory } from '../src/host/git.mjs';
import { Session } from '../src/host/session.mjs';

function git(repo, ...args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); }
async function repo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-git-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, 'init', '--quiet'); git(dir, 'config', 'user.name', 'Test'); git(dir, 'config', 'user.email', 'test@example.invalid');
  return dir;
}
test('staged and unstaged reversal remains represented with immutable commit sources', async t => {
  const dir = await repo(t); const file = path.join(dir, 'file');
  await writeFile(file, 'base'); git(dir, 'add', 'file'); git(dir, 'commit', '--quiet', '-m', 'base');
  const base = git(dir, 'rev-parse', 'HEAD');
  await writeFile(file, 'committed'); git(dir, 'add', 'file'); git(dir, 'commit', '--quiet', '-m', 'next');
  await writeFile(file, 'staged'); git(dir, 'add', 'file'); await writeFile(file, 'committed');
  const source = { kind: 'git', repo: dir, ref: '@worktree', path: '' };
  const layers = await gitLayers(source, base);
  assert.deepEqual(layers.map(layer => layer.category), ['committed', 'staged', 'unstaged']);
  assert.equal(layers[1].entries[0].after, 'staged');
  assert.equal(layers[2].entries[0].after, 'committed');
  const snapshot = await readGitSource({ ...source, ref: base });
  assert.equal(snapshot.entries[0].text, 'base');
  assert.equal(snapshot.entries[0].writable, false);
  assert.equal(git(dir, 'show', ':file'), 'staged');
});
test('unborn and untracked source is readable', async t => {
  const dir = await repo(t); await writeFile(path.join(dir, 'new'), 'hello');
  const layers = await gitLayers({ kind: 'git', repo: dir, ref: '@worktree', path: '' }, 'HEAD');
  assert.equal(layers[2].entries[0].untracked, true);
  assert.equal(layers[2].entries[0].after, 'hello');
});
test('cross-repository commits do not need a common ancestor', async t => {
  const sources = [];
  for (const text of ['left', 'right']) {
    const dir = await repo(t); await writeFile(path.join(dir, 'file'), text);
    git(dir, 'add', 'file'); git(dir, 'commit', '--quiet', '-m', text);
    sources.push(await readGitSource({ kind: 'git', repo: dir, ref: 'HEAD', path: 'file' }));
  }
  assert.equal(sources[0].entries[0].text, 'left');
  assert.equal(sources[1].entries[0].text, 'right');
  assert.equal(sources[0].directory, false);
});

test('repository discovery retains selected scope and history pages use immutable commit IDs', async t => {
  const dir = await repo(t); const folder = path.join(dir, 'nested'); const file = path.join(folder, 'file');
  await mkdir(folder); await writeFile(file, 'one'); git(dir, 'add', '.'); git(dir, 'commit', '--quiet', '-m', 'one');
  await writeFile(file, 'two'); git(dir, 'add', '.'); git(dir, 'commit', '--quiet', '-m', 'two');

  const found = await discoverRepository(file);
  assert.equal(path.basename(found.repo), path.basename(dir));
  assert.equal(found.path, 'nested/file');
  const history = await openHistory(found.repo, { pageSize: 1 });
  t.after(() => history.close());
  const first = await history.page(); const second = await history.page(first.cursor);
  assert.equal(first.commits.length, 1);
  assert.match(first.commits[0].id, /^[0-9a-f]{40}$/);
  assert.ok(first.commits[0].refs.includes('HEAD'));
  assert.equal(second.commits.length, 1);
  assert.notEqual(first.commits[0].id, second.commits[0].id);
  const snapshot = await readGitSource({ kind: 'git', repo: found.repo, ref: second.commits[0].id, path: found.path });
  assert.equal(snapshot.entries[0].text, 'one');
  assert.equal(second.cursor, null);
  assert.equal(second.end, true);
});

test('an immutable commit retains an absent selected path as an explicit source', async t => {
  const dir = await repo(t); const file = path.join(dir, 'later');
  await writeFile(path.join(dir, 'initial'), 'one'); git(dir, 'add', '.'); git(dir, 'commit', '--quiet', '-m', 'initial');
  const before = git(dir, 'rev-parse', 'HEAD');
  await writeFile(file, 'two'); git(dir, 'add', 'later'); git(dir, 'commit', '--quiet', '-m', 'later');

  const snapshot = await readGitSource({ kind: 'git', repo: dir, ref: before, path: 'later', directory: false });

  assert.equal(snapshot.directory, false);
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].missing, true);
  assert.equal(snapshot.entries[0].path, '');
});

test('independently selected immutable commits compare without re-resolving a live revision', async t => {
  const dir = await repo(t); const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await writeFile(left, 'one'); await writeFile(right, 'right'); git(dir, 'add', '.'); git(dir, 'commit', '--quiet', '-m', 'one');
  const first = git(dir, 'rev-parse', 'HEAD'); await writeFile(left, 'two'); git(dir, 'add', 'left'); git(dir, 'commit', '--quiet', '-m', 'two');
  const second = git(dir, 'rev-parse', 'HEAD');
  const session = new Session({}); t.after(() => session.close());
  await session.load('left', { kind: 'file', path: left }); await session.load('right', { kind: 'file', path: right });
  session.source('left').repository = await discoverRepository(left);
  session.source('right').repository = await discoverRepository(right);

  await session.selectCommit('left', session.source('left').generation, first);
  await session.selectCommit('right', session.source('right').generation, second);

  assert.equal(session.current.left.entries[0].text, 'one');
  assert.equal(session.current.right.entries[0].text, 'right');
});

test('linked worktree observes index updates and unmerged stages stay read-only', async t => {
  const dir = await repo(t); const file = path.join(dir, 'file');
  await writeFile(file, 'base\n'); git(dir, 'add', 'file'); git(dir, 'commit', '--quiet', '-m', 'base');
  const linked = `${dir}-linked`;
  t.after(() => rm(linked, { recursive: true, force: true }));
  git(dir, 'worktree', 'add', '--quiet', '-b', 'other', linked);
  await writeFile(path.join(linked, 'file'), 'other\n'); git(linked, 'add', 'file'); git(linked, 'commit', '--quiet', '-m', 'other');
  await writeFile(file, 'ours\n'); git(dir, 'add', 'file'); git(dir, 'commit', '--quiet', '-m', 'ours');
  assert.throws(() => git(dir, 'merge', 'other'), /Command failed/);
  for (const [ref, expected] of [['@base', 'base\n'], ['@ours', 'ours\n'], ['@theirs', 'other\n']]) {
    const tree = await readGitSource({ kind: 'git', repo: dir, ref, path: 'file' });
    assert.equal(tree.entries[0].text, expected); assert.equal(tree.entries[0].writable, false);
  }
  await writeFile(path.join(linked, 'file'), 'staged in worktree\n'); git(linked, 'add', 'file');
  const layers = await gitLayers({ kind: 'git', repo: linked, ref: '@worktree', path: '' });
  assert.equal(layers[1].entries[0].after, 'staged in worktree\n');
  assert.equal(git(dir, 'ls-files', '-u').split('\n').length, 3);
});
