import assert from 'node:assert/strict';
import test from 'node:test';
import { scopedChange } from '../src/core/scoped-update.mjs';

test('derives a scoped update when a mounted view has the document predecessor', () => {
  assert.deepEqual(
    scopedChange('before\n', 'before!\n', { start: 6, removed: '', inserted: '!' }),
    { from: 6, to: 6, insert: '!' },
  );
});

test('falls back when the mounted view is not the delta predecessor', () => {
  assert.equal(scopedChange('other\n', 'before!\n', { start: 6, removed: '', inserted: '!' }), null);
});
