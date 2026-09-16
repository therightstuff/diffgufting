import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmark } from '../scripts/run-comparison-benchmark.mjs';

test('benchmark runner alternates candidates and excludes fixture setup', async () => {
  const calls = [];
  const result = await runBenchmark({
    candidates: { left: async () => calls.push('left'), right: async () => calls.push('right') },
    repetitions: 2,
    warmups: 1,
    setup: async () => calls.push('setup'),
  });

  assert.deepEqual(calls, ['setup', 'left', 'right', 'right', 'left', 'left', 'right']);
  assert.equal(result.samples.left.length, 2);
  assert.equal(result.samples.right.length, 2);
});

test('benchmark runner supplies the selected fixture and cache mode to candidates', async () => {
  let received;
  await runBenchmark({
    candidates: { candidate: async context => { received = context; } },
    repetitions: 1,
    fixture: 'wide',
    cacheMode: 'reused',
  });
  assert.deepEqual(received, { fixture: 'wide', cacheMode: 'reused' });
});
