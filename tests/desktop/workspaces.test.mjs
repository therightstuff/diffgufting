import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function fixture(t, contents, extra = []) {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-workspace-ui-'));
  const files = {};
  for (const [name, text] of Object.entries(contents)) { files[name] = path.join(dir, name + '.txt'); await writeFile(files[name], text); }
  const app = await electron.launch({ timeout: 30000, args: ['.', files.left, files.right, ...extra.map(value => files[value] ?? value)], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.locator('[data-side="right"] .cm-content').waitFor();
  return { dir, files, app, page };
}

test('comparison list retains edits, deduplicates pairs, and File Recent persists descriptors', async t => {
  const { page, app, files, dir } = await fixture(t, { left: 'left', right: 'right', other: 'other' });
  const entries = page.locator('.comparison-item');
  assert.equal(await entries.count(), 1);
  const right = page.locator('[data-side="right"] .cm-content'); await right.focus(); await page.keyboard.type('EDIT ');
  await page.evaluate(file => window.diffgusting.sourceLoad('right', { kind: 'file', path: file }), files.other);
  await page.waitForFunction(() => document.querySelectorAll('.comparison-item').length === 2);
  await entries.first().locator('button').first().click();
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content')?.textContent.includes('EDIT'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await right.innerText(), 'right');
  const opened = await page.evaluate(request => window.diffgusting.open(request), { left: { kind: 'file', path: files.left }, right: { kind: 'file', path: files.right } });
  assert.equal(opened.ok, true); assert.equal(await entries.count(), 2);
  const recent = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'Recent').submenu.items.map(item => item.label));
  assert.equal(recent.length, 2); assert.match(recent[0], /right.txt/);
  const saved = JSON.parse(await readFile(path.join(dir, 'recent-comparisons.json'), 'utf8'));
  assert.equal(saved.comparisons.length, 2); assert.equal(saved.version, 1);
  assert.equal(saved.comparisons[0].request.right.path, files.right);
  await right.focus(); await page.keyboard.type('UNSAVED');
  await entries.first().getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('#close-dialog').waitFor({ state: 'visible' }); await page.locator('#close-cancel').click();
  assert.equal(await entries.count(), 2); assert.match(await right.innerText(), /UNSAVED/);
});

test('overview and cursor navigation synchronize all merge panes and both scroll axes', async t => {
  const lines = Array.from({ length: 250 }, (_, i) => `line ${i} ` + 'long '.repeat(80));
  const text = lines.join('\n');
  const { page } = await fixture(t, { left: text, right: text.replace('line 150', 'changed 150'), base: text, result: text }, ['--base', 'base', '--output', 'result']);
  await page.locator('[data-side="result"] .cm-content').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.overview-change').length > 0);
  const overview = page.locator('#overview'); const box = await overview.boundingBox();
  await overview.click({ position: { x: box.width / 2, y: box.height * 0.65 } });
  await page.waitForFunction(() => [...document.querySelectorAll('#content .cm-content')].every(node => node.cmTile.root.view.state.selection.main.head > 1000));
  const positions = await page.locator('#content .cm-content').evaluateAll(nodes => nodes.map(node => node.cmTile.root.view.state.doc.lineAt(node.cmTile.root.view.state.selection.main.head).number));
  assert.equal(new Set(positions).size, 1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const centers = await page.locator('#content .cm-content').evaluateAll(nodes => nodes.map(node => { const view = node.cmTile.root.view; const caret = view.coordsAtPos(view.state.selection.main.head); const rect = view.scrollDOM.getBoundingClientRect(); return Math.abs((caret.top + caret.bottom) / 2 - (rect.top + rect.bottom) / 2); }));
  assert.ok(centers.every(distance => distance < 30), `Uncentered panes: ${centers}`);
  const result = page.locator('[data-side="result"] .cm-content'); await result.focus();
  await page.keyboard.press('ArrowDown');
  const cursors = await page.locator('#content .cm-content').evaluateAll(nodes => nodes.map(node => node.cmTile.root.view.state.doc.lineAt(node.cmTile.root.view.state.selection.main.head).number));
  assert.equal(new Set(cursors).size, 1);
  await page.locator('[data-side="result"] .cm-scroller').evaluate(node => { node.scrollLeft = 120; node.scrollTop = 1800; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => [...document.querySelectorAll('#content .cm-scroller')].every(node => node.scrollLeft >= 119 && node.scrollTop > 1000));
  assert.equal(await result.evaluate(node => node.contains(document.activeElement)), true);
  await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/workspace-merge-navigation.png' });
});

test('changed text uses backgrounds and identical documents have an empty overview', async t => {
  const { page } = await fixture(t, { left: 'before line\nsame', right: 'after line\nsame' });
  for (const theme of ['dark', 'light']) {
    await page.locator('#theme').selectOption(theme);
    for (const layout of ['side-by-side', 'unified']) {
      await page.locator('#layout').selectOption(layout);
      const changed = page.locator('.cm-changedText, .cm-deletedText').first(); await changed.waitFor();
      const style = await changed.evaluate(node => ({ image: getComputedStyle(node).backgroundImage, decoration: getComputedStyle(node).textDecorationLine, color: getComputedStyle(node).backgroundColor }));
      assert.equal(style.image, 'none'); assert.equal(style.decoration, 'none'); assert.notEqual(style.color, 'rgba(0, 0, 0, 0)');
    }
  }
  await page.locator('#layout').selectOption('side-by-side');
  await page.locator('#copy-right').click();
  await page.waitForFunction(() => document.querySelector('#overview').children.length === 0);
});

test('Git No keeps working contents, aliases only change labels, and saving retains base-dirty circle', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-git-identity-ui-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const file = path.join(dir, 'file.txt'); await writeFile(file, 'base'); git('add', '.'); git('commit', '--quiet', '-m', 'base'); git('tag', '-a', 'release', '-m', 'release'); git('branch', 'alias');
  const base = git('rev-parse', 'HEAD'); await writeFile(file, 'working');
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.locator('#right-source').fill(file); await page.locator('#right-source').press('Enter');
  await page.locator('#git-choice-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#git-choice-message').innerText(), /current working version from disk/);
  await page.getByRole('button', { name: 'No', exact: true }).click();
  const editor = page.locator('[data-side="right"] .cm-content'); assert.equal(await editor.innerText(), 'working');
  const alias = page.getByLabel('right revision display name'); await alias.selectOption('release');
  assert.match(await alias.getAttribute('title'), new RegExp(base));
  assert.equal(await page.locator('.base-dirty').innerText(), '●');
  await editor.focus(); await page.keyboard.type('edit '); await page.locator('#save').click();
  await page.waitForFunction(() => !document.querySelector('.state-label')?.textContent.includes('UNSAVED'));
  assert.equal(await page.locator('.base-dirty').innerText(), '●'); assert.equal(await alias.inputValue(), 'release');
  await editor.focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('base');
  await page.waitForFunction(() => document.querySelector('.base-dirty')?.textContent === '');
  git('add', 'file.txt'); git('commit', '--quiet', '-m', 'saved edit'); git('tag', '-f', 'release');
  await page.evaluate(() => window.diffgusting.refresh());
  await page.waitForFunction(() => ![...document.querySelectorAll('.revision-name option')].some(option => option.value === 'release'));
  assert.match(await page.locator('.revision-name').getAttribute('title'), new RegExp(base));
});

