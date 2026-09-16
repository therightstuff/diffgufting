export const inventoryNodeStates = Object.freeze(['pending', 'checking', 'equal', 'changed', 'added', 'removed', 'conflict', 'unavailable']);

export function createInventoryEvent(type, comparisonId, generation, payload = {}) {
  if (!inventoryNodeStates.includes(type) && type !== 'batch' && type !== 'canceled') throw new Error(`Unknown inventory event type: ${type}`);
  if (typeof comparisonId !== 'string' || !Number.isSafeInteger(generation) || generation < 0) throw new Error('Invalid inventory event identity');
  return { version: 1, type, comparisonId, generation, ...payload };
}

export function acceptsInventoryEvent(current, event) {
  return current.comparisonId === event.comparisonId && current.generation === event.generation;
}

export function pairInventories(left, right) {
  const leftByPath = new Map(left.filter(entry => entry.kind !== 'directory').map(entry => [entry.path, entry]));
  const rightByPath = new Map(right.filter(entry => entry.kind !== 'directory').map(entry => [entry.path, entry]));
  const paths = [...new Set([...leftByPath.keys(), ...rightByPath.keys()])].sort();
  return {
    workCount: paths.length,
    rows: paths.map(path => {
      const leftEntry = leftByPath.get(path); const rightEntry = rightByPath.get(path);
      const directoryConflict = left.find(entry => entry.path === path)?.kind === 'directory' || right.find(entry => entry.path === path)?.kind === 'directory';
      return { path, left: leftEntry, right: rightEntry, state: leftEntry?.kind === 'unavailable' || rightEntry?.kind === 'unavailable' ? 'unavailable' : directoryConflict && (leftEntry || rightEntry) ? 'conflict' : 'pending' };
    }),
  };
}
