# Commit picker revision failures

## Attempt 1 — Load a revision returned by history

**Hypothesis:** History parsing corrupts hashes after the first record; earlier tests bypassed it with directly resolved hashes.

**Action:** Extended the history paging test to load the second returned commit.

**Result:** Reproduced `Git rev-parse failed: fatal: Needed a single revision`. Git's separator newline was retained in the next hash. The final newline also produced a spurious history row.

**Next step:** Strip record framing before parsing, validate hashes, preserve message text, and verify the final page.

## Attempt 2 — Exercise both picker dialogs

**Hypothesis:** The renderer also retains the lone-source pane after automatic comparison and duplicates path commits on Enter followed by blur.

**Action:** Ran the desktop picker test selecting different commits on both sides.

**Result:** After parsing was fixed, the left pane incorrectly showed the older revision. Preventing the duplicate blur load and rebuilding panes when source descriptors change made the complete test pass.

**Next step:** Verify selecting the same revision for both sides clears progress and displays read-only matching contents.

## Verification

The desktop regression passes for dismissal, different revisions, and the same revision on both sides. It checks displayed snapshot contents, cleared notices, hidden terminal progress, and read-only editing. The renderer was rebuilt before that run.
