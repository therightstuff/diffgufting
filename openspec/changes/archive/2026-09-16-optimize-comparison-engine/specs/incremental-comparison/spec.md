# Incremental comparison

## ADDED Requirements

### Requirement: Preserve changed ranges

The application SHALL preserve changed ranges for edits on either side, undo/redo, and merge acceptance. It SHALL update existing line and intraline diff results within affected regions plus necessary alignment context, retaining valid results elsewhere. Wider or full recomparison SHALL be used when necessary for correctness rather than assuming unchanged line numbers after insertion or deletion.

#### Scenario: One character changes in a large document

- **WHEN** a character is edited in an unambiguous region on either side
- **THEN** the affected diff region and character highlighting update without comparing the entire pair or replacing the entire synchronized document

#### Scenario: Alignment changes

- **WHEN** multiline insertion, deletion, or repeated text makes local alignment uncertain
- **THEN** recomparison expands as needed, later offsets remain correct, and the diff reconstructs the target without stale changes

### Requirement: Share versioned diff results

Editors, change lists, overview markers, and synchronized navigation SHALL consume compatible results for the current document versions. Navigation-only actions SHALL reuse valid results. Obsolete asynchronous results SHALL be discarded. Imprecise or incomplete results SHALL NOT be presented as fully resolved precise differences.

#### Scenario: Navigate after an edit

- **WHEN** the user edits and then scrolls, moves the cursor, or selects an overview marker
- **THEN** all surfaces use current mappings and navigation does not trigger independent whole-document diff calculations

#### Scenario: A result arrives after another edit

- **WHEN** diff work completes for an obsolete document version
- **THEN** it cannot replace current highlights or navigation mappings

### Requirement: External changes use affected-file scope

For external writes, the engine SHALL obtain the affected file's current contents and locate changed regions against its previous version when available. It SHALL reuse unaffected pair results and preserve external-change review. It SHALL NOT assume filesystem notifications supply line or byte ranges.

#### Scenario: External atomic replacement

- **WHEN** another program replaces one file while the comparison is open
- **THEN** its current version is verified, only dependent comparison work is invalidated, and an unsaved buffer is not overwritten without review
