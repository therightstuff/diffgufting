import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Workspaces, comparisonKey, groupKey, recentComparisons } from '../src/host/workspaces.mjs';

async function creationFixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-creation-'));
  const workspaces = new Workspaces();
  t.after(async () => { workspaces.close(); await rm(dir, { recursive: true, force: true }); });
  const left = { kind: 'file', path: path.join(dir, 'left') }; const right = { kind: 'file', path: path.join(dir, 'right') };
  await writeFile(left.path, 'left'); await writeFile(right.path, 'right');
  return { workspaces, dir, left, right };
}

test('drafts reject mismatched types and duplicate submission activates one member', async t => {
  const { workspaces: w, dir, left, right } = await creationFixture(t);
  await w.newDraft(); await w.load('left', left);
  assert.equal((await w.loadSelected('')).left.text, 'left');
  await mkdir(path.join(dir, 'folder'));
  await assert.rejects(w.load('right', { kind: 'file', path: path.join(dir, 'folder') }), /Choose a file/);
  await assert.rejects(w.submitDraft(), /ready/);
  await w.load('right', right); await w.submitDraft(); const id = w.active.id;
  await w.newDraft(); await Promise.all([w.load('left', left), w.load('right', right)]);
  assert.equal(w.records.size, 1); await Promise.all([w.submitDraft(), w.submitDraft()]);
  assert.equal(w.active.id, id); assert.equal(w.records.size, 1);
  await assert.rejects(w.load('right', { kind: 'file', path: path.join(dir, 'folder') }), /cannot contain/);
  assert.equal(w.active.id, id);
  await w.newDraft(); await w.load('left', left); const old = w.active.session;
  await w.setDraftType('folder'); assert.equal(old.closed, true); assert.equal(w.active.session.source('left').status, 'empty');
  await w.newDraft(); assert.equal(w.snapshot().type, 'file');
});

test('New retains loaded drafts for activation, submission, and explicit closure', async t => {
  const { workspaces: w, left, right } = await creationFixture(t);
  await w.newDraft(); await w.load('left', left); const first = w.active;
  await w.newDraft(); assert.equal(first.session.closed, false);
  assert.equal(w.list()[0].id, first.id);
  await w.load('right', right); const second = w.active;
  w.activate(first.id); assert.equal(second.session.closed, false);
  assert.equal((await w.loadSelected('')).left.text, 'left');
  await w.load('right', right); await w.submitDraft();
  assert.equal(w.records.size, 1); assert.equal(w.drafts.has(first.id), false);
  w.activate(second.id); await w.load('left', left); await w.submitDraft();
  assert.equal(w.active.id, first.id); assert.equal(second.session.closed, true);
  assert.equal(w.drafts.size, 0); assert.equal(w.list().length, 1);
  await w.newDraft(); await w.load('left', left); const retained = w.active;
  await w.newDraft(); w.activate(retained.id); w.remove(retained.id);
  assert.equal(retained.session.closed, true); assert.equal(w.active.id, first.id);
});

test('initiated comparisons are listed immediately and completed source changes retain group history and labels', async t => {
  const { workspaces: w, left, right } = await creationFixture(t);
  const events = []; w.emit = event => { if (event.type === 'workspace') events.push(event); };
  await w.newDraft(); const original = w.active;
  const loading = w.load('left', left);
  await loading;
  assert.equal(w.list()[0]?.id, original.id, 'Selecting a source must list the active comparison');
  assert.ok(events.some(event => event.workspace.sources.left.status === 'loading' && event.comparisons.some(item => item.id === original.id)), 'The entry must appear during loading');
  assert.match(w.groupList()[0].members[0].label, /left/);
  await w.load('right', right);
  assert.match(w.groupList()[0].members[0].label, /left.*right/);
  await w.load('right', left); const changed = w.active;
  assert.notEqual(changed.id, original.id, 'Changing a ready pair must create a separate comparison');
  assert.equal(changed.group, original.group);
  assert.equal(w.groupList().length, 1); assert.equal(w.groupList()[0].canBack, true);
  assert.equal(w.groupList()[0].current, changed.id);
  assert.equal(w.back().id, original.id); assert.equal(w.groupList()[0].canForward, true);
  assert.match(w.groupList()[0].members.find(item => item.id === w.groupList()[0].current).label, /left.*right/);
  assert.equal(w.forward().id, changed.id);
});

