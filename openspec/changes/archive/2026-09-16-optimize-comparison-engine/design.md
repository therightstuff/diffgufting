# Comparison engine design

## Context

The current filesystem loader interleaves directory discovery and content reads, retains decoded text for the whole tree, and authorization rereads writable entries. Workers exchange complete trees and compute hunks for every text pair. Polling rereads authorized files while comparison still uses loaded source inventories. The renderer builds every file row and separately recomputes diffs for the change list and navigation. CodeMirror already supports incremental chunk updates, but model synchronization replaces complete documents.

The user reported a closed window followed by Apple's report/ignore dialog. The failing process and termination reason are unknown; memory pressure is a hypothesis, not an established diagnosis. Cache lifetime is explicitly limited to the owning open comparison, including periods when another comparison is active.

## Goals / Non-Goals

Goals:

- Show folder structure before reading contents, then resolve accurate statuses with useful progress.
- Bound content memory, parallel work, message queues, and rendered rows independently of total file bytes.
- Reuse verified work until the relevant source changes or the comparison closes.
- Preserve edit ranges through all diff consumers and protect unsaved buffers.
- Establish repeatable correctness, performance, and load measurements for future algorithm choices.

Non-goals:

- Persistent comparison caches, new source kinds, following directory symlinks, or changing external-edit review policy.
- A universal constant-time leaf count or a guarantee that every edit can be resolved without surrounding context.
- Replacing CodeMirror or selecting a new runtime dependency without evidence.

## Decisions

### Retain a metadata-only inventory

Enumerate each filesystem source using directory entries, initially `readdir({ withFileTypes: true })` with bounded directory concurrency. Retain relative paths, entry types, and directory relationships; defer file content reads and unnecessary stats. Keep `.git` exclusion and do not silently introduce ignore rules. Do not follow directory links. Preserve empty directories for display and report unreadable subtrees as incomplete.

The exploratory local benchmark found 3,457 leaves and 1,504 directories: directory-entry enumeration took 58–66 ms, names plus individual stats 128–238 ms, and buffered `opendir` 125–171 ms. These two runs support a starting candidate only. The benchmark harness must compare candidates with controlled fixtures and alternating execution order. Buffered `opendir` is an alternative for very wide directories; avoid recursive APIs that materialize an unbounded complete tree before publishing progress.

Publish inventory batches before contents. Count unique relative non-directory paths across both inventories as comparison work items; matched files count once. Empty directories do not inflate file progress. A file/directory conflict is an explicit resolved conflict, and unavailable subtrees prevent a claim of complete discovery. No extra counting traversal is needed. Additions/removals are final only once the relevant opposite directory has been enumerated. Concurrent changes create a new inventory generation and a visibly revised workload.

### Separate discovery, equality, and detailed diff work

Model node states as pending, checking, equal, changed, added, removed, conflict, or unavailable. Pending nodes remain grey with accessible text. Aggregate folders remain pending while descendants are unresolved. Offer tree/list display over the same inventory and render only visible rows with bounded overscan.

After inventory completion, compare file types and sizes, then stream content verification where needed. Different lengths establish byte inequality; equal sizes or timestamps do not establish equality. Keep raw-content equality distinct from text editability, encoding, and newline presentation. Skip detailed hunks for equal files and load text/hunks on selection, prioritizing selected work. Binary and oversized entries can receive equality results without becoming editable.

Use a bounded worker pool and bounded batches with backpressure; send metadata and result deltas, not complete text trees. Throttle updates at the producer. Scope every message to comparison, source generation, and content version. Cancellation and closure invalidate work and release resources even when a worker fails. Preserve current path authorization and save-time verification when making document loading lazy.

### Comparison-owned caches and targeted invalidation

Each comparison owns its inventory, verified fingerprints, pair results, and bounded text/hunk cache. Key results by both source identities, relative path, verified versions, comparison options, and algorithm version. Git snapshots use resolved object identities; live sources use invalidation and content verification. Reuse existing loaded state during authorization instead of reading every file again.

Switching comparisons retains caches. Closing releases workers, watchers, queues, and cache references; no cache is written to disk. Dirty documents remain governed by shared document ownership and close protection, independently of evictable cache entries. Content caches use byte budgets; lightweight inventory size necessarily grows with entry count. Bound aggregate worker concurrency across open comparisons.

