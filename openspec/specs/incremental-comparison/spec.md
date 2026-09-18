# Incremental comparison

## Purpose

Define correct, scoped reuse of comparison results after content changes.

## Requirements

### Requirement: Preserve changed ranges

The application SHALL preserve changed ranges for edits on either side, undo/redo, and merge acceptance. It SHALL update existing line and intraline diff results within affected regions plus necessary alignment context, retaining valid results elsewhere. Wider or full recomparison SHALL be used when necessary for correctness rather than assuming unchanged line numbers after insertion or deletion.

#### Scenario: One character changes in a large document

- **WHEN** a character is edited in an unambiguous region on either side
- **THEN** the affected diff region and character highlighting update without comparing the entire pair or replacing the entire synchronized document

#### Scenario: Alignment changes

- **WHEN** multiline insertion, deletion, or repeated text makes local alignment uncertain
- **THEN** recomparison expands as needed, later offsets remain correct, and the diff reconstructs the target without stale changes

### Requirement: Share versioned diff results

Editors, Git layer decorations, change lists, overview markers, and synchronized navigation SHALL consume compatible results for the current document versions. Navigation-only actions SHALL reuse valid results. Obsolete asynchronous results SHALL be discarded. Imprecise or incomplete results SHALL NOT be presented as fully resolved precise differences.

#### Scenario: Navigate after an edit

- **WHEN** the user edits and then scrolls, moves the cursor, or selects an overview marker
- **THEN** all surfaces use current mappings and navigation does not trigger independent whole-document diff calculations

#### Scenario: A result arrives after another edit

- **WHEN** diff work completes for an obsolete document version
- **THEN** it cannot replace current highlights or navigation mappings

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

### Requirement: External changes use affected-file scope

For external writes, the engine SHALL obtain the affected file's current contents and locate changed regions against its previous version when available. It SHALL reuse unaffected pair results and preserve external-change review. It SHALL NOT assume filesystem notifications supply line or byte ranges.

#### Scenario: External atomic replacement

- **WHEN** another program replaces one file while the comparison is open
- **THEN** its current version is verified, only dependent comparison work is invalidated, and an unsaved buffer is not overwritten without review
