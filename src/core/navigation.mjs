import { diff } from '@codemirror/merge';

export function mapPosition(before, after, position, changes = diff(before, after)) {
  const pos = Math.max(0, Math.min(position, before.length));
  if (before === after) return pos;
  let offset = 0;
  for (const change of changes) {
    if (pos < change.fromA) break;
    if (pos <= change.toA) {
      if (pos === change.toA && change.toA > change.fromA) return change.toB;
      return pos - change.fromA <= change.toA - pos ? change.fromB : change.toB;
    }
    offset = change.toB - change.toA;
  }
  return Math.max(0, Math.min(after.length, pos + offset));
}
