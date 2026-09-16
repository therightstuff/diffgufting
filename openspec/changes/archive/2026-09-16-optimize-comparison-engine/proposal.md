# Optimize the comparison engine

## Why

Large folder comparisons have been reported to terminate the app, and the current engine reads whole trees, duplicates content, and repeats diff work without useful comparison progress. Repeatable performance and load tests are needed to improve speed and resource use without sacrificing accuracy, and to compare future techniques fairly.

## What Changes

- Discover folder names before reading contents, retaining one inventory for counting, tree/list display, and comparison scheduling. Show unresolved nodes in grey and resolve their states progressively.
- Separate discovery progress from comparison progress, with an exact discovered workload after enumeration and explicit incomplete, error, and canceled states.
- Bound concurrent reads, worker messages, cached content, and rendered rows; load detailed text diffs on demand.
- Keep caches only while their owning comparison is open, including while inactive. Invalidate affected paths on filesystem changes and reconcile missed events without repeatedly rereading every file.
- Preserve edit ranges and reuse incremental line and character diff results across editors, change lists, and navigation. Allow wider recomparison where correctness requires it.
- Investigate the reported crash and add load coverage for large inventories, large files, mutation bursts, cancellation, and repeated comparison lifecycles.
- Add deterministic benchmark fixtures, a common runner for alternative techniques, machine-readable measurements, baseline comparison, and separate correctness/resource gates from machine-dependent timing results.
- Route all test suites, including focused model, desktop, CLI, packaging, performance, and load runs, through quiet wrappers. Retain detailed logs as artifacts and return bounded summaries with suite/run timings and history-based polling recommendations.

## Capabilities

### New Capabilities

- `progressive-folder-comparison`: Discovery, pending nodes, bounded comparison work, cache ownership, and filesystem invalidation.
- `incremental-comparison`: Revision-scoped reuse of line and intraline differences across editing and navigation.
- `comparison-performance`: Repeatable performance and load tests with comparable artifacts and accuracy checks.
- `test-execution-reporting`: Quiet wrappers for every test entrypoint, durable timing reports, and compact status queries for agent polling.

### Modified Capabilities

- `desktop-comparison`: Replace estimated source-only progress with phase-aware discovery and comparison progress while retaining independent source selection.

## Impact

Changes affect filesystem and Git source loading, host sessions and workers, workspace lifecycle, document changes, renderer navigation and lists, settings, and test tooling. Existing dirty-buffer protection, external-change review, unsupported-source handling, and revision identity remain required. No new runtime dependency is proposed. This is separate from the existing comparison workspace navigation change.
