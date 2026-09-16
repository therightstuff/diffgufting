import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectStressProfile, stressProfiles } from '../scripts/comparison-stress-profiles.mjs';

test('stress profiles declare bounded defaults and explicit platform/opt-in gates', () => {
  assert.equal(stressProfiles.large.leaves, 10_000);
  assert.equal(stressProfiles.extreme.leaves, 100_000);
  assert.match(selectStressProfile('extreme').skipped, /optIn/);
  assert.match(selectStressProfile('desktop').skipped, /Electron/);
  assert.equal(selectStressProfile('extreme', { optIn: true }).mutationBurst, 1_000);
});