Use watcher filenames to invalidate files and affected directories, handling create/delete/rename and atomic replacement. Missing filenames, watcher errors, and lost-event uncertainty trigger scoped or full reconciliation. Periodic metadata reconciliation discovers new paths and checks versions without unconditional content reads. Metadata is a reuse hint, not proof: when continuity is uncertain, mark cached states pending and verify content. A mutation during a read must not publish a verified result for a mixed version; retry or show pending/unavailable. External edits continue through review before replacing dirty buffers.

For Git folders, retain tree/object metadata and retrieve blobs on demand. Avoid eagerly attaching every base text solely to show revision labels. Evaluate batched blob retrieval if measurements show process startup dominates.

### One versioned incremental diff result

Carry CodeMirror change descriptions through document transactions, undo/redo, merge acceptance, and model-to-view synchronization. Keep persistent text structures and existing chunks; apply `Chunk.updateA`/`updateB` for changed ranges. Editors, the change list, overview, and navigation consume the same versioned line/intraline result. Do not serialize entire documents merely to invalidate caches or refresh navigation.

Incremental updates include surrounding context and can expand across affected chunks. Use broader or full recomparison when alignment cannot safely be reused, including repeated text or large edits. Preserve and expose imprecise/time-limited outcomes rather than presenting them as fully resolved precision. For external writes, the filesystem does not supply edit offsets: read the affected file, identify changed regions against its cached version, then update the pair. This reduces pair diff work but cannot promise sub-file I/O for arbitrary external rewrites.

### A reusable benchmark and load harness

Separate fixture generation, candidate execution, correctness validation, and reporting. Provide a common candidate interface for enumeration, equality/cache processing, and incremental diff techniques without introducing a production plugin API. A runner selects fixture, seed, scale, candidate, repetition count, cache mode, and output path. Execute it through the common quiet test wrapper described below, with full measurements in artifacts. Keep fixture generation outside measured phases and run candidates against identical immutable inputs in isolated runs.

Provide a bounded default profile and an explicitly selected stress profile. Version deterministic fixtures covering flat/wide/deep trees, many tiny files, mixed file sizes, equal and changed ratios, binary/oversized files, repeated lines, long lines, Unicode, one-character edits, multiline insertions/deletions, changes on either side, and mutation bursts. Stress scales include 10,000 and 100,000 leaves, large files near the editing limit, and repeated open/switch/close cycles. Environmental cases such as permission failures and symlinks declare prerequisites and explicit skips.

Measure discovery time, first visible inventory, total equality time, first selected diff, edit-to-highlight latency, host and renderer responsiveness, peak memory by process, bytes read, stat/read counts, files rediffed, character spans rediffed, cache hits/misses, active workers, queued messages, and rendered row counts. Use test-only counters where possible. Large-file samples include worker and renderer memory; host heap alone is insufficient. Unavailable measurements must be explicit, never recorded as zero.

Write versioned JSON with raw samples, median/tail latency, correctness results, seed/fixture hash, candidate/code version, settings, Node/Electron/OS/architecture, hardware and filesystem information, and errors/timeouts. Human-readable comparison summarizes baseline/candidate deltas and rejects incompatible fixture or configuration comparisons. Capture an existing-engine baseline before changing production code; record crashes and timeouts as failures rather than dropping those samples.

Distinguish a fresh comparison cache from filesystem cache state. Repeat warmups and measured trials with alternating candidate order; disclose OS cache state as uncontrolled unless explicitly measured. Never claim a fresh session means cold disk. Avoid universal timing thresholds across machines. Gate deterministic invariants such as no discovery content reads, bounded in-flight work, no unaffected-file rediff after a known edit, and released cache ownership after close. Select and record timing/memory budgets from baseline runs on identified hardware before final acceptance. Store compact benchmark artifacts and document commands to compare future techniques.

Validate folder results against independently known fixture manifests and streaming equality checks. Validate incremental results by reconstructing the target, checking unchanged spans, and comparing with a full-diff reference where alignment is canonical. Repeated text can admit multiple correct alignments; do not reject a valid diff solely for different hunk boundaries. Exercise the real Electron flow as well as isolated engine candidates so renderer crashes and stalled progress cannot hide behind host-only results.

