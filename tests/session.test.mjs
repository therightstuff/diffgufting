import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../src/host/session.mjs';
import { cacheKey } from '../src/host/comparison-cache.mjs';

test('session watches atomic replacements and rejects writes outside selected documents', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-session-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await writeFile(left, 'a'); await writeFile(right, 'b');
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } }, { reconcileMs: 40, watchDebounceMs: 10 });
  t.after(() => session.close());
  const initial = await session.refresh();
  assert.equal(initial.rows[0].status, 'changed');
  const version = await session.read(right);
  await assert.rejects(session.save(path.join(root, 'other'), 'bad', version.fingerprint), /not open/i);
  const next = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No atomic replacement update')), 5000);
    session.subscribe(event => {
      if (event.type === 'disk' && event.path === initial.rows[0].right.absolute && event.state.text === 'external') { clearTimeout(timer); resolve(event); }
    });
  });
  session.start();
  const temporary = path.join(root, 'replacement'); await writeFile(temporary, 'external'); await rename(temporary, right);
  assert.equal((await next).state.text, 'external');
});

test('watching publishes each successive external version of an authorized file', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-successive-watch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await Promise.all([writeFile(left, 'left'), writeFile(right, 'before')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } }, { reconcileMs: 20, watchDebounceMs: 5 });
  t.after(() => session.close()); await session.refresh(); await session.start();
  const versions = []; session.subscribe(event => { if (event.type === 'disk' && event.path === session.current.rows[0].right.absolute) versions.push(event.state.text); });
  await writeFile(right, 'external');
  await new Promise(resolve => setTimeout(resolve, 80));
  await writeFile(right, 'latest');
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(versions[0], 'external');
  assert.equal(versions.at(-1), 'latest');
});

test('new comparison cancels stale worker and closing session rejects outstanding work', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-cancel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await writeFile(left, 'one'); await writeFile(right, 'two');
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } });
  const first = assert.rejects(session.refresh(), /canceled/);
  const latest = await session.refresh();
  await first; assert.equal(latest.rows[0].right.text, 'two');
  const closing = assert.rejects(session.refresh(), /canceled/); session.close(); await closing;
});

test('a source loads independently, authorizes its file, and reports its side state', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-single-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); await writeFile(left, 'only left');
  const session = new Session({}, { reconcileMs: 40, watchDebounceMs: 10 });
  t.after(() => session.close());
  const events = [];
  session.subscribe(event => events.push(event));

  const source = await session.load('left', { kind: 'file', path: left });

  assert.equal(source.status, 'ready');
  assert.equal(source.tree.entries[0].text, 'only left');
  assert.equal((await session.read(left)).text, 'only left');
  assert.equal(events.at(-1).type, 'source');
  assert.equal(events.at(-1).side, 'left');
  assert.equal(events.at(-1).source.status, 'ready');
});

test('folder loading publishes metadata inventory before content completion', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-inventory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'file'), 'contents');
  const session = new Session({}); t.after(() => session.close());
  const events = []; session.subscribe(event => events.push(event));

  await session.load('left', { kind: 'file', path: root });
  assert.equal(events.find(event => event.type === 'source-inventory')?.inventory.entries[0].path, 'file');
});

test('folder inventory is delivered in configured bounded batches', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-inventory-batches-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(['a', 'b', 'c'].map(name => writeFile(path.join(root, name), name)));
  const session = new Session({}, { inventoryBatchSize: 2 }); t.after(() => session.close());
  const events = []; session.subscribe(event => events.push(event));
  await session.load('left', { kind: 'file', path: root });
  const inventoryEvents = events.filter(event => event.type === 'source-inventory');
  assert.equal(inventoryEvents.length, 2);
  assert.ok(inventoryEvents.every(event => event.inventory.entries.length <= 2));
  assert.deepEqual(inventoryEvents.flatMap(event => event.inventory.entries.map(entry => entry.path)), ['a', 'b', 'c']);
  assert.deepEqual(inventoryEvents.map(event => event.inventory.offset), [0, 2]);
  assert.deepEqual(session.source('left').inventory.entries.map(entry => entry.path), ['a', 'b', 'c']);
  assert.equal(inventoryEvents.at(-1).inventory.complete, true);
});

test('replacing a folder during inventory delivery cancels its remaining batches', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-inventory-cancel-'));
  const replacement = path.join(root, 'replacement'); await mkdir(replacement);
  await writeFile(path.join(replacement, 'current'), 'current');
  await Promise.all(Array.from({ length: 100 }, (_, index) => writeFile(path.join(root, String(index)), 'old')));
  const session = new Session({}, { inventoryBatchSize: 2 });
  t.after(async () => { session.close(); await rm(root, { recursive: true, force: true }); });
  const events = []; let switched = false; let next;
  session.subscribe(event => {
    events.push(event);
    if (event.type === 'source-inventory' && !switched) {
      switched = true;
      next = session.load('left', { kind: 'file', path: replacement });
    }
  });
  await assert.rejects(session.load('left', { kind: 'file', path: root }), /canceled/);
  await next;
  const start = events.findIndex(event => event.type === 'source' && event.generation === 2);
  assert.ok(start >= 0);
  assert.ok(events.slice(start).filter(event => event.type === 'source-inventory').every(event => event.generation === 2));
  assert.deepEqual(session.source('left').inventory.entries.map(entry => entry.path), ['current']);
});

