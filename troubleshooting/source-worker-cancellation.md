# Source worker cancellation investigation

## Attempt 1 — Reproduce the stalled cancellation test

**Hypothesis:** The new source-worker lifecycle leaves the existing overlapping `refresh()` scenario unresolved.

**Action:** Ran `node --test --test-name-pattern "new comparison" tests/session.test.mjs` after introducing source-scoped loading.

**Result:** The runner produced no completed test result within 30 seconds. The full session suite completed its first test and then similarly stalled.

**Next step:** Trace the overlapping loads and comparison handoff with a minimal runtime probe, then isolate the unresolved promise.

## Attempt 2 — Trace overlapping source loads

**Hypothesis:** Terminating an obsolete worker does not itself settle the promise awaiting that worker's result.

**Action:** Ran a standalone probe that calls `refresh()` twice on one session and logs source events.

**Result:** The second refresh completed after both new sources loaded, but the first refresh never settled. Replacing a source called `terminate()` before the old worker's listeners could observe an exit, leaving its load promise pending.

**Next step:** Give each source load an explicit cancellation rejection, invoke it before terminating a superseded worker, and rerun the focused regression.

## Attempt 3 — Reproduce the session-close branch

**Hypothesis:** The remaining stall occurs when `Session.close()` terminates in-flight source workers without invoking their explicit cancellation callback.

**Action:** Compared the test's final `refresh(); close(); await rejection` sequence with the standalone overlapping-refresh probe.

**Result:** The probe's replacement path settled after explicit cancellation; `close()` only terminated workers, so the promise for that final refresh could remain pending.

**Next step:** Invoke each source cancellation callback before terminating its worker during session close, then run the exact focused test.
