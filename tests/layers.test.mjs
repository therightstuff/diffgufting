import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LayerRangeCache, layerRanges } from '../src/core/change-layers.mjs';

test('canceled and overlapping transitions retain multiple categories at the same final range', () => {
  const current = 'committed\n';
  const layers = [
    { category: 'committed', side: 'right', repo: 'repo', entries: [{ path: 'f', before: 'base\n', after: current }] },
    { category: 'staged', side: 'right', repo: 'repo', entries: [{ path: 'f', before: current, after: 'staged\n' }] },
    { category: 'unstaged', side: 'right', repo: 'repo', entries: [{ path: 'f', before: 'staged\n', after: current }] },
  ];
  const ranges = layerRanges(layers, 'f', current);
  assert.deepEqual([...new Set(ranges.map(range => range.category))], ['committed', 'staged', 'unstaged']);
  assert.ok(ranges.every(range => range.from >= 0 && range.to <= current.length));
  assert.ok(ranges.some(range => range.category === 'staged' && range.entry.after === 'staged\n'));
});

test('reuses immutable Git layer differences while mapping successive working edits', () => {
  const cache = new LayerRangeCache();
  const layers = [{ category: 'committed', side: 'right', repo: 'repo', entries: [{ path: 'f', before: 'base\n', after: 'committed\n' }] }];

  layerRanges(layers, 'f', 'committed\n', cache);
  layerRanges(layers, 'f', 'committed!\n', cache);

  assert.equal(cache.calculations.immutablePairDiffs, 1);
});
