#!/usr/bin/env node

export async function runBenchmark({ candidates, repetitions = 3, warmups = 1, setup = async () => {}, fixture = 'default', cacheMode = 'fresh', timeoutMs = 30000 }) {
  if (!candidates || typeof candidates !== 'object' || !Object.values(candidates).every(candidate => typeof candidate === 'function')) throw new Error('Benchmark candidates must be functions');
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || !Number.isSafeInteger(warmups) || warmups < 0) throw new Error('Repetitions and warmups must be non-negative integers');
  const names = Object.keys(candidates);
  const runCandidate = async name => {
    let timeout;
    try {
      return await Promise.race([
        candidates[name]({ fixture, cacheMode }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Benchmark candidate ${name} timed out`)), timeoutMs); }),
      ]);
    } finally { clearTimeout(timeout); }
  };
  await setup();
  const samples = Object.fromEntries(names.map(name => [name, []]));
  for (let iteration = 0; iteration < warmups + repetitions; iteration++) {
    const order = iteration % 2 ? [...names].reverse() : names;
    for (const name of order) {
      const startedAt = performance.now();
      await runCandidate(name);
      if (iteration >= warmups) samples[name].push(performance.now() - startedAt);
    }
  }
  return { version: 1, samples };
}
