export class ComparisonCache {
  constructor(byteBudget) {
    if (!Number.isSafeInteger(byteBudget) || byteBudget <= 0) throw new Error('Cache byte budget must be a positive integer');
    this.byteBudget = byteBudget; this.entries = new Map(); this.bytes = 0;
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    const bytes = Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
    if (bytes > this.byteBudget) return false;
    const previous = this.entries.get(key);
    if (previous) { this.entries.delete(key); this.bytes -= previous.bytes; }
    this.entries.set(key, { value, bytes }); this.bytes += bytes;
    while (this.bytes > this.byteBudget) { const [oldestKey, oldest] = this.entries.entries().next().value; this.entries.delete(oldestKey); this.bytes -= oldest.bytes; }
    return true;
  }
  deleteWhere(predicate) {
    for (const [key, entry] of this.entries) if (predicate(key, entry.value)) {
      this.entries.delete(key); this.bytes -= entry.bytes;
    }
  }
  snapshot() { return { byteBudget: this.byteBudget, bytes: this.bytes, entries: this.entries.size }; }
  clear() { this.entries.clear(); this.bytes = 0; }
}

export function cacheKey(kind, version, ...parts) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Cache key version must be a positive integer');
  return JSON.stringify({ kind, version, parts });
}
