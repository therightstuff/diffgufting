export function scopedChange(before, after, delta) {
  if (!delta || !Number.isSafeInteger(delta.start) || typeof delta.removed !== 'string' || typeof delta.inserted !== 'string') return null;
  const expectedBefore = after.slice(0, delta.start) + delta.removed + after.slice(delta.start + delta.inserted.length);
  if (before !== expectedBefore) return null;
  return { from: delta.start, to: delta.start + delta.removed.length, insert: delta.inserted };
}