test('a related comparison enters group history before its sources finish loading', async t => {
  const { workspaces: w, left, right } = await creationFixture(t);
  await w.open({ left, right }); const original = w.active;
  const replacement = w.load('right', left);
  const group = w.groupList().find(item => item.key === original.group);
  assert.equal(group?.canBack, true);
  assert.equal(group?.current, w.active.id);
  assert.notEqual(w.active.id, original.id);
  await replacement;
});

test('a failed pending replacement restores its prior group member', async t => {
  const { workspaces: w, dir, left, right } = await creationFixture(t);
  const folder = path.join(dir, 'folder'); await mkdir(folder);
  await w.open({ left, right }); const original = w.active;
  await assert.rejects(w.load('right', { kind: 'file', path: folder }), /cannot contain/);
  assert.equal(w.active.id, original.id);
  assert.equal(w.groupList()[0].current, original.id);
  assert.equal(w.groupList()[0].members.length, 1);
});

test('a replacement generation and New prevent obsolete loads from registering', async t => {
  const { workspaces: w, left, right } = await creationFixture(t);
  await w.newDraft();
  const pending = assert.rejects(w.load('left', left), /canceled/);
  await w.load('left', right); await pending;
  assert.equal(w.active.session.source('left').tree.entries[0].text, 'right');
  const opening = assert.rejects(w.open({ left, right }), /canceled/);
  await w.newDraft(); await opening; assert.equal(w.records.size, 0);
  await w.open({ left, right }); const current = w.active;
  const canceled = assert.rejects(w.open({ left: right, right: left }), /canceled/);
  w.cancelOpening(current.session); await canceled;
  assert.equal(w.active, current); assert.equal(w.records.size, 1);
});

test('group visits truncate forward navigation without closing members and closure prefers the prior visit', async t => {
  const { workspaces: w, left, right, dir } = await creationFixture(t);
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const commits = [];
  for (const value of ['A', 'B', 'C', 'D']) { await writeFile(left.path, value); git('add', '.'); git('commit', '--quiet', '-m', value); commits.push(git('rev-parse', 'HEAD')); }
  const request = ref => ({ left: { kind: 'git', repo: dir, path: 'left', ref }, right });
  const ids = [];
  for (const ref of commits.slice(0, 3)) { await w.open(request(ref)); ids.push(w.active.id); }
  assert.equal(w.groups.size, 1); assert.equal(w.back().id, ids[1]);
  await w.open(request(commits[3])); const last = w.active.id;
  assert.equal(w.records.size, 4); assert.equal(w.forward().id, last);
  w.activate(last); assert.equal(w.back().id, ids[1]); assert.equal(w.back().id, ids[0]);
  w.forward(); w.remove(ids[1]); assert.equal(w.active.id, ids[0]);
  assert.equal(w.forward().id, last);
  await assert.rejects(w.selectCommit('left', w.active.session.source('left').generation, 'missing'), /Git/);
  assert.equal(w.active.id, last);
  await assert.rejects(w.selectCommit('left', 1, commits[0], 'obsolete-owner'), /no longer active/);
  for (const id of [...w.records.keys()]) w.remove(id);
  assert.equal(w.active, null); assert.equal(w.groups.size, 0);
});

