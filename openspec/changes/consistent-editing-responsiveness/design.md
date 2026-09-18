# Consistent editing responsiveness design

## Context

Reported case: side-by-side comparison of `/Users/adamfisher/dev/cards-base/docs/spec.md`, revision `1fa8cefe08f7` against working tree. No fast comparison is available. The user reports delay stays consistent per open comparison when switching.

Inspection found an unconditional full diff in IncrementalDiffs.get after incremental chunk updates, full diffs in layerRanges, and document synchronization that rebuilds change rows and overview markers. These are suspects, not a demonstrated root cause.

## Goals / Non-Goals

Goals: reproduce the delay, identify its blocking work, improve measured typing responsiveness, and protect correct diffs, editing history, navigation, and shared documents.

Non-goals: changing the user's original file, importing private project content into committed fixtures, replacing the editor, or claiming a fix from engine-only timing.

## Decisions

### Capture the real case before choosing the fix

Resolve the supplied revision and collect historical/working bytes, Git layer context, app settings, runtime, hardware, and file hashes into a local isolated fixture. Preserve unsaved-buffer context if needed; do not overwrite the user's source or stage its contents. A copied plain file pair is a control, not necessarily an equivalent reproduction because repository layers can affect work.

Exercise controlled typing at recorded positions in side-by-side layout with deterministic edits. Measure input-to-painted-text latency separately from diff-convergence latency, renderer long tasks, diff calls, changed spans, and DOM work. Repeat with the same content outside Git, reduced layer work in a diagnostic run, and controlled alternate comparisons. A user-provided fast example is not required.

Record identified hardware and numerical median/tail acceptance budgets from the baseline before accepting implementation. If the case cannot be reproduced, report that limitation and retain the unresolved reproduction task rather than claiming repair.

### Share results and scope updates according to evidence

Trace the edit transaction, document emission, synchronization, gutter mapping, change list, and overview. Reuse compatible versioned results, cache immutable layer diffs, propagate changed ranges to secondary views, and limit DOM updates if profiling confirms these costs. Incrementally updated chunks must not be followed by an unnecessary independent full-pair diff solely to supply another consumer.

CodeMirror's own diff behavior needs profiling before changing integration. Preserve precise current-version results and necessary wider recomparison. Deferring all work with a debounce could hide latency while leaving stale navigation, so deferred work must retain generation checks and explicit pending state.

### Use deterministic correctness gates plus desktop latency evidence

Maintain portable synthetic fixtures for repeated lines, long lines, Unicode, large documents, Git layers, shared writable files, undo/redo, and alternate layouts. Repeatedly switch comparisons and return to the reported case; validate no growing work or stale caches. Count redundant computations independently of timing noise. Use existing reporting and fixture infrastructure.

## Risks / Trade-offs

- Current working contents may differ from the reported state → capture hashes and disclose reproduction limits.
- Optimizations may misalign repeated text or produce stale markers → compare reconstruction and version compatibility, including fallback cases.
- Caches may retain closed comparisons → test close and final-reference cleanup.
- Timing varies by machine → keep raw samples, environmental context, and explicit acceptance budgets.
- Navigation proposal touches the renderer too → integrate focused changes and rerun affected behavior checks when combined.

## Migration Plan

Capture baseline, add regression workloads, implement the smallest measured fix, then compare the same fixture/settings and validate correctness. No persisted data migration. Revert a failing optimization without removing baseline fixtures and correctness checks.

## Open Questions

The root cause, current reproducibility, and numerical acceptance budgets remain measurement tasks. They do not prevent proposing the investigation and its acceptance contract.
