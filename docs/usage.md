# Using Diffgusting

## Compare sources

After `npm ci` and `npm run build`, run `npm start -- LEFT RIGHT` to launch an independent window. Use `npm start` for the source chooser. Add `--wait` to wait for the window to close. Packaged distributions provide a `diffgusting` launcher (`diffgusting.cmd` on Windows) with the same arguments and a bundled runtime.

```sh
npm start -- ./before.txt ./after.txt
npm start -- ./old-folder ./new-folder --wait
npm start -- --left-repo ./repo-a --left-ref main --right-repo ./repo-b --right-ref HEAD
npm start -- --left-repo ./repo --left-ref HEAD --right-repo ./repo --right-ref @worktree --git-base main
npm start -- left.txt right.txt --base ancestor.txt --output result.txt
```

Use `--left-path`, `--right-path`, or `--base-path` to select a relative file or subtree within a Git source. `@index` selects staged contents; `@worktree` selects tracked and untracked, non-ignored working files; `@base`, `@ours`, and `@theirs` select unmerged index stages. Repository data is only read. Unsupported binary, mixed-newline, symlink, and oversized entries display an explanation instead of an editable buffer.

In the source chooser, browsing or committing a path loads that side immediately. A lone file opens as an editor and a lone folder opens as a tree; compatible ready sides compare automatically. Folder names appear as pending entries while content verification is still running. The Files heading reports discovered/checking/ready inventory state. Use the Files View control to switch between a flat list and an expandable tree; both views keep the same file selection and filter. Selecting a resolved file loads its editor text and hunks on demand. Large lists render an initial bounded page; use Show more, or filter, without losing selection. Each loading side shows an estimated progress ring that reaches completion only after its source is ready. The location button starts linked, so a successful choice sets the next dialog location on both sides; unlink it to retain separate locations. When a selected path belongs to a repository, choose whether to browse its read-only commit history. The picker streams a bounded, scrollable graph with ref labels and full commit details. Selecting a commit reloads only that original file or folder scope and never checks out or changes the repository.

## Edit and merge

Select a file in the tree. Edit either writable side, accept individual differences using the arrow buttons, or copy the whole file. Save writes the focused document. Read-only snapshots can be copied into a writable destination or saved with Save as. Three-way merging requires file sources, a base, and an output path; merge choices modify the output buffer before an explicit save.

## Comparisons and navigation

Open Comparisons lists each selected file/folder path-and-revision pair once. Selecting another revision opens a separate comparison; browsing child files and editing do not add entries. Switching comparisons retains unsaved buffers and undo history. Use the × beside a comparison to close it; closing the final view of unsaved or contested work offers save, discard, or cancel. Leaving an edited unfinished selection for a recent or retained comparison offers the same protection. Open comparisons retain their inventory and bounded comparison cache while you switch between them; closing one releases its workers, watchers, queues, and cache. File → Recent reopens the latest 10 unique comparisons, including after restarting. Recent entries retain paths and fixed revisions, never unsaved buffers or undo history.

Each pane's header shows its file path and source version. Branch and tag names take precedence over a bare commit hash; when several names identify the commit, select which name to display. This selection does not change the compared revision. The full path and hash are available in header tooltips. Working tree identifies live contents. A circle beside a Git revision means the displayed contents differ from that fixed base; saving does not clear the circle while those differences remain. UNSAVED separately identifies changes not yet saved to disk.

The Git version prompt has explicit Yes and No choices. Yes opens the commit picker; No or dismissal keeps the current working version from disk.

Cursor position and both scroll axes follow corresponding content across the active comparison's panes, including base and merge result. Other comparisons keep their own position. The right-side overview marks changes across the whole document and outlines the current viewport. Click a position to center it in every active pane, or focus the overview and use arrows, Page Up/Down, Home, or End. Previous/Next change uses the same coordinated navigation. The overview is empty when there are no differences. Changed characters use stronger background colors within the softer line highlights.

## Layouts and preferences

Side-by-side, unified, and merge layouts share documents and undo history. Adjacent typing and repeated deletion are one undo step until five seconds pass; Enter, paste, cut, replacements, transfers, merges, and reloads are separate steps. Undo and redo place the cursor at the changed text. Use Ctrl/Cmd+F for search, Ctrl/Cmd+S for save, Ctrl/Cmd+Z for undo, and Ctrl/Cmd+Shift+Z for redo. Theme and layout choices persist. Choose Device in the Theme selector to follow the operating system appearance while the app is open; Light and Dark remain fixed choices. Preferences controls the default per-document undo budget, initially 100 MiB. Full settings are stored in Electron's per-user application data directory as `settings.json`; `DIFFGUSTING_SETTINGS_DIR` overrides that directory when an isolated configuration is needed.

## Git categories

Committed, staged, and unstaged changes retain separate before/after versions. Their labeled entries remain together in the change list, including a staged edit that a later unstaged edit reverses. Select a category to inspect intermediate contents. Unsaved editor changes are labeled separately because they have not reached disk. A live comparison's committed layer defaults to HEAD and is empty unless another base is selected.

## External changes and saving

Clean files reload automatically through undoable transactions. The host applies watcher paths to the affected entry where possible, and reconciles the whole selected root only for topology changes or unavailable watcher detail. Every observed external edit to a dirty file requires review, even when edits affect different lines. Review shows the synchronized baseline, observed disk version, and an editable result. Accept disk, keep your buffer, or merge manually. If disk changes again, resolving an older observed version cannot authorize overwriting the latest state.

Undo modifies memory, not disk, and saving preserves history. Closing the final document view or exiting discards history after the unsaved-change prompt. Old history can be evicted at the configured limit with a visible status notice; a transition too large to retain its immediate prior state is rejected until the budget is increased.

Saves recheck the disk fingerprint before replacement and verify afterward. Detected contention stops saving. An uncooperative external writer can still race the final filesystem replacement; the app cannot recover versions it never observed. Keep normal backups for important files.
