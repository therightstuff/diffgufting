import { ChangeSet } from '@codemirror/state';
import { diff } from '@codemirror/merge';

export function layerRanges(layers, file, current) {
  const ranges = [];
  for (const layer of layers) for (const entry of layer.entries) {
    if (entry.path !== file || entry.error) continue;
    const mapping = ChangeSet.of(diff(entry.after, current).map(change => ({ from: change.fromA, to: change.toA, insert: current.slice(change.fromB, change.toB) })), entry.after.length);
    for (const change of diff(entry.before, entry.after)) {
      ranges.push({ from: mapping.mapPos(change.fromB, -1), to: mapping.mapPos(change.toB, 1), category: layer.category, side: layer.side, repo: layer.repo, entry, layer });
    }
  }
  return ranges;
}
