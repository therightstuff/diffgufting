import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBaselineBudgets, baselineBudgets, captureBaseline } from '../scripts/capture-comparison-baseline.mjs';

test('baseline capture records phase, responsiveness, memory, and unavailable metrics explicitly', async () => {
  const report = await captureBaseline({ scale: 2 });
  assert.ok(report.phases.initialComparisonMs >= 0);
  assert.ok(report.work.hostHeartbeatTicks >= 0);
  assert.equal(report.memory.worker, 'unavailable');
  assert.equal(report.io, 'unavailable');
});

test('baseline budgets are fixture-specific and reject a regression', () => {
  const report = { fixture: { scale: 30 }, phases: { initialComparisonMs: 100 }, work: { hostHeartbeatTicks: 2 }, memory: { host: { beforeRss: 1, afterRss: 2 } } };
  assert.doesNotThrow(() => assertBaselineBudgets(report));
  assert.throws(() => assertBaselineBudgets({ ...report, phases: { initialComparisonMs: baselineBudgets.initialComparisonMs + 1 } }));
});
