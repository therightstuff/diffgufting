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
    this.historyTruncated = false;
    this.listeners = new Set();
    this.version = 0;
    this.writable = options.writable ?? true;
    this.selection = { anchor: 0, head: 0, scrollTop: 0 };
  }
  get dirty() { return this.text !== this.disk.text; }
  get bytes() { return [...this.past, ...this.future].reduce((sum, entry) => sum + entry.bytes, 0); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { this.version++; for (const listener of this.listeners) listener(this); }
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
  replace(text, label = 'edit') {
    if (typeof text !== 'string') throw new Error('Document contents must be text');
    if (text === this.text) return false;
    const entry = change(this.text, text, label);
    if (entry.bytes > this.historyBytes) throw new Error('History capacity exceeded. Increase the history budget or cancel this change.');
    this.future = [];
    this.past.push(entry);
    this.trim();
    this.text = text;
    this.emit();
    return true;
  }
  undo() {
    const entry = this.past.pop();
    if (!entry) return false;
    this.text = this.text.slice(0, entry.start) + entry.removed + this.text.slice(entry.start + entry.inserted.length);
    this.future.push(entry);
    this.emit();
    return true;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.text = this.text.slice(0, entry.start) + entry.inserted + this.text.slice(entry.start + entry.removed.length);
    this.past.push(entry);
    this.emit();
    return true;
  }
  observe(version) {
    const latest = this.pending.at(-1) ?? this.disk;
    if (version.fingerprint === latest.fingerprint && version.text === latest.text) return;
    if (!this.dirty && !this.pending.length && version.text !== null && !version.error) {
      // Reload through the same transaction journal before advancing the disk baseline.
      this.replace(version.text, 'external reload');
      this.disk = version;
      this.baseline = version;
    } else this.pending.push({ ...version });
    this.emit();
  }
  resolve(fingerprint, choice, merged) {
    const latest = this.pending.at(-1);
    if (!latest || latest.fingerprint !== fingerprint) throw new Error('A newer external version requires review');
    if (latest.error) throw new Error('External contents are unavailable; retry reading before resolving');
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
    this.disk = version;
    this.baseline = version;
    this.emit();
  }
}
