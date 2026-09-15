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

In the source chooser, browsing or committing a path loads that side immediately. A lone file opens as an editor and a lone folder opens as a tree; compatible ready sides compare automatically. Each loading side shows an estimated progress ring that reaches completion only after its source is ready. The location button starts linked, so a successful choice sets the next dialog location on both sides; unlink it to retain separate locations. When a selected path belongs to a repository, choose whether to browse its read-only commit history. The picker streams a bounded, scrollable graph with ref labels and full commit details. Selecting a commit reloads only that original file or folder scope and never checks out or changes the repository.

## Edit and merge

Select a file in the tree. Edit either writable side, accept individual differences using the arrow buttons, or copy the whole file. Save writes the focused document. Read-only snapshots can be copied into a writable destination or saved with Save as. Three-way merging requires file sources, a base, and an output path; merge choices modify the output buffer before an explicit save.

Side-by-side, unified, and merge layouts share documents and undo history. Adjacent typing and repeated deletion are one undo step until five seconds pass; Enter, paste, cut, replacements, transfers, merges, and reloads are separate steps. Undo and redo place the cursor at the changed text. Use Ctrl/Cmd+F for search, Ctrl/Cmd+S for save, Ctrl/Cmd+Z for undo, and Ctrl/Cmd+Shift+Z for redo. Theme and layout choices persist. Choose Device in the Theme selector to follow the operating system appearance while the app is open; Light and Dark remain fixed choices. Preferences controls the default per-document undo budget, initially 100 MiB. Full settings are stored in Electron's per-user application data directory as `settings.json`; `DIFFGUSTING_SETTINGS_DIR` overrides that directory when an isolated configuration is needed.

## Git categories

Committed, staged, and unstaged changes retain separate before/after versions. Their labeled entries remain together in the change list, including a staged edit that a later unstaged edit reverses. Select a category to inspect intermediate contents. Unsaved editor changes are labeled separately because they have not reached disk. A live comparison's committed layer defaults to HEAD and is empty unless another base is selected.

## External changes and saving

Clean files reload automatically through undoable transactions. Every observed external edit to a dirty file requires review, even when edits affect different lines. Review shows the synchronized baseline, observed disk version, and an editable result. Accept disk, keep your buffer, or merge manually. If disk changes again, resolving an older observed version cannot authorize overwriting the latest state.

Undo modifies memory, not disk, and saving preserves history. Closing the final document view or exiting discards history after the unsaved-change prompt. Old history can be evicted at the configured limit with a visible status notice; a transition too large to retain its immediate prior state is rejected until the budget is increased.

Saves recheck the disk fingerprint before replacement and verify afterward. Detected contention stops saving. An uncooperative external writer can still race the final filesystem replacement; the app cannot recover versions it never observed. Keep normal backups for important files.
