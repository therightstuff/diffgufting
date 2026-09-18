# Consistent editing responsiveness tasks

## 1. Reproduction and baseline

- [ ] 1.1 Resolve the supplied cards-base revision and capture matching working/historical inputs and Git layer context into a local isolated fixture without changing the original file.
- [ ] 1.2 Reproduce side-by-side typing latency with recorded positions and settings; document hashes, runtime/hardware, and any missing reproduction context.
- [ ] 1.3 Profile transaction handling, diff calls, Git gutters, synchronization, change rows, and overview work to identify the blocking cause.
- [ ] 1.4 Record baseline input-to-paint and convergence samples, repetitions, long tasks, and numerical acceptance budgets on identified hardware.

## 2. Regression workloads and focused fixes

- [ ] 2.1 Add a portable synthetic Git-backed editing workload and plain-file control without committing the user's private source contents.
- [ ] 2.2 Add deterministic checks for redundant full-pair diffs, immutable layer recomputation, and full-document propagation where profiling identifies these costs.
- [ ] 2.3 Implement the smallest confirmed-cause fix with versioned reuse and scoped updates; record why any necessary full fallback remains.
- [ ] 2.4 Cover repeated lines, multiline changes, Unicode, undo/redo, merge acceptance, shared documents, and stale asynchronous results.
- [ ] 2.5 Verify affected alternate layouts and external-change review retain correct behavior.

## 3. Acceptance and documentation

- [ ] 3.1 Compare baseline and candidate with identical fixtures/settings and repeated switching; retain raw latency, correctness, and resource results.
- [ ] 3.2 Verify recorded responsiveness budgets, no accumulating work across switches, and release of resources after close; leave unreproduced user behavior explicitly unresolved.
- [ ] 3.3 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.
