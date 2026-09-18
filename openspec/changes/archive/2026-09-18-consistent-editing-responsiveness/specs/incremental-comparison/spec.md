# Editing result reuse changes

## MODIFIED Requirements

### Requirement: Share versioned diff results

Editors, Git layer decorations, change lists, overview markers, and synchronized navigation SHALL consume compatible results for the current document versions. Navigation-only actions SHALL reuse valid results. Obsolete asynchronous results SHALL be discarded. Imprecise or incomplete results SHALL NOT be presented as fully resolved precise differences.

#### Scenario: Navigate after an edit

- **WHEN** the user edits and then scrolls, moves the cursor, or selects an overview marker
- **THEN** all surfaces use current mappings and navigation does not trigger independent whole-document diff calculations

#### Scenario: A result arrives after another edit

- **WHEN** diff work completes for an obsolete document version
- **THEN** it cannot replace current highlights or navigation mappings

## ADDED Requirements

### Requirement: Bounded edit propagation work

For an unambiguous local edit, compatible consumers SHALL reuse current versioned diff results without independently recomputing full document pairs solely to derive another representation. Immutable Git layer differences SHALL be reused while their input versions remain unchanged. Secondary views of a writable document SHALL receive the changed ranges rather than unconditional full-document replacement. Necessary full recomparison for uncertain alignment SHALL remain supported and identifiable in diagnostic results. Edits SHALL preserve undo/redo, merge acceptance, source immutability, and external-change review.

#### Scenario: Type into a Git working file

- **WHEN** an unambiguous character edit updates a working file with unchanged Git layer inputs
- **THEN** the renderer updates affected mappings and decorations without re-diffing immutable layer pairs or independently full-diffing the same current document pair for each consumer

#### Scenario: Shared writable document

- **WHEN** one view edits a document shared by multiple comparisons
- **THEN** the shared buffer and history remain consistent and secondary mounted views receive scoped changes

#### Scenario: Alignment requires fallback

- **WHEN** an edit makes incremental alignment unreliable
- **THEN** wider recomparison preserves correct results, is identified as fallback, and obsolete versions cannot replace current results
