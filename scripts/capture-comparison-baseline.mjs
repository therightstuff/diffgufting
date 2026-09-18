import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateFixture } from './generate-comparison-fixtures.mjs';
import { Session } from '../src/host/session.mjs';

export async function captureBaseline({ scale = 30 } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'diffgufting-baseline-'));
  const fixture = await generateFixture({ root, scale });
  const session = new Session({ left: { kind: 'file', path: fixture.left }, right: { kind: 'file', path: fixture.right } });
  let ticks = 0; const heartbeat = setInterval(() => ticks++, 5);
  const before = process.memoryUsage(); const started = performance.now();
  try {
    const result = await session.refresh();
    const ended = performance.now();
    return {
      version: 1, fixture: { version: 1, seed: 1, scale, manifestPath: fixture.manifestPath },
      environment: { node: process.version, platform: process.platform, architecture: process.arch },
      phases: { initialComparisonMs: ended - started },
      work: { rows: result.rows.length, hostHeartbeatTicks: ticks },
      memory: { host: { beforeRss: before.rss, afterRss: process.memoryUsage().rss }, worker: 'unavailable', renderer: 'unavailable' },
      io: 'unavailable', crashes: [], timeouts: [],
    };
  } finally { clearInterval(heartbeat); session.close(); await rm(root, { recursive: true, force: true }); }
}

export const baselineBudgets = Object.freeze({ scale: 30, initialComparisonMs: 250, minimumHeartbeatTicks: 1, hostRssDeltaBytes: 128 * 1024 * 1024 });

export function assertBaselineBudgets(report, budgets = baselineBudgets) {
  if (report.fixture.scale !== budgets.scale) throw new Error('Baseline fixture scale is incompatible with acceptance budgets');
  if (report.phases.initialComparisonMs > budgets.initialComparisonMs) throw new Error('Initial comparison exceeded the recorded acceptance budget');
  if (report.work.hostHeartbeatTicks < budgets.minimumHeartbeatTicks) throw new Error('Host responsiveness budget was not met');
  if (report.memory.host.afterRss - report.memory.host.beforeRss > budgets.hostRssDeltaBytes) throw new Error('Host memory budget was exceeded');
}

if (import.meta.main) process.stdout.write(`${JSON.stringify(await captureBaseline(), null, 2)}\n`);
