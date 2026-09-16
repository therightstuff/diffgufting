export function assertFolderStatuses(actual, expected) {
  const observed = new Map(actual.map(entry => [entry.path, entry.status]));
  for (const entry of expected) {
    if (observed.get(entry.path) !== entry.status) throw new Error(`Unexpected status for ${entry.path}: ${observed.get(entry.path) ?? 'missing'}`);
  }
  if (observed.size !== expected.length) throw new Error('Folder result has unexpected paths');
}

export function reconstructText(before, changes) {
  let offset = 0; let result = before;
  for (const change of changes) {
    if (!Number.isSafeInteger(change.from) || !Number.isSafeInteger(change.to) || change.from < 0 || change.to < change.from || change.to > before.length || typeof change.insert !== 'string') throw new Error('Invalid text change');
    const from = change.from + offset; const to = change.to + offset;
    result = result.slice(0, from) + change.insert + result.slice(to);
    offset += change.insert.length - (change.to - change.from);
  }
  return result;
}
