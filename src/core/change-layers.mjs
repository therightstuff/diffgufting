import { ChangeSet } from '@codemirror/state';
import { diff } from '@codemirror/merge';

export class LayerRangeCache {
  constructor() {
    this.entries = new WeakMap();
    this.calculations = { immutablePairDiffs: 0 };
  }
  ranges(layers, file, current) {
    const ranges = [];
    for (const layer of layers) for (const entry of layer.entries) {
      if (entry.path !== file || entry.error) continue;
      let immutable = this.entries.get(entry);
      if (!immutable || immutable.before !== entry.before || immutable.after !== entry.after) {
        immutable = { before: entry.before, after: entry.after, changes: diff(entry.before, entry.after) };
        this.entries.set(entry, immutable);
        this.calculations.immutablePairDiffs++;
      }
      const mapping = ChangeSet.of(diff(entry.after, current).map(change => ({ from: change.fromA, to: change.toA, insert: current.slice(change.fromB, change.toB) })), entry.after.length);
      for (const change of immutable.changes) {
        ranges.push({ from: mapping.mapPos(change.fromB, -1), to: mapping.mapPos(change.toB, 1), category: layer.category, side: layer.side, repo: layer.repo, entry, layer });
      }
    }
    return ranges;
  }
}

const defaultCache = new LayerRangeCache();

export function layerRanges(layers, file, current, cache = defaultCache) {
  return cache.ranges(layers, file, current);
}
