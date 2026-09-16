import assert from 'node:assert/strict';
import test from 'node:test';
import { Document } from '../src/core/document.mjs';
import { IncrementalDiffs } from '../src/core/incremental-diff.mjs';
import { diff } from '@codemirror/merge';

test('incremental diffs update chunks for known local edits and retain full-diff correctness', () => {
  const left = new Document('left', 'one\ntwo\nthree'); const right = new Document('right', 'one\nTWO\nthree');
  const results = new IncrementalDiffs(); const first = results.get(left, right);
  right.replace('one\nTWO!\nthree', { kind: 'typing', time: 1, ranges: [{ fromA: 7, toA: 7, fromB: 7, toB: 8 }] });
  const next = results.get(left, right);
  assert.equal(next.incremental, true);
  assert.equal(next.mode, 'incremental-b'); assert.equal(next.precision, 'complete'); assert.equal(next.complete, true);
  assert.deepEqual(next.changes, diff(left.text, right.text));
  assert.ok(next.chunks.length);
  right.undo();
  const undone = results.get(left, right);
  assert.equal(undone.incremental, false);
  assert.equal(undone.mode, 'full');
  assert.deepEqual(undone.changes, diff(left.text, right.text));
});

test('incremental results remain correct for either side and complex fallback transitions', () => {
  const repeated = 'same\nsame\nשלום\n';
  const left = new Document('left', `${repeated}${'x'.repeat(10_000)}`);
  const right = new Document('right', `${repeated}${'x'.repeat(10_000)}`);
  const results = new IncrementalDiffs(); results.get(left, right);
  left.replace(`inserted\n${left.text}`, { kind: 'paste', ranges: [{ fromA: 0, toA: 0, fromB: 0, toB: 9 }] });
  const changedLeft = results.get(left, right);
  assert.equal(changedLeft.incremental, true);
  assert.equal(changedLeft.mode, 'incremental-a');
  assert.deepEqual(changedLeft.changes, diff(left.text, right.text));
  right.replace(`${right.text}\nmultiline\nshift`, { kind: 'replacement', ranges: [{ fromA: right.text.length, toA: right.text.length, fromB: right.text.length, toB: right.text.length + 16 }] });
  const changedBoth = results.get(left, right);
  assert.equal(changedBoth.incremental, true);
  assert.deepEqual(changedBoth.changes, diff(left.text, right.text));
});