test('File Recent survives restart, reports unavailable paths, and protects an edited lone source', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-recent-restart-'));
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await writeFile(left, 'left'); await writeFile(right, 'right');
  let app;
  t.after(async () => { if (app) await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const launch = args => electron.launch({ timeout: 30000, args: ['.', ...args], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  app = await launch([left, right]);
  let page = await app.firstWindow(); await page.locator('.comparison-item').waitFor();
  await app.evaluate(({ app }) => app.exit(0)); app = null;
  app = await launch([]); page = await app.firstWindow();
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const clickRecent = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'Recent').submenu.items[0].click());
  await clickRecent(); await page.locator('.comparison-item').waitFor();
  assert.equal(await page.locator('[data-side="right"] .cm-content').innerText(), 'right');
  await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await rm(right); await clickRecent();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('ENOENT'));
  assert.equal(await page.locator('.comparison-item').count(), 0);
  await writeFile(right, 'right');
  const draft = path.join(dir, 'draft'); await writeFile(draft, 'draft');
  await page.locator('#left-source').fill(draft); await page.locator('#left-source').press('Enter');
  const editor = page.locator('[data-side="left"] .cm-content'); await editor.focus(); await page.keyboard.type('UNSAVED ');
  await clickRecent(); await page.locator('#close-dialog').waitFor({ state: 'visible' }); await page.locator('#close-cancel').click();
  assert.match(await editor.innerText(), /UNSAVED/);
  assert.equal(await page.locator('.comparison-item').count(), 0);
  await clickRecent(); await page.locator('#close-dialog').waitFor({ state: 'visible' }); await page.locator('#close-discard').click();
  await page.locator('.comparison-item').waitFor();
  assert.equal(await page.locator('[data-side="right"] .cm-content').innerText(), 'right');
  assert.equal(await readFile(draft, 'utf8'), 'draft');
  await page.evaluate(file => window.diffgusting.sourceLoad('right', { kind: 'file', path: file }), draft);
  await page.waitForFunction(() => document.querySelectorAll('.comparison-item').length === 2);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForEvent('close');
  app = null;
});

test('browsing and editing child files retains one folder comparison', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-folder-workspace-'));
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await mkdir(left); await mkdir(right);
  for (const folder of [left, right]) for (const name of ['one', 'two']) await writeFile(path.join(folder, name), name);
  const app = await electron.launch({ timeout: 30000, args: ['.', left, right], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  for (const name of ['one', 'two', 'one']) {
    await page.locator('#files button').filter({ hasText: name }).click();
    await page.locator('[data-side="right"] .cm-content').focus(); await page.keyboard.type('edit');
    assert.equal(await page.locator('.comparison-item').count(), 1);
    assert.match(await page.locator('[data-side="right"] .pane-title .name').innerText(), new RegExp(name));
  }
});
