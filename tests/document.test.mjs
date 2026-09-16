import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '../src/core/document.mjs';

test('adjacent typing groups until the five-second pause and restores its cursor', () => {
  const d = new Document('file', '');
  d.replace('a', { kind: 'typing', time: 0, selection: { anchor: 1, head: 1 } });
  d.replace('ab', { kind: 'typing', time: 4999, selection: { anchor: 2, head: 2 } });
  d.replace('abc', { kind: 'typing', time: 9999, selection: { anchor: 3, head: 3 } });

  assert.equal(d.undoGroupDelayMs, 5000);
  assert.equal(d.past.length, 2);
  d.undo();
  assert.equal(d.text, 'ab');
  assert.deepEqual(d.selection, { anchor: 2, head: 2, scrollTop: 0 });
  d.undo();
  assert.equal(d.text, '');
  assert.deepEqual(d.selection, { anchor: 0, head: 0, scrollTop: 0 });
});

test('backspaces group separately and undo restores the cursor after deleted text', () => {
  const d = new Document('file', 'abc');
  d.replace('ab', { kind: 'backspace', time: 0 });
  d.replace('a', { kind: 'backspace', time: 1 });
  assert.equal(d.past.length, 1);
  d.undo();
  assert.equal(d.text, 'abc');
  assert.equal(d.selection.head, 3);
  d.redo();
  assert.equal(d.selection.head, 1);
});

test('replacement is an atomic action whose undo and redo select after inserted text', () => {
  const d = new Document('file', 'before');
  d.replace('after', { kind: 'replacement', time: 0 });
  d.undo();
  assert.equal(d.text, 'before');
  assert.equal(d.selection.head, 6);
  d.redo();
  assert.equal(d.text, 'after');
  assert.equal(d.selection.head, 5);
});

test('five-second boundary, Enter, and explicit navigation close typing groups', () => {
  const d = new Document('file', '');
  d.replace('a', { kind: 'typing', time: 0 });
  d.replace('ab', { kind: 'typing', time: 4999 });
  d.replace('ab\n', { kind: 'enter', time: 5000 });
  d.replace('ab\nc', { kind: 'typing', time: 5001 });
  d.closeHistoryGroup();
  d.replace('Xab\nc', { kind: 'typing', time: 5002 });
  assert.equal(d.past.length, 4);
});

test('group capacity splits safely and rejects an operation too large to retain', () => {
  const d = new Document('file', '', { historyBytes: 4 });
  d.replace('a', { kind: 'typing', time: 0 });
  d.replace('ab', { kind: 'typing', time: 1 });
  d.replace('abc', { kind: 'typing', time: 2 });
  assert.equal(d.past.length, 1);
  assert.equal(d.past[0].changes.length, 1);
  assert.throws(() => d.replace('x'.repeat(10), { kind: 'paste', time: 3 }), /history/i);
  assert.equal(d.text, 'abc');
});

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

test('document versions retain supplied local edit ranges across undo and redo', () => {
  const d = new Document('file', 'before');
  d.replace('beXfore', { kind: 'typing', time: 1, ranges: [{ fromA: 2, toA: 2, fromB: 2, toB: 3 }] });
  assert.equal(d.lastChange.version, 1);
  assert.deepEqual(d.lastChange.ranges, [{ fromA: 2, toA: 2, fromB: 2, toB: 3 }]);
  d.undo(); assert.equal(d.lastChange.kind, 'undo');
  d.redo(); assert.equal(d.lastChange.kind, 'redo');
});

test('document transitions retain Unicode, repeated text, long lines, and multiline offsets through undo/redo', () => {
  const before = `${'same\n'.repeat(3)}שלום\n${'x'.repeat(10_000)}\nend`;
  const after = `${'same\n'.repeat(2)}inserted\nשלום עולם\n${'x'.repeat(10_000)}\nend`;
  const d = new Document('complex', before, { historyBytes: 100_000 });
  d.replace(after, { kind: 'replacement', ranges: [{ fromA: 10, toA: 15, fromB: 10, toB: 28 }] });
  assert.equal(d.text, after); assert.ok(d.lastChange.delta.removed.includes('same'));
  d.undo(); assert.equal(d.text, before);
  d.redo(); assert.equal(d.text, after);
});
