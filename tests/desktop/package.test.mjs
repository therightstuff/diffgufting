import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
test('packaged macOS launcher uses bundled runtime and replacement icon', { skip: process.platform !== 'darwin' || process.arch !== 'arm64' }, async t => {
  const bundle = path.resolve('release/Diffgufting-darwin-arm64');
  const { stdout } = await run(path.join(bundle, 'diffgufting'), ['--help']);
  assert.match(stdout, /Usage: diffgufting/);
  assert.deepEqual(await readFile(path.join(bundle, 'Diffgufting.app/Contents/Resources/electron.icns')), await readFile('assets/branding/icons/diffgufting.icns'));
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgufting-package-'));
  const app = await electron.launch({ timeout: 30000, executablePath: path.join(bundle, 'Diffgufting.app/Contents/MacOS/diffgufting-app'), args: [], env: { ...process.env, DIFFGUFTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Every change has a story.' }).waitFor();
  assert.equal(await page.locator('header img').evaluate(image => image.naturalWidth > 0), true);
  await app.evaluate(({ Menu }) => {
    const find = menu => {
      for (const item of menu?.items ?? []) {
        if (item.label === 'About diffgufting') return item;
        const child = find(item.submenu);
        if (child) return child;
      }
    };
    find(Menu.getApplicationMenu()).click();
  });
  await page.locator('#about-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#about-dialog').innerText(), /0\.1\.0/);
  assert.equal(await page.locator('#about-logo').evaluate(image => image.naturalWidth > 0), true);
});
