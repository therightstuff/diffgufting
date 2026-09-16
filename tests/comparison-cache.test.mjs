import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComparisonCache, cacheKey } from '../src/host/comparison-cache.mjs';

test('comparison cache evicts oldest text entries within its byte budget', () => {
  const cache = new ComparisonCache(4);
  cache.set('first', 'aa'); cache.set('second', 'bb'); cache.set('third', 'cc');
  assert.equal(cache.get('first'), undefined);
  assert.equal(cache.get('second'), 'bb');
  assert.equal(cache.get('third'), 'cc');
});

test('comparison cache clears only its own entries', () => {
  const cache = new ComparisonCache(10);
  cache.set('entry', 'value'); cache.clear();
  assert.equal(cache.get('entry'), undefined);
});

test('comparison cache retains structured versioned entries within its byte budget', () => {
  const cache = new ComparisonCache(100);
  const key = cacheKey('hunks', 1, 'file.txt', 'left', 'right');
  cache.set(key, [{ fromA: 1, toA: 2 }]);
  assert.deepEqual(cache.get(key), [{ fromA: 1, toA: 2 }]);
  assert.throws(() => cacheKey('hunks', 0, 'file.txt'), /version/);
});

test('comparison cache reports bounded retained resource usage', () => {
  const cache = new ComparisonCache(10); cache.set('entry', 'value');
  assert.deepEqual(cache.snapshot(), { byteBudget: 10, bytes: 5, entries: 1 });
  cache.clear(); assert.deepEqual(cache.snapshot(), { byteBudget: 10, bytes: 0, entries: 0 });
});
