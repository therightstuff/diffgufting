import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFolderStatuses, reconstructText } from '../scripts/comparison-benchmark-oracles.mjs';

test('folder oracle verifies known manifest statuses', () => {
  assert.doesNotThrow(() => assertFolderStatuses([{ path: 'a', status: 'equal' }], [{ path: 'a', status: 'equal' }]));
  assert.throws(() => assertFolderStatuses([{ path: 'a', status: 'changed' }], [{ path: 'a', status: 'equal' }]), /a/);
});

test('text oracle reconstructs the target from a valid alternative alignment', () => {
  const target = reconstructText('same\nsame\n', [{ from: 5, to: 5, insert: 'same\n' }]);
  assert.equal(target, 'same\nsame\nsame\n');
});
