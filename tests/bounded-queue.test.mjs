import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedQueue } from '../src/host/bounded-queue.mjs';

test('bounded queue limits active work and backpressures producers', async () => {
  const queue = new BoundedQueue({ concurrency: 2, capacity: 3 });
  let active = 0; let maximum = 0;
  const work = value => queue.add(async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return value; });
  assert.deepEqual(await Promise.all([work(1), work(2), work(3), work(4)]), [1, 2, 3, 4]);
  assert.equal(maximum, 2); await queue.idle();
});
