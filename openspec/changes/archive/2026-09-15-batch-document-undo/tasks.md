# Batch document undo tasks

## 1. Shared journal grouping

- [x] 1.1 Add the 5000 ms grouping default and document transaction metadata for action kind, monotonic time, ranges, and primary selection.
- [x] 1.2 Implement adjacent typing and separate deletion groups, explicit boundary handling, and incremental delta composition in the shared journal.
- [x] 1.3 Enforce group-aware capacity, oldest-first eviction, safe group splitting, oversized-action rejection, and redo invalidation without losing pending review versions.
- [x] 1.4 Apply undo/redo text and collapsed cursor positions atomically, including replacements and disjoint action ranges.

## 2. Editor integration

- [x] 2.1 Classify editor transactions for typing, backward/forward deletion, Enter, cut, paste, replacements, and composition using semantic input metadata.
- [x] 2.2 Close groups on explicit navigation, focus transfer, save, undo, and redo while excluding edit-induced movement and shared-view synchronization.
- [x] 2.3 Isolate model-driven transfers, merges, and reloads; reveal the resulting cursor in the invoking editor and report undo group counts.

## 3. Verification and documentation

- [x] 3.1 Add deterministic clock coverage immediately below and at five seconds, backspace sequences, Enter, cursor jumps, and action boundaries.
- [x] 3.2 Verify cursor placement for undo/redo of insertion, deletion, replacement, and disjoint edits, plus capacity boundaries and rejected oversized operations.
- [x] 3.3 Exercise actual editor typing, native-menu paste, composition, shared views, and layout changes; run existing save, external-review, and merge history coverage.
- [x] 3.4 Update README.md and docs/spec.md to reflect user-facing grouped undo and its shared-journal architecture.
