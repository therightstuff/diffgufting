import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '../src/core/document.mjs';

test('clean external reload is undoable and undo does not change disk baseline', () => {
  const d = new Document('file', 'before');
  d.observe({ text: 'after', fingerprint: 'v2' });
  assert.equal(d.text, 'after');
  d.undo();
  assert.equal(d.text, 'before');
  assert.equal(d.disk.text, 'after');
  assert.equal(d.dirty, true);
});

test('every dirty external change needs review, including disjoint changes', () => {
  const d = new Document('file', 'a\nb');
  d.replace('A\nb', 'typing');
  d.observe({ text: 'a\nB', fingerprint: 'v2' });
  assert.equal(d.text, 'A\nb');
  assert.equal(d.pending.length, 1);
  d.observe({ text: 'a\nC', fingerprint: 'v3' });
  assert.equal(d.pending.length, 2);
  assert.throws(() => d.resolve('v2', 'disk'), /newer/i);
  d.resolve('v3', 'disk');
  assert.equal(d.text, 'a\nC');
  d.undo();
  assert.equal(d.text, 'A\nb');
  assert.equal(d.disk.text, 'a\nC');
});

test('save checkpoints retain history and a new edit clears redo', () => {
  const d = new Document('file', 'a');
  d.replace('b', 'merge');
  d.saved({ text: 'b', fingerprint: 'saved' });
  assert.equal(d.dirty, false);
  d.undo();
  assert.equal(d.text, 'a');
  assert.equal(d.disk.text, 'b');
  d.replace('c');
  assert.equal(d.redo(), false);
});

test('oversized history transition cannot silently mutate document', () => {
  const d = new Document('file', 'old', { historyBytes: 8 });
  assert.throws(() => d.replace('x'.repeat(9)), /history/i);
  assert.equal(d.text, 'old');
  d.setHistoryBudget(1024);
  d.replace('next');
  d.undo();
  assert.equal(d.text, 'old');
});

test('old history eviction is visible while immediate prior state remains undoable', () => {
  const d = new Document('file', 'a', { historyBytes: 8 });
  for (const text of ['b', 'c', 'd']) d.replace(text);
  assert.equal(d.historyTruncated, true);
  d.undo();
  assert.equal(d.text, 'c');
});

test('deletion preserves clean buffer and requires explicit review', () => {
  const d = new Document('file', 'keep');
  d.observe({ text: null, fingerprint: 'missing' });
  assert.equal(d.text, 'keep');
  assert.equal(d.pending.length, 1);
  d.resolve('missing', 'local');
  assert.equal(d.dirty, true);
});
