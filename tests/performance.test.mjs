import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Session } from '../src/host/session.mjs';
import { Document } from '../src/core/document.mjs';

test('directory comparison leaves the host responsive and document history stays bounded', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-performance-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const a = path.join(dir, 'a'); const b = path.join(dir, 'b'); await mkdir(a); await mkdir(b);
  const count = 500;
  await Promise.all(Array.from({ length: count }, async (_, i) => {
    await writeFile(path.join(a, `${i}.txt`), 'before\n'.repeat(100)); await writeFile(path.join(b, `${i}.txt`), 'after\n'.repeat(100));
  }));
  const session = new Session({ left: { kind: 'file', path: a }, right: { kind: 'file', path: b } }); t.after(() => session.close());
  let ticks = 0; const heartbeat = setInterval(() => ticks++, 5);
  const start = performance.now();
  const result = await session.refresh(); clearInterval(heartbeat);
  assert.equal(result.rows.length, count); assert.ok(ticks > 0, 'worker comparison must not block the host event loop');
  const documents = Array.from({ length: 10 }, (_, i) => new Document(`file${i}`, 'start', { historyBytes: 1024 }));
  for (const doc of documents) { for (let i = 0; i < 200; i++) doc.replace(String(i).repeat(20)); assert.ok(doc.bytes <= doc.historyBytes); }
  t.diagnostic(`${count} file pairs: ${(performance.now() - start).toFixed(1)}ms; host heartbeat ${ticks} ticks; ten history journals ${documents.reduce((sum, doc) => sum + doc.bytes, 0)} bytes`);
});
