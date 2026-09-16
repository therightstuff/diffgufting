function compatible(left, right) {
  return left.fixture === right.fixture && JSON.stringify(left.settings) === JSON.stringify(right.settings);
}

export function summarizeSamples(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  if (!sorted.length) return { count: 0, medianMs: null, p95Ms: null };
  const percentile = ratio => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return { count: sorted.length, medianMs: percentile(0.5), p95Ms: percentile(0.95) };
}

export function compareBenchmarkReports(baseline, candidate) {
  if (!compatible(baseline, candidate)) throw new Error('Benchmark reports are incompatible');
  return { version: 1, fixture: baseline.fixture, baseline, candidate };
}

export async function writeBenchmarkReport(directory, report) {
  const value = { version: 1, ...report, summaries: Object.fromEntries(Object.entries(report.samples ?? {}).map(([name, samples]) => [name, summarizeSamples(samples)])) };
  const destination = path.join(directory, `${randomUUID()}.benchmark.json`);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, destination);
  return destination;
}
import { rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
