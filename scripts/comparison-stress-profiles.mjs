export const stressProfiles = Object.freeze({
  default: { leaves: 500, mixedSizes: true, mutationBurst: 10, nearLimitBytes: 1024 * 1024, platform: 'all' },
  large: { leaves: 10_000, mixedSizes: true, mutationBurst: 100, nearLimitBytes: 32 * 1024 * 1024, platform: 'all' },
  extreme: { leaves: 100_000, mixedSizes: true, mutationBurst: 1_000, nearLimitBytes: 32 * 1024 * 1024, platform: 'opt-in' },
  desktop: { leaves: 500, mixedSizes: true, mutationBurst: 10, nearLimitBytes: 1024 * 1024, platform: 'electron' },
});

export function selectStressProfile(name = 'default', { electron = false, optIn = false } = {}) {
  const profile = stressProfiles[name];
  if (!profile) throw new Error(`Unknown stress profile: ${name}`);
  if (profile.platform === 'electron' && !electron) return { skipped: 'Electron desktop runtime is required' };
  if (profile.platform === 'opt-in' && !optIn) return { skipped: 'Set optIn to run the 100,000-leaf profile' };
  return { ...profile };
}
