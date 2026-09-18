# Editing latency evaluation changes

## ADDED Requirements

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
