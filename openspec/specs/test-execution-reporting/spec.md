# Test execution reporting

## Purpose

Define concise, durable reporting for project test executions.

## Requirements

### Requirement: Quiet wrappers for all tests

Every project test entrypoint SHALL use a shared wrapper/reporting layer by default, including unit/model, integration, desktop, CLI, packaged-app, performance, load, and focused selections. The wrapper SHALL preserve native selection, required setup, concurrency constraints, and failure exit semantics. It SHALL stream detailed stdout/stderr to per-run artifacts and emit only byte-bounded start/status/final summaries by default. Verbose output and scoped failure diagnostics SHALL be explicitly selectable. Reducing console output SHALL NOT discard failure evidence or suppress failure status.

#### Scenario: A noisy successful suite runs

- **WHEN** a suite emits a large volume of diagnostic output
- **THEN** the default console stays within configured summary budgets, full diagnostics are retained as artifacts without buffering the whole log, and the summary reports selection, counts, result, duration, and artifact paths

#### Scenario: Many tests fail

- **WHEN** failure details exceed the console budget
- **THEN** the summary reports the total failure count and bounded failure excerpts, links to omitted diagnostics, and preserves the nonzero result

#### Scenario: Focused desktop or packaging tests run

- **WHEN** a user selects a focused desktop, CLI, or packaged-app suite
- **THEN** it uses the same reporting contract while preserving its prerequisites, filters, owned-process cleanup, and graphical serialization constraints

### Requirement: Durable timing reports

Every terminal test run SHALL write a versioned structured report with run identity, selection/configuration, start/end timestamps, measured total wall duration, per-suite outcomes/counts and durations, exit code/signal, diagnostic paths, and a recommended polling interval with its basis. Failed, timed-out, canceled, and interrupted runs SHALL retain observed elapsed time and identify incomplete work. Unavailable timings SHALL be explicit. Reports and bounded timing history SHALL remain available after the runner exits; history SHALL distinguish compatible suite selections, environments, runtimes, and concurrency settings.

#### Scenario: A later agent plans another run

- **WHEN** a completed compatible report exists
- **THEN** the agent can retrieve compact suite timings and polling guidance without rereading the raw log or rerunning tests

#### Scenario: A run fails to complete

- **WHEN** a child fails, times out, is canceled, or exits without a valid required result
- **THEN** the wrapper reports the observed elapsed duration and unsuccessful or incomplete outcome rather than declaring success from missing output
- **AND** incomplete durations are not treated as completed-suite estimates

### Requirement: Compact timing-informed monitoring

The wrapper SHALL expose atomic compact status by run identity, including state, elapsed duration, current suite, completed counts, and recommended polling interval. Status queries SHALL NOT replay raw logs. Completion notifications SHALL be used when available; otherwise the recommendation SHALL be 10 seconds without compatible history, or one quarter of the median comparable completed duration clamped to 10–60 seconds. Failures SHALL be surfaced promptly. Timing estimates SHALL NOT replace terminal-result verification or test timeouts.

#### Scenario: Monitor a long-running suite

- **WHEN** an agent queries the run before completion
- **THEN** it receives bounded current status and polling guidance without repeated log content
- **AND** unrelated or stale run artifacts cannot be mistaken for its completion

#### Scenario: History is absent or incompatible

- **WHEN** stored runs differ in selection, relevant configuration, runtime/platform, or concurrency, or no history exists
- **THEN** the wrapper uses the documented default polling interval and identifies the missing compatible history
