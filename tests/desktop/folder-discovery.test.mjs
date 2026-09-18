import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mapBounded } from '../../src/host/files.mjs';

test('10,000-file discovery keeps the host and renderer responsive and sends each inventory entry once', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgufting-discovery-'));
  const folder = path.join(dir, 'files'); await mkdir(folder);
  let app;
  t.after(async () => { try { if (app) await app.evaluate(({ app }) => app.exit(0)); } finally { await rm(dir, { recursive: true, force: true }); } });
  await mapBounded(Array.from({ length: 10000 }, (_, index) => index), 32, index => writeFile(path.join(folder, `file-${String(index).padStart(5, '0')}.txt`), String(index)));
  app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUFTING_SETTINGS_DIR: dir } });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.getByRole('radio', { name: 'Folder', exact: true }).check();
  await app.evaluate(() => {
    globalThis.discoveryHeartbeat = { last: performance.now(), maxGap: 0 };
    globalThis.discoveryTimer = setInterval(() => { const state = globalThis.discoveryHeartbeat; const now = performance.now(); state.maxGap = Math.max(state.maxGap, now - state.last); state.last = now; }, 10);
  });
  await page.evaluate(() => {
    const stats = window.discoveryStats = { active: true, last: performance.now(), maxGap: 0, frames: 0, transferred: 0, maxBatch: 0 };
    const frame = now => { stats.maxGap = Math.max(stats.maxGap, now - stats.last); stats.last = now; stats.frames++; if (stats.active) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    window.stopDiscoveryEvents = window.diffgufting.onEvent(event => {
      if (event.type === 'source-inventory') { stats.transferred += event.inventory.entries.length; stats.maxBatch = Math.max(stats.maxBatch, event.inventory.entries.length); }
    });
  });
  await page.locator('#left-source').fill(folder); await page.locator('#left-source').press('Enter');
  await page.waitForFunction(() => document.querySelector('#inventory-progress').textContent.includes('10000 compared'));
  await page.locator('[data-side="left"] .cm-content').waitFor();
  const renderer = await page.evaluate(async () => { await new Promise(requestAnimationFrame); window.discoveryStats.active = false; window.stopDiscoveryEvents(); return window.discoveryStats; });
  const host = await app.evaluate(() => { clearInterval(globalThis.discoveryTimer); return globalThis.discoveryHeartbeat; });
  t.diagnostic(JSON.stringify({ renderer, hostMaxGapMs: host.maxGap }));
  assert.equal(renderer.transferred, 10000, 'Inventory IPC must be linear, not cumulative snapshots per batch');
  assert.ok(renderer.maxBatch <= 100, `Largest inventory batch: ${renderer.maxBatch}`);
  assert.ok(renderer.frames > 1); assert.ok(renderer.maxGap < 500, `Renderer stalled for ${renderer.maxGap}ms`);
  assert.ok(host.maxGap < 500, `Host stalled for ${host.maxGap}ms`);
  assert.ok(await page.locator('#files button').count() <= 60);
  await page.locator('#filter').fill('file-09999');
  await page.getByRole('button', { name: /file-09999/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-side="left"] .cm-content')?.textContent === '9999');
  await page.evaluate(() => {
    const stop = window.diffgufting.onEvent(event => {
      if (event.type === 'source' && event.side === 'left' && event.source.status === 'loading') {
        stop(); document.querySelector('.new-comparison').click();
      }
    });
  });
  await page.locator('#left-source').press('Enter');
  await page.waitForFunction(() => document.querySelector('#left-source').value === '' && document.querySelectorAll('#files button').length === 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#files button').count(), 0);
  assert.equal(await page.locator('#content .cm-editor').count(), 0);
  assert.deepEqual(errors, []);
});
