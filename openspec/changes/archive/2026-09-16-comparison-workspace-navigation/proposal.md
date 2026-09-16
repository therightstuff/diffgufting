# Comparison workspace navigation

## Why

The workspace obscures which paths and Git versions are being compared, lists individual buffers instead of comparisons, and requires navigating panes independently. Clear source identity and coordinated navigation will make file comparison and merging easier to follow.

## What Changes

- Use the existing application icon image on OS application surfaces in development and packaged launches.
- Replace the Git discovery prompt with explicit Yes/No buttons and explain that No keeps the current working version from disk.
- Show prominent file paths and revision labels above editors, preferring branch/tag names and offering a display-name selector when several identify the same commit. Keep base revisions fixed and show a dirty circle next to the name when contents differ from that base.
- Replace Open Documents with unique open path-and-revision pairs. Different revision pairs are separate comparisons; edits and navigation do not create entries. Provide the 10 most recent unique comparisons under File → Recent.
- Synchronize cursor and both scroll axes across all panes in the active comparison, including base and merge result. Add a right-side change overview with a location indicator and click-to-center navigation.
- Replace changed-text underlines with stronger background highlighting.

## Capabilities

### New Capabilities

- `comparison-workspaces`: Unique comparison identity, open comparison lifetime, and recent comparisons.
- `synchronized-navigation`: Cursor and scroll coordination and a full-document change overview for the active comparison.

### Modified Capabilities

- `git-commit-selection`: Explicit working-version prompt wording and revision identity presentation.
- `themes-and-layouts`: Runtime application icons, prominent source headers, and changed-text background styling.

## Impact

Changes affect the renderer workspace and document ownership, host session selection, Git reference metadata, desktop menu and preference persistence, platform icon setup, and editor styles. Existing immutable snapshots, shared document history, independent source loading, and dirty-file protection remain required. Implementation will need focused model and desktop interaction coverage plus platform icon verification; no new dependency is proposed.
