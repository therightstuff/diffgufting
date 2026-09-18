import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareBenchmarkReports, writeBenchmarkReport, summarizeSamples } from '../scripts/comparison-benchmark-report.mjs';

test('benchmark report comparison rejects incompatible fixtures', () => {
  assert.throws(() => compareBenchmarkReports({ fixture: 'a', settings: {} }, { fixture: 'b', settings: {} }), /incompatible/i);
});

test('benchmark summaries retain raw-sample median and tail interpretation', () => {
  assert.deepEqual(summarizeSamples([10, 1, 3, 2, 100]), { count: 5, medianMs: 3, p95Ms: 100 });
  assert.deepEqual(summarizeSamples([]), { count: 0, medianMs: null, p95Ms: null });
});

test('benchmark report comparison preserves raw samples', () => {
  const result = compareBenchmarkReports({ fixture: 'a', settings: {}, samples: [1, 2] }, { fixture: 'a', settings: {}, samples: [2, 3] });
  assert.deepEqual(result.baseline.samples, [1, 2]);
  assert.deepEqual(result.candidate.samples, [2, 3]);
});

test('benchmark reports are written as versioned JSON', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'diffgufting-benchmark-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reportPath = await writeBenchmarkReport(directory, { fixture: 'a', settings: {}, samples: [], correctness: true, unavailable: [] });
  assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).version, 1);
});
