import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Workspaces, comparisonKey, recentComparisons } from '../src/host/workspaces.mjs';

test('identity uses ordered paths and resolved revisions, not aliases or contents', () => {
  const tree = (ref, label) => ({ source: { kind: 'git', repo: '/repo', path: 'file', ref }, revision: { id: ref, labels: [label] } });
  const pair = { left: tree('a'.repeat(40), 'main'), right: tree('b'.repeat(40), 'release') };
  assert.equal(comparisonKey(pair), comparisonKey({ ...pair, left: tree('a'.repeat(40), 'tag') }));
  assert.notEqual(comparisonKey(pair), comparisonKey({ ...pair, left: tree('c'.repeat(40), 'main') }));
  assert.notEqual(comparisonKey(pair), comparisonKey({ left: pair.right, right: pair.left }));
  assert.notEqual(comparisonKey(pair), comparisonKey({ ...pair, output: { path: '/out' } }));
});

test('recent comparisons retain ten unique descriptors and move activation to the front', () => {
  let recent = [];
  for (let i = 0; i < 12; i++) recent = recentComparisons(recent, { key: String(i), request: { left: { kind: 'file', path: `/a${i}` }, right: { kind: 'file', path: '/b' } }, label: String(i) });
  assert.equal(recent.length, 10); assert.equal(recent[0].key, '11');
  recent = recentComparisons(recent, recent[5]);
  assert.equal(recent[0].key, '6'); assert.equal(new Set(recent.map(item => item.key)).size, 10);
});

test('workspaces retain pairs, deduplicate reopen, and preserve active work on failed recent open', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-workspaces-'));
  const workspaces = new Workspaces();
  t.after(async () => { workspaces.close(); await rm(dir, { recursive: true, force: true }); });
  const files = ['a', 'b', 'c'].map(name => path.join(dir, name));
  await Promise.all(files.map((file, i) => writeFile(file, String(i))));
  const source = file => ({ kind: 'file', path: file });
  await workspaces.open({ left: source(files[0]), right: source(files[1]) });
  const first = workspaces.active.id;
  await workspaces.load('right', source(files[2]));
  assert.equal(workspaces.records.size, 2);
  assert.notEqual(workspaces.active.id, first);
  await workspaces.open({ left: source(files[0]), right: source(files[1]) });
  assert.equal(workspaces.active.id, first);
  assert.equal(workspaces.records.size, 2);
  await assert.rejects(workspaces.open({ left: source('/missing/diffgusting'), right: source(files[1]) }), /ENOENT/);
  assert.equal(workspaces.active.id, first);
  assert.equal((await workspaces.read(files[2])).text, '2');
});

test('concurrent source selection creates one folder comparison and retains explicit revision pairs', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-workspace-revisions-'));
  let recent;
  const workspaces = new Workspaces({}, () => {}, entry => { recent = entry; });
  t.after(async () => { workspaces.close(); await rm(dir, { recursive: true, force: true }); });
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await mkdir(left); await mkdir(right);
  await writeFile(path.join(left, 'file'), 'left'); await writeFile(path.join(right, 'file'), 'right');
  await Promise.all([workspaces.load('left', { kind: 'file', path: left }), workspaces.load('right', { kind: 'file', path: right })]);
  assert.equal(workspaces.records.size, 1);
  const git = (...args) => execFileSync('git', ['-C', left, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '--quiet', '-m', 'first'); const first = git('rev-parse', 'HEAD'); git('tag', 'alias');
  await writeFile(path.join(left, 'file'), 'next'); git('add', '.'); git('commit', '--quiet', '-m', 'second'); const second = git('rev-parse', 'HEAD');
  const request = ref => ({ left: { kind: 'git', repo: left, ref, path: '' }, right: { kind: 'file', path: right } });
  await workspaces.open(request(first)); const firstId = workspaces.active.id;
  await workspaces.open(request(second)); assert.notEqual(workspaces.active.id, firstId);
  await workspaces.open(request('alias')); assert.equal(workspaces.active.id, firstId);
  assert.equal(workspaces.records.size, 3);
  const saved = structuredClone(recent.request);
  assert.equal(saved.left.ref, first);
  workspaces.remove(firstId); git('tag', '-f', 'alias', second);
  await workspaces.open(saved); assert.equal(workspaces.active.session.current.left.source.ref, first);
  const restored = workspaces.active.id;
  await assert.rejects(workspaces.open(request('does-not-exist')), /Git rev-parse failed/);
  assert.equal(workspaces.active.id, restored);
});
