import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../src/host/session.mjs';

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