### Quiet wrappers and timing reports for every test suite

Current `npm test` and `npm run test:desktop` invoke Node's test runner directly, and docs/testing.md also documents a direct focused desktop command. Introduce one shared wrapper/reporting layer for all existing and future test entrypoints, including model/unit, integration, desktop, CLI, packaged-app, performance, load, and focused subsets. Preserve native filtering, exit semantics, prerequisites, and serialized graphical execution. Do not add per-suite wrapper implementations or require an agent to wrap each individual test. Benchmarks retain their specialized measurement schema behind this common execution contract.

Default console output is a short start record and a bounded terminal summary; detailed stdout/stderr and structured results go to unique per-run artifacts. Expose explicit verbose and scoped diagnostic modes. Set configurable output byte budgets (initial defaults: 4 KiB terminal summary and 1 KiB status reply) so emitted text is testable without relying on a model-specific tokenizer. Report total failure counts and a bounded list of names/excerpts with links to all omitted details. Stream logs to disk rather than buffering entire runs. Artifact write/parse failures and missing terminal results are runner failures, never success inferred from a quiet console. Preserve child failure status, timeout/cancellation distinction, and cleanup of only owned processes.

Publish a small atomic status artifact keyed by run identity, with selection, state, elapsed time, current suite, completed counts, and recommended polling interval. A status query reads this artifact without replaying logs. Prefer completion notifications when available. Otherwise use 10 seconds without compatible history, then one quarter of the median duration of comparable completed selections, clamped to 10–60 seconds. Notify failures promptly; polling guidance is not a test timeout or permission to skip completion checks. Suppress repetitive unchanged progress output.

Every terminal report includes start/end timestamps, measured wall duration, per-suite durations and outcomes, counts, child exit code/signal, artifact paths, and recommended polling interval with its history basis. Failed, canceled, timed-out, or interrupted suites retain their observed elapsed time and incomplete status; unavailable measurements are explicit. Per-test duration details, when available, remain in structured artifacts. Concurrent suite durations need not sum to run wall time. Final reports and timing history survive process exit so later agents can reuse them. History is bounded and keyed by suite/selection, relevant configuration, runtime/platform, and concurrency; incompatible or incomplete runs do not inform successful-duration estimates. This local test history is separate from comparison caches and does not change their open-comparison-only lifetime.

Validate wrappers with deterministic noisy child fixtures: assert output budgets, complete artifact retention, exact selection/exit propagation, finite durations, failure summaries, atomic status reads, and polling recommendations with and without compatible history. Include missing reports, spawn errors, cancellation, timeout, and unavailable timing cases. Do not run expensive suites merely to verify formatting. Documentation and default commands must route future agents through wrappers; manual summarization after reading full logs is insufficient.

## Risks / Trade-offs

- Enumeration requires work proportional to entry count → stream batches and retain one inventory; never claim an exact total for inaccessible descendants.
- More open comparisons retain more inventory → use byte-bounded evictable content, global work limits, and measured lifecycle tests.
- Watchers miss events and metadata can be ambiguous → invalidate uncertain results and reconcile; document filesystem assumptions.
- Local alignment can be ambiguous → validate content reconstruction and expand recomparison when required.
- Performance tests can be noisy or expensive → separate bounded default coverage from stress runs and compare compatible repeated samples.
- Crash cause is unknown → inspect retained macOS reports if available and reproduce in an isolated load run; report any remaining diagnostic gap.

## Migration Plan

First add and validate the shared quiet test wrapper, route all existing test commands through it, then add reusable fixtures and record existing-engine results. Then introduce inventory/progress events and comparison-owned caches, migrate loading and rendering, and consolidate incremental diff consumers. Run semantic checks and benchmark comparisons after each stage using stable fixture versions and compact timing reports. Finish with real desktop stress/lifecycle coverage and documentation. No persistent comparison-cache migration is needed. Rollback consists of reverting the implementation; retain benchmark fixtures and results to explain the regression.

## Open Questions

- Can the original crash report identify the failing process and termination reason? If unavailable, record that limitation and use reproducible load failures rather than asserting an original cause.
- Which concurrency, byte-cache, batching, and timing budgets fit supported hardware? Determine through the baseline/candidate runs and record the selected defaults in configuration and benchmark artifacts.