test('comparison cache eviction never releases an authorized dirty document', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-cache-document-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await Promise.all([writeFile(left, 'left'), writeFile(right, 'right')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } }, { comparisonCacheBytes: 32 });
  t.after(() => session.close());
  await session.refresh();
  const state = await session.read(right);
  session.cache.clear();
  const saved = await session.save(right, 'edited', state.fingerprint, state.format);
  assert.equal(saved.text, 'edited');
  assert.equal((await session.read(right)).text, 'edited');
});

test('ready compatible sources compare automatically while incompatible sources stay ready', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-source-pair-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right'); const folder = path.join(root, 'folder');
  await writeFile(left, 'before'); await writeFile(right, 'after'); await mkdir(folder);
  const session = new Session({}); t.after(() => session.close());

  await session.load('left', { kind: 'file', path: left });
  await session.load('right', { kind: 'file', path: right });
  assert.equal(session.current.rows[0].status, 'changed');

  await session.load('right', { kind: 'file', path: folder });
  assert.equal(session.source('left').status, 'ready');
  assert.equal(session.source('right').status, 'ready');
  assert.match(session.comparisonError, /file and a directory/i);
});

test('scoped reconciliation refreshes an externally changed entry without reloading its source', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-scoped-reconcile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await mkdir(left); await mkdir(right);
  await Promise.all([writeFile(path.join(left, 'changed'), 'before'), writeFile(path.join(right, 'changed'), 'before'), writeFile(path.join(left, 'stable'), 'same'), writeFile(path.join(right, 'stable'), 'same')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } });
  t.after(() => session.close());
  await session.refresh();
  const sourceGeneration = session.source('left').generation;
  let calculations = 0; const calculate = session.calculate.bind(session); session.calculate = async () => { calculations++; return calculate(); };
  const events = []; session.subscribe(event => events.push(event));
  await writeFile(path.join(left, 'changed'), 'after');
  await session.reconcilePath(path.join(left, 'changed'));
  assert.equal(events.find(event => event.type === 'disk')?.state.text, 'after');
  await writeFile(path.join(left, 'changed'), 'latest');
  await session.reconcilePath(path.join(left, 'changed'));
  assert.deepEqual(events.filter(event => event.type === 'disk').map(event => event.state.text), ['after', 'latest']);
  assert.equal(session.source('left').generation, sourceGeneration);
  assert.equal(calculations, 0, 'a known content event must not rediff unrelated files');
  assert.equal(session.current.rows.find(row => row.path === 'changed').status, 'changed');
  assert.equal(session.current.rows.find(row => row.path === 'stable').status, 'equal');
});

test('reconciliation updates topology for added, deleted, renamed, and atomically replaced entries', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-topology-reconcile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await mkdir(left); await mkdir(right);
  await Promise.all([writeFile(path.join(left, 'old'), 'same'), writeFile(path.join(right, 'old'), 'same')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } });
  t.after(() => session.close());
  await session.refresh();
  await writeFile(path.join(left, 'added'), 'new');
  await session.reconcilePath(path.join(left, 'added'), 'rename');
  assert.equal(session.current.rows.find(row => row.path === 'added').status, 'removed');
  await rename(path.join(left, 'old'), path.join(left, 'renamed'));
  await session.reconcilePath(path.join(left, 'old'), 'rename');
  await session.reconcilePath(path.join(left, 'renamed'), 'rename');
  assert.equal(session.current.rows.find(row => row.path === 'old').status, 'added');
  const replacement = path.join(left, 'replacement'); await writeFile(replacement, 'changed'); await rename(replacement, path.join(left, 'renamed'));
  await session.reconcilePath(path.join(left, 'renamed'));
  assert.equal(session.current.rows.find(row => row.path === 'renamed').status, 'removed');
});

test('root reconciliation covers watchers without filenames and falls back to periodic refresh after watcher failure', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-root-reconcile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await Promise.all([writeFile(left, 'before'), writeFile(right, 'before')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } });
  t.after(() => session.close());
  await session.refresh();
  await writeFile(left, 'after');
  await session.reconcilePath(left, 'rename');
  assert.equal(session.current.rows[0].status, 'changed');
  session.watchUnavailable = true;
  await writeFile(right, 'after');
  await session.poll();
  assert.equal(session.current.rows[0].status, 'equal');
});

test('selected-entry loading returns authorized current text and hunks', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-selected-entry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  await Promise.all([writeFile(left, 'left'), writeFile(right, 'right changed')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } });
  t.after(() => session.close());
  await session.refresh();
  const row = await session.loadSelected('');
  assert.equal(row.left.text, 'left'); assert.equal(row.right.text, 'right changed'); assert.ok(row.hunks.length);
});

test('selected lazy work does not materialize unrelated folder entry text', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgusting-lazy-isolation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = path.join(root, 'left'); const right = path.join(root, 'right'); await Promise.all([mkdir(left), mkdir(right)]);
  await Promise.all([writeFile(path.join(left, 'chosen'), 'left'), writeFile(path.join(right, 'chosen'), 'right'), writeFile(path.join(left, 'other'), 'same'), writeFile(path.join(right, 'other'), 'same')]);
  const session = new Session({ left: { kind: 'file', path: left }, right: { kind: 'file', path: right } }); t.after(() => session.close());
  await session.refresh();
  const before = session.current.rows.find(row => row.path === 'other');
  assert.equal(before.left.text, undefined);
  await session.loadSelected('chosen');
  const other = session.current.rows.find(row => row.path === 'other');
  assert.equal(other.left.text, undefined); assert.equal(other.right.text, undefined);
});
