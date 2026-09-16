# Git selection and source identity

## ADDED Requirements

### Requirement: Explicit working-version choice

The repository-discovery prompt SHALL provide buttons labeled Yes and No and explain that Yes opens the historical commit picker while No loads or retains the current working version from disk. Dismissing the prompt SHALL retain that working source. Loading SHALL remain independent of the choice, and obsolete prompts SHALL NOT affect replacement selections.

#### Scenario: Decline historical selection

- **WHEN** repository discovery offers commit selection and the user selects No
- **THEN** the current working version remains selected and the commit picker does not open

#### Scenario: Accept historical selection

- **WHEN** the user selects Yes
- **THEN** the scoped commit picker opens while the working source remains available until a commit is selected

### Requirement: Fixed base identity and selectable reference labels

Git sources SHALL retain a full resolved base commit identity for the comparison lifetime. Working-tree sources SHALL capture their base at selection and be labeled Working tree; repositories without commits SHALL display that state without a fabricated revision. Headers SHALL prefer matching branch/tag names over hash-only labels, with deterministic default precedence of local branches, tags, then remote branches. Multiple matching names SHALL be selectable by clicking the label. Alias selection SHALL change only the displayed name, not contents, revision, or comparison identity. Full commit identity SHALL remain accessible. Ref movement SHALL NOT silently change the fixed base or imply that a moved name still points to it.

#### Scenario: Multiple names identify one commit

- **WHEN** branches or tags resolve to the displayed base commit, including annotated tags
- **THEN** a name is shown preferentially and clicking it offers all matching names when more than one exists

#### Scenario: Display an unreferenced commit

- **WHEN** no branch or tag identifies the fixed commit
- **THEN** the header displays a commit hash with access to the full object ID

### Requirement: Base-relative dirty circle

A Git-backed file header SHALL display an accessible dirty circle beside its revision name when its displayed contents differ from the fixed base. Editing or saving SHALL NOT change that base. Saving SHALL clear unsaved-to-disk state separately and SHALL NOT clear base-relative dirty state while differences remain. Historical snapshots SHALL remain immutable; merge results with an explicit base SHALL use that base for this indicator.

#### Scenario: Save modified working contents

- **WHEN** edited contents are saved but still differ from the fixed commit
- **THEN** the base identity and dirty circle remain while unsaved-to-disk state clears

#### Scenario: Restore base contents

- **WHEN** the displayed contents return to the fixed base version
- **THEN** the base-relative circle clears without creating another comparison