test('canonical locations group working and snapshots but separate worktrees, types, sides, and merge scopes', async t => {
  const { workspaces: w, left, right, dir } = await creationFixture(t);
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '--quiet', '-m', 'initial'); const first = git('rev-parse', 'HEAD'); git('tag', '-a', 'release', '-m', 'release');
  await w.newDraft(); await w.load('left', left); await w.load('right', right); await w.submitDraft(); const working = w.active.id;
  const snap = { kind: 'git', repo: dir, path: 'left', ref: 'release', directory: false };
  await w.open({ left: snap, right }); const historical = w.active.id;
  assert.equal(w.groups.size, 1); assert.notEqual(working, historical);
  await w.open({ left: { ...snap, repo: await realpath(dir), ref: first }, right: { ...right, path: await realpath(right.path) } });
  assert.equal(w.active.id, historical); assert.equal(w.records.size, 2);
  const subdirectory = path.join(dir, 'subdirectory'); await mkdir(subdirectory);
  await w.open({ left: { ...snap, repo: subdirectory, ref: first }, right });
  assert.equal(w.active.id, historical); assert.equal(w.groups.size, 1);
  await w.selectWorking('left', w.active.session.source('left').generation); assert.equal(w.active.id, working);
  await w.open({ left: right, right: left }); const other = w.active.id; assert.equal(w.groups.size, 2);
  w.activate(historical); assert.equal(w.back().id, working);
  w.activate(other); assert.equal(w.back().id, other); w.activate(working); assert.equal(w.forward().id, historical);
  const linked = path.join(dir, 'linked'); git('worktree', 'add', '--quiet', '-b', 'linked-test', linked);
  await w.open({ left: { ...snap, repo: linked }, right }); assert.equal(w.groups.size, 3);
  await w.open({ left, right, base: left, output: path.join(dir, 'result') }); const mergeGroup = w.active.group;
  await w.open({ left: snap, right, base: left, output: path.join(dir, 'result') }); assert.equal(w.active.group, mergeGroup);
  await w.open({ left, right, base: right, output: path.join(dir, 'other-result') }); assert.notEqual(w.active.group, mergeGroup);
  assert.notEqual(groupKey({ left: { source: left, directory: false }, right: { source: right } }), groupKey({ left: { source: left, directory: true }, right: { source: right } }));
});

test('absent historical file and folder sources retain their declared types on New', async t => {
  const { workspaces: w, dir, left } = await creationFixture(t);
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '--quiet', '-m', 'initial');
  await w.newDraft();
  const absent = { kind: 'git', repo: dir, path: 'absent', ref: 'HEAD', directory: true };
  await assert.rejects(w.load('left', absent), /Choose a file/);
  await w.load('left', { ...absent, directory: false }); await w.load('right', left); await w.submitDraft();
  assert.equal(w.active.type, 'file'); assert.equal(w.active.session.current.left.entries[0].missing, true);
  await w.newDraft('folder'); await w.load('left', absent); await w.load('right', { kind: 'file', path: dir }); await w.submitDraft();
  assert.equal(w.active.type, 'folder'); assert.equal(w.active.session.current.left.directory, true);
});

test('submitting a draft starts watching its selected roots and closure releases them', async t => {
  const { workspaces: w, left, right } = await creationFixture(t);
  await w.newDraft(); await w.load('left', left); await w.load('right', right); await w.submitDraft();
  const session = w.active.session;
  assert.ok(session.watchers.length > 0, 'Submitted sources must be watched, even though New started empty');
  const observed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Submitted comparison did not observe a source change')), 5000);
    const stop = session.subscribe(event => { if (event.type === 'comparison' && event.result.rows[0]?.status === 'equal') { clearTimeout(timer); stop(); resolve(); } });
  });
  await writeFile(right.path, 'left'); await observed;
  w.remove(w.active.id); assert.equal(session.closed, true); assert.equal(w.records.size, 0);
});

