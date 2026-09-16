export const defaults = Object.freeze({
  historyBytes: 100 * 1024 * 1024,
  undoGroupDelayMs: 5000,
  reconcileMs: 2000,
  watchDebounceMs: 100,
  operationTimeoutMs: 30000,
  maxFileBytes: 32 * 1024 * 1024,
  directoryConcurrency: 8,
  inventoryBatchSize: 100,
  comparisonQueueSize: 256,
  comparisonCacheBytes: 32 * 1024 * 1024,
  openComparisonLimit: 10,
  theme: 'dark',
  layout: 'side-by-side',
});

export function settings(input = {}) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (!(key in input)) continue;
    if (typeof defaults[key] === 'number') {
      if (!Number.isSafeInteger(input[key]) || input[key] <= 0) throw new Error(`Invalid ${key}: expected a positive integer`);
    } else if (typeof input[key] !== 'string' || (key === 'theme' && !['dark', 'light', 'system'].includes(input[key]))) throw new Error(`Invalid ${key}`);
    result[key] = input[key];
  }
  return result;
}
