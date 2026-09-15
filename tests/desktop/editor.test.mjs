import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

test('editor groups typing, isolates Enter, and restores the caret through undo', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-batched-undo-'));
  const left = path.join(dir, 'left.txt'); const right = path.join(dir, 'right.txt');
  await writeFile(left, 'left'); await writeFile(right, '');
  const app = await electron.launch({ timeout: 30000, args: ['.', left, right], env: { ...process.env, DIFFGUSTING_TEST: '1', DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); const editor = page.locator('[data-side="right"] .cm-content');
  await editor.waitFor(); const empty = await editor.innerText(); await editor.click(); await page.keyboard.type('ab');
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content').textContent === 'ab');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('[data-side="right"] .cm-line').length === 2);
  const afterEnter = await editor.innerText(); await page.keyboard.type('c');
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content').lastElementChild.textContent === 'c');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await editor.innerText(), afterEnter);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await editor.innerText(), 'ab');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await editor.innerText(), empty);
});

test('desktop edits, reviews disjoint external changes, and preserves undo across layouts', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-desktop-'));
  const left = path.join(dir, 'left.txt'); const right = path.join(dir, 'right.txt');
  await writeFile(left, 'left\nsecond\n'); await writeFile(right, 'right\nsecond\n');
  const app = await electron.launch({ timeout: 30000, args: ['.', left, right], env: { ...process.env, DIFFGUSTING_TEST: '1', DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  await page.locator('[data-side="right"] .cm-content').waitFor();
  const editor = page.locator('[data-side="right"] .cm-content');
  await editor.click(); await page.keyboard.press('ControlOrMeta+Home'); await page.keyboard.type('LOCAL ');
  await writeFile(right, 'right\nEXTERNAL\n');
  await page.getByRole('button', { name: 'Review external change' }).first().waitFor();
  assert.match(await editor.innerText(), /LOCAL/);
  await page.getByRole('button', { name: 'Review external change' }).first().click();
  await writeFile(right, 'right\nLATEST\n');
  await page.waitForFunction(() => document.querySelector('#review-version').options.length === 2);
  await page.getByRole('button', { name: 'Accept disk' }).click();
  await page.waitForFunction(() => document.querySelector('#review-message').textContent.includes('newer'));
  await page.locator('#review-version').selectOption('1');
  await page.getByRole('button', { name: 'Accept disk' }).click();
  await page.locator('#layout').selectOption('unified');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.match(await page.locator('.cm-content').last().innerText(), /LOCAL/);
  assert.equal(await readFile(right, 'utf8'), 'right\nLATEST\n');
  await page.locator('#theme').selectOption('light');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.locator('#history-budget').fill('128');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.locator('#preferences-dialog').waitFor({ state: 'hidden' });
  assert.equal(JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8')).historyBytes, 128 * 1024 * 1024);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/editor-light.png' });
});

test('three-way output supports merge choices, save, undo, and close cancellation', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-merge-'));
  const files = Object.fromEntries(['left', 'right', 'base', 'result'].map(name => [name, path.join(dir, `${name}.txt`)]));
  for (const [name, text] of [['left', 'left\n'], ['right', 'right\n'], ['base', 'base\n']]) await writeFile(files[name], text);
  const app = await electron.launch({ timeout: 30000, args: ['.', files.left, files.right, '--base', files.base, '--output', files.result], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  await page.locator('[data-side="result"] .cm-content').waitFor();
  await page.getByRole('button', { name: 'Use this version' }).first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Saved'));
  assert.equal(await readFile(files.result, 'utf8'), 'left\n');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.match(await page.locator('[data-side="result"] .cm-content').innerText(), /base/);
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Unsaved'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.locator('#close-dialog').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('#close-dialog').waitFor({ state: 'hidden' });
  assert.equal(await readFile(files.result, 'utf8'), 'left\n');
  await page.locator('#theme').selectOption('dark');
  await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/merge-dark.png' });
});

test('Git categories coexist in the gutter and canceled changes remain inspectable', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-git-ui-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const file = path.join(dir, 'file.txt');
  await writeFile(file, 'base\n'); git('add', '.'); git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  await writeFile(file, 'committed\n'); git('add', '.'); git('commit', '--quiet', '-m', 'next');
  await writeFile(file, 'staged\n'); git('add', '.'); await writeFile(file, 'committed\n');
  const app = await electron.launch({ timeout: 30000, args: ['.', '--left-repo', dir, '--left-ref', 'HEAD', '--right-repo', dir, '--right-ref', '@worktree', '--git-base', base], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  for (const category of ['committed', 'staged', 'unstaged']) await page.locator(`.category-markers .${category}`).first().waitFor();
  await page.locator('#change-list').getByRole('button', { name: 'right · staged', exact: true }).click();
  assert.match(await page.locator('#review-editors .cm-content').last().innerText(), /staged/);
  await page.getByRole('button', { name: 'Keep reviewing later' }).click();
  await page.locator('#layout').selectOption('unified');
  for (const category of ['committed', 'staged', 'unstaged']) await page.locator(`.category-markers .${category}`).first().waitFor();
  await page.locator('#theme').selectOption('dark');
  await page.screenshot({ path: 'test-results/git-layers-dark.png' });
});

test('commit picker closes without selection and replaces the invoking source with a snapshot', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-history-picker-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const left = path.join(dir, 'left.txt'); const right = path.join(dir, 'right.txt');
  await writeFile(left, 'first\n'); await writeFile(right, 'right\n'); git('add', '.'); git('commit', '--quiet', '-m', 'first');
  await writeFile(left, 'second\n'); git('add', 'left.txt'); git('commit', '--quiet', '-m', 'second');
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  await page.locator('#left-source').fill(left); await page.locator('#left-source').press('Enter');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.locator('#history-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#history-list').textContent.includes('HEAD'));
  await page.getByRole('button', { name: 'Keep filesystem source' }).click();
  await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  await page.locator('#left-source').fill(left); await page.locator('#left-source').press('Enter');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.locator('#history-dialog').waitFor({ state: 'visible' });
  await page.locator('#history-list button').first().click();
  await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  await page.locator('#right-source').fill(right); await page.locator('#right-source').press('Enter');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.locator('#history-dialog').waitFor({ state: 'visible' });
  await page.locator('#history-list button').nth(1).click();
  await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  await page.locator('[data-side="left"] .cm-content').waitFor();
  assert.match(await page.locator('[data-side="left"] .cm-content').innerText(), /second/);
  assert.match(await page.locator('[data-side="right"] .cm-content').innerText(), /right/);
  await page.locator('#right-source').fill(left); await page.locator('#right-source').press('Enter');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.locator('#history-dialog').waitFor({ state: 'visible' });
  await page.locator('#history-list button').first().click();
  await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content')?.textContent.includes('second'));
  assert.equal(await page.locator('#notice').innerText(), '');
  await page.locator('#right-progress').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-side="right"] .cm-content').getAttribute('contenteditable'), 'false');
});

test('renderer runs with an in-browser host adapter and no Electron preload', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-browser-'));
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  await app.firstWindow();
  const windowEvent = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }) => { const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } }); window.loadURL('about:blank'); });
  const page = await windowEvent;
  await page.addInitScript(() => {
    const entry = (text, absolute) => ({ path: '', text, absolute, writable: true, fingerprint: text });
    const left = entry('before\n', '/before'); const right = entry('after\n', '/after');
    window.diffgusting = {
      bootstrap: async () => ({ ok: true, value: { preferences: { historyBytes: 104857600, theme: 'dark', layout: 'side-by-side' }, appearance: 'dark', comparison: { left: { source: { kind: 'file' }, entries: [left] }, right: { source: { kind: 'file' }, entries: [right] }, rows: [{ path: '', left, right, status: 'changed' }], layers: [] } } }),
      preferences: async value => ({ ok: true, value: { preferences: { historyBytes: 104857600, theme: 'dark', layout: 'side-by-side', ...value }, appearance: value.theme === 'light' ? 'light' : 'dark' } }),
      dirty: () => {}, onEvent: () => () => {},
    };
  });
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.locator('[data-side="right"] .cm-content').waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.locator('[data-side="right"] .cm-content').click(); await page.keyboard.type('EDIT ');
  await page.locator('#layout').selectOption('unified');
  assert.match(await page.locator('.cm-content').last().innerText(), /EDIT/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
});

test('layout switches retain the logical scroll position and selection', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-layout-'));
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  const text = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
  await writeFile(left, text); await writeFile(right, text);
  const app = await electron.launch({ timeout: 30000, args: ['.', left, right], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  const editor = page.locator('[data-side="right"] .cm-content'); await editor.waitFor(); await editor.focus();
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-scroller').scrollTop > 1000);
  const selection = await page.evaluate(() => getSelection().toString());
  const before = await page.locator('[data-side="right"] .cm-scroller').evaluate(node => node.scrollTop);
  assert.ok(before > 1000, JSON.stringify(await editor.evaluate(node => { const values = []; for (let parent = node; parent; parent = parent.parentElement) values.push([parent.className, parent.scrollTop, parent.scrollHeight, parent.clientHeight]); return values; })));
  await page.locator('#layout').selectOption('unified'); await page.locator('#layout').selectOption('side-by-side');
  const after = await page.locator('[data-side="right"] .cm-scroller').evaluate(node => node.scrollTop);
  assert.ok(after > before / 2, `scroll lost: ${before} -> ${after}`);
  await page.locator('[data-side="right"] .cm-content').focus();
  assert.equal(await page.evaluate(() => getSelection().toString()), selection);
});
