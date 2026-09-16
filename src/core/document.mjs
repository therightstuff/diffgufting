import { defaults } from './settings.mjs';

function change(before, after, label) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  const removed = before.slice(start, endBefore);
  const inserted = after.slice(start, endAfter);
  return { start, removed, inserted, label, bytes: (removed.length + inserted.length) * 2 };
}

function transaction(input) {
  if (typeof input === 'string') return { kind: input, time: null, ranges: [], selection: null };
  if (!input || typeof input !== 'object') return { kind: 'edit', time: null, ranges: [], selection: null };
  return { kind: input.kind ?? 'edit', time: input.time ?? null, ranges: input.ranges ?? [], selection: input.selection ?? null };
}

function canGroup(entry, delta, next, delay) {
  if (!['typing', 'backspace', 'delete-forward'].includes(next.kind) || entry.kind !== next.kind || !Number.isFinite(next.time) || !Number.isFinite(entry.lastAt) || next.time - entry.lastAt >= delay) return false;
  const previous = entry.changes.at(-1);
  if (next.kind === 'typing') return previous.removed === '' && delta.removed === '' && previous.start + previous.inserted.length === delta.start;
  if (next.kind === 'backspace') return previous.inserted === '' && delta.inserted === '' && delta.start + delta.removed.length === previous.start;
  return previous.inserted === '' && delta.inserted === '' && delta.start === previous.start;
}

function cursorFor(entry, undo) {
  const delta = undo ? entry.changes[0] : entry.changes.at(-1);
  const inserted = undo ? delta.removed : delta.inserted;
  return delta.start + inserted.length;
}

export class Document {
  constructor(id, text, options = {}) {
    this.id = id;
    this.text = text;
    this.disk = { text, fingerprint: options.fingerprint ?? null };
    this.baseline = this.disk;
    this.pending = [];
    this.reviewArchive = [];
    this.past = [];
    this.future = [];
    this.historyBytes = options.historyBytes ?? defaults.historyBytes;
    this.undoGroupDelayMs = options.undoGroupDelayMs ?? defaults.undoGroupDelayMs;
    this.historyTruncated = false;
    this.listeners = new Set();
    this.version = 0;
    this.lastChange = null;
    this.writable = options.writable ?? true;
    this.selection = { anchor: 0, head: 0, scrollTop: 0 };
    this.activeGroup = null;
  }
  get dirty() { return this.text !== this.disk.text; }
  get bytes() { return [...this.past, ...this.future].reduce((sum, entry) => sum + entry.bytes, 0); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(changeInfo = null) { this.version++; if (changeInfo) this.lastChange = { ...changeInfo, version: this.version }; for (const listener of this.listeners) listener(this); }
  setHistoryBudget(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('History budget must be a positive integer');
    if ([...this.past, ...this.future].some(entry => entry.bytes > bytes)) throw new Error('History budget is smaller than a retained transition');
    this.historyBytes = bytes;
    this.trim();
    this.emit();
  }
  trim() {
    while (this.bytes > this.historyBytes && this.past.length > 1) { this.past.shift(); this.historyTruncated = true; }
    while (this.bytes > this.historyBytes && this.future.length) { this.future.shift(); this.historyTruncated = true; }
  }
  closeHistoryGroup() { this.activeGroup = null; }
  replace(text, metadata = 'edit') {
    if (typeof text !== 'string') throw new Error('Document contents must be text');
    if (text === this.text) return false;
    // Editor transactions carry semantic kind, monotonic time, changed ranges, and primary selection.
    const next = transaction(metadata);
    const delta = change(this.text, text, next.kind);
    if (delta.bytes > this.historyBytes) throw new Error('History capacity exceeded. Increase the history budget or cancel this change.');
    this.future = [];
    if (this.activeGroup && canGroup(this.activeGroup, delta, next, this.undoGroupDelayMs) && this.activeGroup.bytes + delta.bytes <= this.historyBytes) {
      this.activeGroup.changes.push(delta);
      this.activeGroup.bytes += delta.bytes;
      this.activeGroup.lastAt = next.time;
      this.activeGroup.ranges.push(...next.ranges);
    } else {
      this.closeHistoryGroup();
      const entry = { kind: next.kind, changes: [delta], ranges: [...next.ranges], selection: next.selection ?? { ...this.selection }, firstAt: next.time, lastAt: next.time, bytes: delta.bytes };
      this.past.push(entry);
      if (['typing', 'backspace', 'delete-forward'].includes(next.kind)) this.activeGroup = entry;
    }
    this.trim();
    this.text = text;
    this.emit({ kind: next.kind, ranges: next.ranges, delta });
    return true;
  }
  undo() {
    const entry = this.past.pop();
    if (!entry) return false;
    this.closeHistoryGroup();
    for (const delta of [...entry.changes].reverse()) this.text = this.text.slice(0, delta.start) + delta.removed + this.text.slice(delta.start + delta.inserted.length);
    const cursor = cursorFor(entry, true);
    this.selection = { ...this.selection, anchor: cursor, head: cursor };
    this.future.push(entry);
    this.emit({ kind: 'undo', ranges: entry.ranges, changes: entry.changes });
    return true;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.closeHistoryGroup();
    for (const delta of entry.changes) this.text = this.text.slice(0, delta.start) + delta.inserted + this.text.slice(delta.start + delta.removed.length);
    const cursor = cursorFor(entry, false);
    this.selection = { ...this.selection, anchor: cursor, head: cursor };
    this.past.push(entry);
    this.emit({ kind: 'redo', ranges: entry.ranges, changes: entry.changes });
    return true;
  }
  observe(version) {
    // Metadata-only inventory entries deliberately have no text yet. They are
    // not an external document version until selected content is loaded.
    if (version.text === undefined) return;
    const latest = this.pending.at(-1) ?? this.disk;
    if (version.fingerprint === latest.fingerprint && version.text === latest.text) return;
    if (!this.dirty && !this.pending.length && version.text !== null && !version.error) {
      // Reload through the same transaction journal before advancing the disk baseline.
      this.closeHistoryGroup(); this.replace(version.text, 'external reload');
      this.disk = version;
      this.baseline = version;
    } else this.pending.push({ ...version });
    this.emit();
  }
  resolve(fingerprint, choice, merged) {
    const latest = this.pending.at(-1);
    if (!latest || latest.fingerprint !== fingerprint) throw new Error('A newer external version requires review');
    if (latest.error) throw new Error('External contents are unavailable; retry reading before resolving');
    this.closeHistoryGroup();
    if (choice === 'disk') this.replace(latest.text ?? '', 'accept disk');
    else if (choice === 'merge') this.replace(merged, 'resolve contention');
    else if (choice !== 'local') throw new Error('Unknown review decision');
    this.reviewArchive.push({ baseline: this.baseline, versions: this.pending });
    this.pending = [];
    this.disk = latest;
    this.baseline = latest;
    this.emit();
  }
  saved(version) {
    this.closeHistoryGroup();
    this.disk = version;
    this.baseline = version;
    this.emit();
  }
}
