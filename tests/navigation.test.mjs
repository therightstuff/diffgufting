import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPosition } from '../src/core/navigation.mjs';

test('navigation maps corresponding content after insertions in both directions', () => {
  const a = 'one\ntwo\nthree\n'; const b = 'one\ninserted\ntwo\nthree\n';
  assert.equal(mapPosition(a, b, a.indexOf('three') + 2), b.indexOf('three') + 2);
  assert.equal(mapPosition(b, a, b.indexOf('three') + 2), a.indexOf('three') + 2);
  assert.equal(mapPosition(b, a, b.indexOf('inserted') + 2), a.indexOf('two'));
});
test('navigation clamps absent and empty content to valid positions', () => {
  assert.equal(mapPosition('deleted', '', 6), 0);
  assert.equal(mapPosition('', 'added', 0), 0);
  assert.equal(mapPosition('short', 'short', 100), 5);
});