test('path replacements stay in their origin group even when the exact pair exists elsewhere, and New retains every member', async t => {
  const { workspaces: w, left, right, dir } = await creationFixture(t);
  const other = { kind: 'file', path: path.join(dir, 'other') }; await writeFile(other.path, 'other');
  await w.open({ left, right }); const original = w.active;
  await w.open({ left, right: other }); const independent = w.active;
  w.activate(original.id); await w.load('right', other); const replacement = w.active;
  assert.equal(replacement.group, original.group); assert.notEqual(replacement.id, independent.id);
  assert.equal(w.groups.size, 2); assert.equal(w.records.size, 3);
  assert.equal(w.groupList().find(group => group.key === original.group).current, replacement.id);
  assert.equal(w.back().id, original.id); assert.equal(w.forward().id, replacement.id);
  await w.newDraft();
  assert.equal(original.session.closed, false); assert.equal(replacement.session.closed, false);
  assert.equal(w.groupList().find(group => group.key === original.group).current, replacement.id);
  w.activate(replacement.id); await w.load('right', right);
  assert.equal(w.active.id, original.id); assert.equal(w.records.size, 3);
  await assert.rejects(w.load('right', { kind: 'file', path: path.join(dir, 'missing') }), /ENOENT/);
  assert.equal(w.active.id, original.id);
});

test('folder path replacement retains group and type across New', async t => {
  const { workspaces: w, dir } = await creationFixture(t);
  const folders = ['a', 'b', 'c'].map(name => ({ kind: 'file', path: path.join(dir, name) }));
  for (const folder of folders) { await mkdir(folder.path); await writeFile(path.join(folder.path, 'file.txt'), folder.path); }
  await w.open({ left: folders[0], right: folders[1] }); const original = w.active;
  await w.load('left', folders[2]); const changed = w.active;
  assert.equal(changed.type, 'folder'); assert.equal(changed.group, original.group); assert.equal(w.groups.size, 1);
  await w.newDraft(); w.activate(changed.id); assert.equal(w.back().id, original.id);
});

test('identity uses ordered paths and resolved revisions, not aliases or contents', () => {
  const tree = (ref, label) => ({ source: { kind: 'git', repo: '/repo', path: 'file', ref }, revision: { id: ref, labels: [label] } });
  const pair = { left: tree('a'.repeat(40), 'main'), right: tree('b'.repeat(40), 'release') };
  assert.equal(comparisonKey(pair), comparisonKey({ ...pair, left: tree('a'.repeat(40), 'tag') }));
  assert.notEqual(comparisonKey(pair), comparisonKey({ ...pair, left: tree('c'.repeat(40), 'main') }));
  assert.notEqual(comparisonKey(pair), comparisonKey({ left: pair.right, right: pair.left }));
  assert.notEqual(comparisonKey(pair), comparisonKey({ ...pair, output: { path: '/out' } }));
});

test('group identity retains ordered canonical locations while ignoring revision aliases', () => {
  const tree = (ref, label) => ({ source: { kind: 'git', repo: '/repo', path: 'file', ref }, revision: { id: ref, labels: [label] } });
  const working = { source: { kind: 'file', path: '/repo/file' }, repository: { repo: '/repo' } };
  const snapshot = tree('a'.repeat(40), 'main');
  const otherSnapshot = tree('b'.repeat(40), 'release');
  const right = { source: { kind: 'file', path: '/right' } };
  assert.equal(groupKey({ left: working, right }), groupKey({ left: snapshot, right }));
  assert.equal(groupKey({ left: snapshot, right }), groupKey({ left: otherSnapshot, right }));
  assert.notEqual(groupKey({ left: snapshot, right }), groupKey({ left: right, right: snapshot }));
  assert.notEqual(groupKey({ left: snapshot, right }), groupKey({ left: snapshot, right, output: { path: '/out' } }));
});

test('recent comparisons retain ten unique descriptors and move activation to the front', () => {
  let recent = [];
  for (let i = 0; i < 12; i++) recent = recentComparisons(recent, { key: String(i), request: { left: { kind: 'file', path: `/a${i}` }, right: { kind: 'file', path: '/b' } }, label: String(i) });
  assert.equal(recent.length, 10); assert.equal(recent[0].key, '11');
  recent = recentComparisons(recent, recent[5]);
  assert.equal(recent[0].key, '6'); assert.equal(new Set(recent.map(item => item.key)).size, 10);
});

