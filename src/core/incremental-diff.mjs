import { ChangeSet } from '@codemirror/state';
import { Chunk, diff } from '@codemirror/merge';
import { Text } from '@codemirror/state';

function text(value) { return Text.of(value.split('\n')); }

function changeSet(before, delta) {
  return ChangeSet.of([{ from: delta.start, to: delta.start + delta.removed.length, insert: delta.inserted }], before.length);
}

function key(a, b) { return `${a.id}:${b.id}`; }

/**
 * Comparison-owned, versioned editor diff results. A known one-range local
 * transaction updates existing chunks; review/undo/external transitions use a
 * complete recomputation because their affected alignment is not trustworthy.
 */
export class IncrementalDiffs {
  constructor(limit = 100) { this.limit = limit; this.results = new Map(); }
  get(a, b) {
    const id = key(a, b); const previous = this.results.get(id);
    if (previous?.a.version === a.version && previous.b.version === b.version) return previous;
    let chunks; let mode = 'full';
    const updatedA = previous && previous.a.version + 1 === a.version && previous.b.version === b.version && a.lastChange?.delta;
    const updatedB = previous && previous.b.version + 1 === b.version && previous.a.version === a.version && b.lastChange?.delta;
    try {
      if (updatedA) { chunks = Chunk.updateA(previous.chunks, text(a.text), text(b.text), changeSet(previous.a.text, a.lastChange.delta)); mode = 'incremental-a'; }
      else if (updatedB) { chunks = Chunk.updateB(previous.chunks, text(a.text), text(b.text), changeSet(previous.b.text, b.lastChange.delta)); mode = 'incremental-b'; }
      else chunks = Chunk.build(text(a.text), text(b.text));
    } catch {
      chunks = Chunk.build(text(a.text), text(b.text));
      mode = 'fallback';
    }
    const result = { a: { version: a.version, text: a.text }, b: { version: b.version, text: b.text }, chunks, changes: diff(a.text, b.text), mode, incremental: mode.startsWith('incremental'), precision: 'complete', complete: true };
    this.results.delete(id); this.results.set(id, result);
    while (this.results.size > this.limit) this.results.delete(this.results.keys().next().value);
    return result;
  }
  clear() { this.results.clear(); }
}
