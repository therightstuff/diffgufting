import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptsInventoryEvent, createInventoryEvent, pairInventories } from '../src/host/inventory-events.mjs';

test('inventory events reject stale comparison generations', () => {
  assert.equal(acceptsInventoryEvent({ comparisonId: 'a', generation: 2 }, { comparisonId: 'a', generation: 2 }), true);
  assert.equal(acceptsInventoryEvent({ comparisonId: 'a', generation: 2 }, { comparisonId: 'a', generation: 1 }), false);
});

test('inventory events carry a versioned comparison generation', () => {
  assert.deepEqual(createInventoryEvent('batch', 'comparison', 3, { entries: [] }), { version: 1, type: 'batch', comparisonId: 'comparison', generation: 3, entries: [] });
});

test('paired inventories count each discovered file once and retain conflicts', () => {
  const paired = pairInventories(
    [{ path: 'same', kind: 'file' }, { path: 'left-only', kind: 'file' }, { path: 'conflict', kind: 'file' }],
    [{ path: 'same', kind: 'file' }, { path: 'right-only', kind: 'file' }, { path: 'conflict', kind: 'directory' }],
  );
  assert.equal(paired.workCount, 4);
  assert.equal(paired.rows.find(row => row.path === 'conflict').state, 'conflict');
});

test('paired inventories do not count directories or unavailable discovery as resolved work', () => {
  const paired = pairInventories([{ path: 'empty', kind: 'directory' }, { path: 'lost', kind: 'unavailable' }], []);
  assert.equal(paired.workCount, 1);
  assert.equal(paired.rows[0].state, 'unavailable');
});