test('drafts load independently and only register on explicit submission', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-workspaces-'));
  const workspaces = new Workspaces();
  t.after(async () => { workspaces.close(); await rm(dir, { recursive: true, force: true }); });
  const files = ['a', 'b', 'c'].map(name => path.join(dir, name));
  await Promise.all(files.map((file, i) => writeFile(file, String(i))));
  const source = file => ({ kind: 'file', path: file });
  await workspaces.open({ left: source(files[0]), right: source(files[1]) });
  const first = workspaces.active.id;
  await workspaces.newDraft();
  await workspaces.load('left', source(files[0]));
  await workspaces.load('right', source(files[2]));
  assert.equal(workspaces.records.size, 1);
  assert.notEqual(workspaces.active.id, first);
  await workspaces.submitDraft();
  assert.equal(workspaces.records.size, 2);
  await workspaces.open({ left: source(files[0]), right: source(files[1]) });
  assert.equal(workspaces.active.id, first);
  assert.equal(workspaces.records.size, 2);
  await assert.rejects(workspaces.open({ left: source('/missing/diffgusting'), right: source(files[1]) }), /ENOENT/);
  assert.equal(workspaces.active.id, first);
  assert.equal((await workspaces.read(files[2])).text, '2');
});

test('draft submission creates one folder comparison and retains explicit revision pairs', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-workspace-revisions-'));
  let recent;
  const workspaces = new Workspaces({}, () => {}, entry => { recent = entry; });
  t.after(async () => { workspaces.close(); await rm(dir, { recursive: true, force: true }); });
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await mkdir(left); await mkdir(right);
  await writeFile(path.join(left, 'file'), 'left'); await writeFile(path.join(right, 'file'), 'right');
  await Promise.all([workspaces.load('left', { kind: 'file', path: left }), workspaces.load('right', { kind: 'file', path: right })]);
  assert.equal(workspaces.records.size, 0);
  await workspaces.submitDraft();
  assert.equal(workspaces.records.size, 1);
  const git = (...args) => execFileSync('git', ['-C', left, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '--quiet', '-m', 'first'); const first = git('rev-parse', 'HEAD'); git('tag', 'alias');
  await writeFile(path.join(left, 'file'), 'next'); git('add', '.'); git('commit', '--quiet', '-m', 'second'); const second = git('rev-parse', 'HEAD');
  const request = ref => ({ left: { kind: 'git', repo: left, ref, path: '' }, right: { kind: 'file', path: right } });
  await workspaces.open(request(first)); const firstId = workspaces.active.id;
  await workspaces.open(request(second)); assert.notEqual(workspaces.active.id, firstId);
  const secondId = workspaces.active.id;
  assert.equal(workspaces.groupList().length, 2);
  assert.equal(workspaces.back().id, firstId);
  assert.equal(workspaces.forward().id, secondId);
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

test('workspaces enforce the configured aggregate open-comparison limit', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-workspace-limit-'));
  const workspaces = new Workspaces({ openComparisonLimit: 1 });
  t.after(async () => { workspaces.close(); await rm(dir, { recursive: true, force: true }); });
  const files = ['a', 'b', 'c'].map(name => path.join(dir, name));
  await Promise.all(files.map((file, index) => writeFile(file, String(index))));
  await workspaces.open({ left: { kind: 'file', path: files[0] }, right: { kind: 'file', path: files[1] } });
  const closing = workspaces.active.session;
  closing.cache.set('test-cache-entry', 'cached');
  await assert.rejects(
    workspaces.open({ left: { kind: 'file', path: files[0] }, right: { kind: 'file', path: files[2] } }),
    /Open comparison limit \(1\) reached/,
  );
  workspaces.remove(workspaces.active.id);
  assert.equal(workspaces.records.size, 0);
  assert.equal(closing.closed, true);
  assert.equal(closing.cache.bytes, 0);
  assert.equal(closing.watchers.every(watcher => watcher.closed !== false), true);
});
