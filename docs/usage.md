# Using Diffgufting

## Compare sources

After `npm ci` and `npm run build`, run `npm start -- LEFT RIGHT` to launch an independent window. Use `npm start` for the source chooser. Add `--wait` to wait for the window to close. Packaged distributions provide a `diffgufting` launcher (`diffgufting.cmd` on Windows) with the same arguments and a bundled runtime.

```sh
npm start -- ./before.txt ./after.txt
npm start -- ./old-folder ./new-folder --wait
npm start -- --left-repo ./repo-a --left-ref main --right-repo ./repo-b --right-ref HEAD
npm start -- --left-repo ./repo --left-ref HEAD --right-repo ./repo --right-ref @worktree --git-base main
npm start -- left.txt right.txt --base ancestor.txt --output result.txt
```

Use `--left-path`, `--right-path`, or `--base-path` to select a relative file or subtree within a Git source. `@index` selects staged contents; `@worktree` selects tracked and untracked, non-ignored working files; `@base`, `@ours`, and `@theirs` select unmerged index stages. Repository data is only read. Unsupported binary, mixed-newline, symlink, and oversized entries display an explanation instead of an editable buffer.

On New comparison, choose File or Folder, then browse or enter each path independently. A lone file opens as an editor and a lone folder exposes its inventory. The comparison appears in Open Comparisons as soon as its first source is selected, and its title updates as each source loads. Select **Open comparison** to finalize the ready pair, or change either path or revision: changing a ready pair preserves the original and opens a related comparison with Back/Forward navigation. Changing the draft type clears its sources, with save/discard/cancel protection for edited work. An opened comparison keeps its type. CLI arguments and File → Recent open pairs directly.

Folder names appear as pending entries while verification runs. The Files heading reports discovered/checking/ready inventory state. Use View to switch between a flat list and expandable tree. Selecting a resolved file loads its editor text and hunks on demand. Scroll to reveal more entries; only a viewport-sized range is mounted. Arrow keys, Home, and End navigate the list. Each loading side shows estimated progress and any failure beside its selector. Browse locations start linked; unlink them to retain separate locations.

Git-backed paths expose a version control without a discovery prompt. Open it to choose a branch, tag, or commit from scoped history, or return to the working version. Choices retain the original file/folder scope and never check out or modify repository references. A historical path that did not exist remains an absent source of the selected type.

## Edit and merge

Select a file in the tree. Edit either writable side, accept individual differences using the arrow buttons, or copy the whole file. Save writes the focused document. Read-only snapshots can be copied into a writable destination or saved with Save as. Three-way merging requires file sources, a base, and an output path; merge choices modify the output buffer before an explicit save.

## Comparisons and navigation

Open Comparisons occupies the bottom third of the sidebar, scrolls separately from Files, and can be collapsed using its heading. New… starts an empty draft without closing existing comparisons: their group slots remain visible, and selecting a slot restores its current member and edits. Each group occupies one slot showing only its current comparison. Change either root path by typing or Browse, or choose a Git revision, to create or activate a member in that same group. The file/folder type remains fixed. Use the Back/Forward arrows beside the source controls at the top to navigate that group's comparison windows. There is no group-history dropdown. Editing and browsing child files do not add members. Selecting different sources after Back drops forward visits without closing those retained comparisons; selecting their paths/revisions again reactivates them.

Switching comparisons retains unsaved buffers, undo history, selected files, and folder scroll positions. Use × to close the member currently representing a group; closing the final reference to unsaved or contested work offers save, discard, or cancel. Closure selects a surviving prior visit in that slot; a group disappears only after its last member closes. Closing all groups returns to New. New, Recent, and sidebar navigation also retain loaded work before Open comparison is clicked, without a save/discard prompt. Select its sidebar entry to resume editing; use its × button to explicitly close it. Changing its sources or type still protects edits that would be discarded. Closing releases the comparison's workers, watchers, queues, and cache. File → Recent reopens the latest 10 unique pairs across restarts, retaining descriptors but never unsaved buffers or undo history.

Each pane's header shows its file path and source version. Branch and tag names take precedence over a bare commit hash; when several names identify the commit, select which name to display. This selection does not change the compared revision. The full path and hash are available in header tooltips. Working tree identifies live contents. A circle beside a Git revision means the displayed contents differ from that fixed base; saving does not clear the circle while those differences remain. UNSAVED separately identifies changes not yet saved to disk.

Canceling revision selection leaves the current comparison intact. Failed or obsolete selections do not replace it. Display aliases identify the same fixed commit and do not add comparison members or history visits.

Cursor position and both scroll axes follow corresponding content across the active comparison's panes, including base and merge result. Other comparisons keep their own position. The right-side overview marks changes across the whole document and outlines the current viewport. Click a position to center it in every active pane, or focus the overview and use arrows, Page Up/Down, Home, or End. Previous/Next change uses the same coordinated navigation. The overview is empty when there are no differences. Changed characters use stronger background colors within the softer line highlights.

## Layouts and preferences

Side-by-side, unified, and merge layouts share documents and undo history. Adjacent typing and repeated deletion are one undo step until five seconds pass; Enter, paste, cut, replacements, transfers, merges, and reloads are separate steps. Undo and redo place the cursor at the changed text. Use Ctrl/Cmd+F for search, Ctrl/Cmd+S for save, Ctrl/Cmd+Z for undo, and Ctrl/Cmd+Shift+Z for redo. Theme and layout choices persist. Choose Device in the Theme selector to follow the operating system appearance while the app is open; Light and Dark remain fixed choices. Preferences controls the default per-document undo budget, initially 100 MiB. Full settings are stored in Electron's per-user application data directory as `settings.json`; `DIFFGUFTING_SETTINGS_DIR` overrides that directory when an isolated configuration is needed.

## Git categories

Committed, staged, and unstaged changes retain separate before/after versions. Their labeled entries remain together in the change list, including a staged edit that a later unstaged edit reverses. Select a category to inspect intermediate contents. Unsaved editor changes are labeled separately because they have not reached disk. A live comparison's committed layer defaults to HEAD and is empty unless another base is selected.

## External changes and saving

Clean files reload automatically through undoable transactions. The host applies watcher paths to the affected entry where possible, and reconciles the whole selected root only for topology changes or unavailable watcher detail. Every observed external edit to a dirty file requires review, even when edits affect different lines. Review shows the synchronized baseline, observed disk version, and an editable result. Accept disk, keep your buffer, or merge manually. If disk changes again, resolving an older observed version cannot authorize overwriting the latest state.

Undo modifies memory, not disk, and saving preserves history. Closing the final document view or exiting discards history after the unsaved-change prompt. Old history can be evicted at the configured limit with a visible status notice; a transition too large to retain its immediate prior state is rejected until the budget is increased.

Saves recheck the disk fingerprint before replacement and verify afterward. Detected contention stops saving. An uncooperative external writer can still race the final filesystem replacement; the app cannot recover versions it never observed. Keep normal backups for important files.
