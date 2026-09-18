# Comparison performance and load testing

## Purpose

Define reproducible performance and load evaluation for comparison-engine changes.

## Requirements

### Requirement: Reusable candidate benchmark harness

The project SHALL provide a documented runner that executes alternative enumeration, content-comparison/cache, and incremental-diff techniques against identical versioned fixtures. Inputs SHALL include fixture, deterministic seed, scale, candidate, repetitions, comparison-cache mode, and result destination. Fixture setup SHALL be excluded from measured execution. The harness SHALL capture an existing-engine baseline before implementation changes.

#### Scenario: Compare a future technique

- **WHEN** a candidate implements the common benchmark interface
- **THEN** it can run the existing workload and correctness checks without rewriting fixture generation, measurement, or reporting
- **AND** a baseline/candidate report compares compatible runs and explicitly rejects mismatched fixtures or relevant settings

### Requirement: Representative performance and load profiles

The suite SHALL provide bounded default coverage and an explicitly selected stress profile. Deterministic workloads SHALL cover wide and deep trees, many tiny files, mixed sizes, equal/changed ratios, binary and oversized files, long/repeated lines, Unicode, character and multiline edits on either side, external mutation bursts, cancellation, and repeated open/switch/close cycles. Stress profiles SHALL include 10,000 and 100,000 leaves and large files near the configured editing limit. Environment-dependent cases SHALL declare prerequisites and explicit skips.

#### Scenario: Run a desktop stress comparison

- **WHEN** the stress profile runs through the actual Electron UI
- **THEN** it exercises inventory display, tree/list switching, progressive statuses, selecting a file, editing, cancellation, and closure
- **AND** crashes, hangs, errors, missing progress, and cleanup failures are recorded as failures rather than omitted samples

#### Scenario: Repeat lifecycle load

- **WHEN** comparisons are repeatedly opened, switched, and closed
- **THEN** measurements verify bounded active work and retained content, cache reuse while open, and released cache ownership and background resources after closure

### Requirement: Comparable measurement artifacts

The runner SHALL emit versioned machine-readable artifacts containing raw samples, median/tail latency, correctness outcomes, failures, fixture hash/seed, candidate and code identity, effective settings, runtime/OS/architecture, and hardware/filesystem context. It SHALL measure phase timings, edit latency, host/renderer responsiveness, peak memory across participating processes, I/O counts and bytes, recomputed files and character spans, cache outcomes, worker/message counts, and mounted rows. Unsupported measurements SHALL be marked unavailable rather than zero. Performance and load runs SHALL use the common test-execution reporting wrapper, with raw samples and detailed logs in artifacts and only bounded summaries/status on the default console.

#### Scenario: Interpret cache measurements

- **WHEN** comparing fresh-comparison and reused-comparison runs
- **THEN** results distinguish application cache state from OS filesystem cache state and disclose uncontrolled disk-cache conditions
- **AND** warmups, repetition counts, and candidate order are recorded

#### Scenario: Timing comparison across machines

- **WHEN** results were collected on different environments
- **THEN** the report identifies that difference and does not apply an unexplained universal timing threshold

#### Scenario: Inspect a long benchmark run

- **WHEN** an agent monitors or retrieves the result of a performance or load run
- **THEN** it receives a compact status or final summary with elapsed/suite timings, artifact paths, and timing-based polling guidance without reading raw samples or full logs

### Requirement: Accuracy and resource regression gates

Performance results SHALL be accepted only alongside correctness validation. Folder outputs SHALL match known manifests and independently verified content. Incremental diffs SHALL reconstruct targets, preserve unchanged spans, and agree with a full-diff reference where alignment is canonical. Tests SHALL allow alternative valid alignment of repeated text. Default regression checks SHALL enforce no content reads during discovery, configured work/queue/content limits, no unrelated-file rediff for a known edit, bounded rendered rows, rejection of stale results, and resource release after close. Timing and memory acceptance budgets SHALL be recorded against identified baseline hardware before final implementation acceptance.

#### Scenario: A faster candidate produces an incorrect result

- **WHEN** a candidate skips a changed file or produces invalid incremental ranges
- **THEN** its correctness gate fails even if its timing improves

#### Scenario: A candidate adds unnecessary work

- **WHEN** a one-file edit causes unrelated files to be rediffed or configured resource bounds are exceeded
- **THEN** deterministic regression checks fail independently of wall-clock timing noise

### Requirement: Reproducible interactive editing latency

Performance evaluation SHALL include side-by-side historical-to-working comparisons with Git layer context and repeated comparison switching. The initial investigation SHALL attempt the reported local case, `/Users/adamfisher/dev/cards-base/docs/spec.md` at `1fa8cefe08f7` versus working tree, using isolated copies without altering the source. Reports SHALL capture resolved revision, content hashes, settings, edit positions, runtime/hardware, warmups, repetitions, and reproduction limits. Portable regression fixtures SHALL NOT require that local repository or commit private source contents.

The runner SHALL record raw input-to-painted-text and diff-convergence samples, median and tail latency, renderer long tasks, and relevant diff/DOM work. Unsupported measurements SHALL be explicit. Acceptance SHALL require a reproduced baseline, recorded numerical budgets on identified hardware, comparable post-change results within those budgets, and correctness gates. A failed reproduction SHALL remain an explicit unresolved result, not a claimed repair.

#### Scenario: Measure the reported comparison

- **WHEN** the supplied local source and revision are available
- **THEN** baseline and candidate execute identical recorded edits against matching isolated inputs with Git context preserved

#### Scenario: Local case unavailable

- **WHEN** the original case is unavailable or cannot reproduce the delay
- **THEN** the report states the limitation and portable fixture results do not claim that the reported delay is fixed

#### Scenario: Switch away and return

- **WHEN** the runner repeatedly edits and switches among comparisons
- **THEN** it measures each comparison separately and detects growing work, lost state, or stale results on returning

#### Scenario: Accept a responsiveness fix

- **WHEN** a candidate is evaluated for acceptance
- **THEN** it meets recorded latency budgets and preserves text, undo/redo, highlighting, navigation, and resource bounds
