# Comparison engine implementation tasks

## 0. Quiet execution for all tests

- [x] 0.1 Implement one shared test wrapper that preserves native selection, prerequisites, graphical serialization, and exit semantics while streaming full stdout/stderr to unique run artifacts and returning byte-bounded summaries.
- [x] 0.2 Add durable structured terminal reports with run identity, outcomes/counts, start/end times, total wall duration, per-suite elapsed durations, failure/signal details, and artifact paths, including interrupted and failed runs.
- [x] 0.3 Add bounded compatible timing history, history-based recommended polling intervals, and compact atomic status queries that never replay logs; prefer completion notifications and report missing timing explicitly.
- [x] 0.4 Route every existing and future test entrypoint through the shared wrapper, including npm test, desktop, CLI, packaged-app, focused subsets, performance, and stress/load commands; preserve explicit verbose and scoped failure-detail access.
- [x] 0.5 Verify output budgets, retained diagnostics, selection/exit propagation, timings, history compatibility, and polling defaults using deterministic child fixtures covering noisy success, assertion failure, spawn failure, timeout, cancellation, and missing/corrupt reports.

## 1. Baseline and reproducible workloads

- [x] 1.1 Inspect any retained macOS crash report for the reported failure and record the failing process/reason or the absence of evidence; reproduce folder failure in an isolated load run without asserting an unconfirmed cause.
- [x] 1.2 Add deterministic, versioned folder and text fixture generators with known manifests, seeds, scale controls, and safe temporary-directory cleanup.
- [x] 1.3 Add a common benchmark candidate interface and runner behind the shared quiet wrapper, with fixture/candidate selection, warmups, repetitions, alternating order, explicit application-cache modes, timeouts, and setup excluded from timings.
- [x] 1.4 Add correctness oracles for folder statuses and text reconstruction, including repeated-text cases with multiple valid alignments.
- [x] 1.5 Add versioned JSON output and a baseline comparison report containing raw samples, environment/configuration identity, correctness results, unavailable measurements, and failures; reject incompatible comparisons.
- [x] 1.6 Capture the existing engine baseline before source changes, including phase latency, I/O/work counters, host/renderer responsiveness, and memory across host, workers, and renderer; record any crashes or timeouts.

## 2. Inventory and bounded work

- [x] 2.1 Define versioned inventory/result events, node states, path conflict handling, and generation-scoped cancellation; cover stale-message rejection.
- [x] 2.2 Implement metadata-only filesystem enumeration retaining directories, empty directories, and unavailable entries; preserve `.git` exclusion and symlink safety.
- [x] 2.3 Benchmark directory-entry and buffered enumeration candidates on identical wide/deep fixtures; select and record directory concurrency and batching defaults.
- [x] 2.4 Build the paired relative-path inventory and exact discovered work count without a second traversal; cover empty trees, unmatched entries, incomplete discovery, and mutations during enumeration.
- [x] 2.5 Implement bounded content verification and worker/message backpressure, distinguishing byte equality from editability and detecting changes during reads.
- [x] 2.6 Add lazy selected-file text/hunk loading and cancellation-safe authorization/save checks; remove eager authorization rereads and whole-tree content transfers.
- [x] 2.7 Retain Git object inventories and load selected/base blobs on demand while preserving source labels, layers, and immutable identity; measure whether batching blob retrieval is needed.
- [x] 2.8 Wire concurrency, cache-byte, and queue/batch limits into real application configuration and validate effective limits in resource tests.

## 3. Comparison cache lifecycle and external changes

- [x] 3.1 Add comparison-owned inventory, fingerprint, pair-result, and byte-bounded text/hunk caches with versioned keys and eviction separate from dirty-document ownership.
- [x] 3.2 Retain reusable state across workspace switches and release caches, queues, workers, and watchers on successful comparison close; enforce aggregate work limits across open comparisons.
- [x] 3.3 Use watcher path information for scoped invalidation and directory updates, covering additions, deletions, renames, and atomic replacement on either side.
- [x] 3.4 Replace unconditional content polling and stale-tree recomputation with reconciliation that discovers topology changes and revalidates uncertain content; cover missing event names and watcher failures.
- [x] 3.5 Verify external-edit review, dirty-buffer retention, missing-counterpart authorization, and save-time verification remain intact with lazy loading and eviction.

## 4. Progressive folder UI

- [x] 4.1 Display inventory batches with grey accessible pending states and tree/list selection over one model; preserve lone-source behavior.
- [x] 4.2 Virtualize folder rows and preserve filtering, selection, expansion, and keyboard access as batches resolve.
- [x] 4.3 Add discovery counts and comparison progress with explicit incomplete/error/canceled states; throttle producers and reject obsolete progress.
- [x] 4.4 Add desktop interaction coverage proving inventory appears before content completion, statuses resolve correctly, selected-file work is prioritized, and cancellation or worker errors leave the app usable.

## 5. Incremental line and character differences

- [x] 5.1 Preserve edit ranges and persistent text versions through document edits, undo/redo, merge operations, and synchronization without whole-document replacement for known local edits.
- [x] 5.2 Maintain versioned incremental chunks and intraline changes with context expansion and a correct broader-diff fallback; retain precision/completion state.
- [x] 5.3 Reuse the same current diff results for editors, change lists, overview markers, and navigation; avoid navigation-only diff recomputation.
- [x] 5.4 Derive changed regions from affected external file versions while preserving review and invalidating only dependent results.
- [x] 5.5 Cover edits on both sides, long lines, repeated lines, Unicode, multiline offset shifts, undo/redo, merge acceptance, and stale asynchronous results against correctness oracles.

## 6. Performance and load acceptance

- [x] 6.1 Add bounded default and opt-in stress profiles, including 10,000/100,000 leaves, mixed sizes, near-limit files, mutation bursts, and declared platform-dependent skips.
- [x] 6.2 Add actual Electron stress scenarios covering first inventory, tree/list switching, selected-file diff, edit-to-highlight latency, cancellation, failures, and repeated open/switch/close cycles.
- [x] 6.3 Gate deterministic resource/work invariants: zero discovery content reads, bounded concurrent work/queues/text/DOM rows, no unrelated-file rediff for known edits, stale-result rejection, and released comparison resources.
- [x] 6.4 Run compatible baseline/candidate measurements for enumeration, initial comparison, open-comparison cache reuse, external changes, and incremental editing; report raw and median/tail results with OS-cache conditions disclosed.
- [x] 6.5 Select and record timing/memory acceptance budgets on identified hardware, verify optimized runs meet them with correct outputs, and investigate regressions before acceptance.
- [x] 6.6 Run focused model and desktop regressions for source lifecycle, editing/merging, navigation, unsupported inputs, and external-change review through quiet wrappers; inspect compact timing reports first, read scoped failure excerpts only as needed, and report any unresolved crash-diagnostic limitation.

## 7. Documentation

- [x] 7.1 Update docs/testing.md with wrapped commands for all suites and focused selections, status/diagnostic access, timing-history and polling behavior, plus benchmark/stress candidate interface, profiles, artifact schema, baseline comparison, cache-state interpretation, and prerequisites; replace documented direct-run defaults.
- [x] 7.2 Update docs/usage.md for pending nodes, tree/list selection, phase progress, incomplete results, and comparison-scoped cache lifetime.
- [x] 7.3 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.
