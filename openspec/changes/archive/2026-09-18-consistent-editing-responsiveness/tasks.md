# Consistent editing responsiveness tasks

## 1. Reproduction and baseline

- [x] 1.1 Resolve the supplied cards-base revision and capture matching working/historical inputs and Git layer context into a local isolated fixture without changing the original file.
- [x] 1.2 Reproduce side-by-side Git-source typing latency with recorded end-of-file positions and settings; document hashes, runtime/hardware, and the repository-root launch limitation.
- [x] 1.3 Trace transaction handling, diff calls, Git gutters, synchronization, change rows, and overview work; identify redundant complete-pair diffs, immutable-layer recomputation, and full-document synchronization as the blocking costs.
- [x] 1.4 Record five plain-file-control and Git-source baseline/candidate input-to-paint/convergence samples with numerical median/tail budgets on macOS arm64; record unavailable renderer long-task measurements explicitly.

## 2. Regression workloads and focused fixes

- [x] 2.1 Add a portable synthetic Git-backed editing workload and plain-file control without committing the user's private source contents.
- [x] 2.2 Add deterministic checks for redundant full-pair diffs, immutable layer recomputation, and full-document propagation where profiling identifies these costs.
- [x] 2.3 Implement the smallest confirmed-cause fix with versioned reuse and scoped updates; retain full fallback when a mounted view does not match the local delta predecessor.
- [x] 2.4 Cover repeated lines, multiline changes, Unicode, undo/redo, merge acceptance, shared documents, and stale asynchronous results.
- [x] 2.5 Verify affected alternate layouts and external-change review retain correct behavior.

## 3. Acceptance and documentation

- [x] 3.1 Compare baseline and candidate with identical Git-backed fixtures/settings; retain raw latency and use the serial desktop workspace/editor suite for repeated activation, correctness, and close lifecycle results.
- [x] 3.2 Verify Git-source candidate latency remains below every recorded baseline sample; serial workspace/editor coverage confirms no accumulating comparison entries and owned-process cleanup after close. Renderer long-task counters remain unavailable in this harness.
- [x] 3.3 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.
