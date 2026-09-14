# Desktop diff editor

## Why

Users need one editable comparison workspace for files, folders, and Git revisions, including unrelated repositories. Existing two-endpoint views do not express overlapping committed, staged, and unstaged changes or safely reconcile external edits with an active editing session.

## What Changes

- Add a CLI-launched desktop app for Windows, macOS, and Linux with an independent window and process lifetime.
- Compare files, directory trees, and Git snapshots from the same or different repositories.
- Provide text editing, hunk transfer, whole-file transfer, and three-way merging into a writable result.
- Display committed, staged, and unstaged changes together, including overlapping and canceled changes.
- Watch open files, folders, and relevant Git state; require review of every external change to a dirty document.
- Preserve bounded, configurable in-memory undo history across all document content transitions, including reloads and merge decisions.
- Support replaceable themes and layouts through shared document and comparison models, retaining a path to browser delivery.
- Use generated pixel-art branding based on the supplied large and small heads in `assets/branding/legally-human.jpeg` for the project logo and desktop icon.
- Defer Git mutations and persistent undo history.

## Capabilities

### New Capabilities

- `desktop-comparison`: CLI lifecycle, source selection, file/folder comparison, and desktop distribution.
- `editing-and-merging`: Editable documents, transfers, merge results, saving, and session undo.
- `git-change-layers`: Immutable Git sources and simultaneous change provenance.
- `external-change-review`: Watching, automatic clean reloads, dirty-file contention, and save coordination.
- `themes-and-layouts`: Extensible presentation with shared state, a portable UI boundary, and consistent human-face pixel-art branding.

### Modified Capabilities

None; there are no existing capability specifications.

## Impact

This is a new application; no existing application interfaces require migration. The proposed stack is Node.js and Electron with a browser-compatible renderer and a small, justified dependency set. Git comparisons require an installed Git executable; filesystem comparisons do not. Distribution, platform testing, editor integration, watcher recovery, and documentation are part of the change. Browser delivery and Git mutation commands are follow-up work.
