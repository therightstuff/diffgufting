import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, writeFile, readFile, rm, mkdir, realpath } from 'node:fs/promises';
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
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  t.after(() => assert.deepEqual(errors, []));
  await page.locator('[data-side="right"] .cm-content').waitFor();
  return { dir, files, app, page };
}

test('launching without sources shows New and does not register a comparison', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-new-page-'));
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  await page.locator('#open-comparison').waitFor();
  assert.equal(await page.locator('.comparison-item').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Open comparison', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  assert.equal(await page.locator('.comparison-item').count(), 0);
});

test('application menu opens an accessible About dialog from package metadata', async t => {
  const { app, page } = await fixture(t, { left: 'left', right: 'right' });
  const metadata = JSON.parse(await readFile('package.json', 'utf8'));
  const about = await app.evaluate(({ app, Menu }) => {
    const find = menu => {
      for (const item of menu?.items ?? []) {
        if (item.label === 'About diffgusting') return item;
        const child = find(item.submenu);
        if (child) return child;
      }
    };
    return { name: app.getName(), hasItem: Boolean(find(Menu.getApplicationMenu())) };
  });
  assert.equal(about.name, 'diffgusting');
  assert.ok(about.hasItem, 'Expected an About diffgusting menu item');
  await page.getByRole('button', { name: 'Preferences', exact: true }).focus();
  await app.evaluate(({ Menu }) => {
    const find = menu => {
      for (const item of menu?.items ?? []) {
        if (item.label === 'About diffgusting') return item;
        const child = find(item.submenu);
        if (child) return child;
      }
    };
    find(Menu.getApplicationMenu()).click();
  });
  const dialog = page.locator('#about-dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('heading', { name: metadata.name }).waitFor();
  assert.equal(await dialog.getByRole('img', { name: 'Diffgusting pixel-art face logo' }).evaluate(image => image.naturalWidth > 0), true);
  assert.match(await dialog.innerText(), new RegExp(metadata.version));
  assert.match(await dialog.innerText(), new RegExp(metadata.description));
  assert.equal(await dialog.getByRole('link', { name: 'Repository', exact: true }).getAttribute('href'), metadata.repository.url);
  assert.equal(await dialog.getByRole('link', { name: 'Support my projects', exact: true }).getAttribute('href'), metadata.funding.url);
  await app.evaluate(({ shell }) => { globalThis.aboutLinks = []; shell.openExternal = async url => globalThis.aboutLinks.push(url); });
  await dialog.getByRole('link', { name: 'Repository', exact: true }).click();
  await dialog.getByRole('link', { name: 'Support my projects', exact: true }).click();
  assert.deepEqual(await app.evaluate(() => globalThis.aboutLinks), [metadata.repository.url, metadata.funding.url]);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'settings');
});

test('comparison list retains edits, deduplicates pairs, and File Recent persists descriptors', async t => {
  const { page, app, files, dir } = await fixture(t, { left: 'left', right: 'right', other: 'other' });
  const entries = page.locator('.comparison-item');
  assert.equal(await entries.count(), 1);
  const right = page.locator('[data-side="right"] .cm-content'); await right.focus(); await page.keyboard.type('EDIT ');
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  await page.evaluate(file => window.diffgusting.sourceLoad('left', { kind: 'file', path: file }), files.left);
  await page.evaluate(file => window.diffgusting.sourceLoad('right', { kind: 'file', path: file }), files.other);
  await page.getByRole('button', { name: 'Open comparison', exact: true }).click();
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
  assert.equal(await realpath(saved.comparisons[0].request.right.path), await realpath(files.right));
  await right.focus(); await page.keyboard.type('UNSAVED');
  await entries.first().getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('#close-dialog').waitFor({ state: 'visible' }); await page.locator('#close-cancel').click();
  assert.equal(await entries.count(), 2); assert.match(await right.innerText(), /UNSAVED/);
});

test('folder inventory stays usable through tree/list selection, lazy loading, and source failure', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-folder-progressive-'));
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await Promise.all([mkdir(path.join(left, 'nested'), { recursive: true }), mkdir(path.join(right, 'nested'), { recursive: true })]);
  await Promise.all([
    writeFile(path.join(left, 'changed.txt'), 'left changed'), writeFile(path.join(right, 'changed.txt'), 'right changed'),
    writeFile(path.join(left, 'nested', 'same.txt'), 'same'), writeFile(path.join(right, 'nested', 'same.txt'), 'same'),
  ]);
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.getByRole('radio', { name: 'Folder', exact: true }).check();
  await page.evaluate(source => window.diffgusting.sourceLoad('left', source), { kind: 'file', path: left });
  await page.getByRole('button', { name: /changed\.txt/ }).waitFor();
  assert.match(await page.locator('#inventory-progress').innerText(), /compared|discovered/);
  await page.evaluate(source => window.diffgusting.sourceLoad('right', source), { kind: 'file', path: right });
  await page.getByRole('button', { name: /changed\.txt/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-side="left"] .cm-content')?.textContent.includes('left changed'));
  await page.locator('#file-view').selectOption('tree');
  await page.getByRole('button', { name: /nested/ }).click();
  await page.getByRole('button', { name: /same\.txt/ }).waitFor();
  const failure = await page.evaluate(source => window.diffgusting.sourceLoad('left', source), { kind: 'file', path: path.join(left, 'missing') });
  assert.equal(failure.ok, false);
  await page.getByRole('button', { name: /changed\.txt/ }).waitFor();
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

test('Git discovery exposes an inline working-version control without a prompt', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-git-identity-ui-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const file = path.join(dir, 'file.txt'); await writeFile(file, 'base'); git('add', '.'); git('commit', '--quiet', '-m', 'base'); git('tag', '-a', 'release', '-m', 'release'); git('branch', 'alias');
  const base = git('rev-parse', 'HEAD'); await writeFile(file, 'working');
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.locator('#right-source').fill(file); await page.locator('#right-source').press('Enter');
  await page.getByRole('combobox', { name: 'Choose right version', exact: true }).waitFor();
  assert.equal(await page.locator('#git-choice-dialog').count(), 0);
  const editor = page.locator('[data-side="right"] .cm-content'); assert.equal(await editor.innerText(), 'working');
  await page.getByRole('combobox', { name: 'Choose right version', exact: true }).click();
  const alias = page.getByLabel('right revision display name'); await alias.selectOption('release');
  assert.match(await alias.getAttribute('title'), new RegExp(base));
  await page.locator('#history-close').click();
  assert.equal(await page.locator('.base-dirty').innerText(), '●');
  await editor.focus(); await page.keyboard.type('edit '); await page.locator('#save').click();
  await page.waitForFunction(() => !document.querySelector('.state-label')?.textContent.includes('UNSAVED'));
  assert.equal(await page.locator('.base-dirty').innerText(), '●'); assert.equal(await page.locator('.revision-name').innerText(), 'release');
  await editor.focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('base');
  await page.waitForFunction(() => document.querySelector('.base-dirty')?.textContent === '');
  git('add', 'file.txt'); git('commit', '--quiet', '-m', 'saved edit'); git('tag', '-f', 'release');
  await page.evaluate(() => window.diffgusting.refresh());
  await page.waitForFunction(() => document.querySelector('.revision-name')?.textContent !== 'release');
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
  await clickRecent(); await page.locator('[data-side="right"] .cm-content').waitFor();
  assert.equal(await page.locator('#close-dialog').isVisible(), false);
  assert.equal(await page.locator('.comparison-item').count(), 2);
  const retained = page.locator('.comparison-item').filter({ hasText: 'draft' });
  await retained.locator('button').first().click(); assert.match(await editor.innerText(), /UNSAVED/);
  await retained.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('#close-discard').click();
  assert.equal(await page.locator('[data-side="right"] .cm-content').innerText(), 'right');
  assert.equal(await readFile(draft, 'utf8'), 'draft');
  await page.evaluate(file => window.diffgusting.sourceLoad('right', { kind: 'file', path: file }), draft);
  await page.waitForFunction(() => document.querySelectorAll('.comparison-item').length === 1 && document.querySelector('[data-side="right"] .cm-content')?.textContent === 'draft');
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

test('New retains an edited preview without a close prompt and submits only a ready pair', async t => {
  const { page, app, files } = await fixture(t, { left: 'left', right: 'right', other: 'other' });
  const first = await page.locator('.comparison-item').getAttribute('data-comparison');
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  for (const [width, height] of [[900, 600], [1440, 960]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.locator('#theme').selectOption(theme);
      const bounds = await page.evaluate(() => ({
        overflow: document.documentElement.scrollHeight > innerHeight,
        logo: document.querySelector('header img').getBoundingClientRect().height,
        title: document.querySelector('#creation-title').getBoundingClientRect().top,
        open: document.querySelector('#open-comparison').getBoundingClientRect().bottom,
        sidebar: document.querySelector('#toggle-comparisons').getBoundingClientRect().bottom,
      }));
      assert.equal(bounds.overflow, false); assert.equal(bounds.logo, 48);
      assert.ok(bounds.title >= 0 && bounds.open < height && bounds.sidebar < height);
    }
  }
  assert.equal(await page.locator('#left-source').inputValue(), '');
  await page.locator('#left-source').fill(files.other); await page.locator('#left-source').press('Enter');
  const preview = page.locator('[data-side="left"] .cm-content'); await preview.focus(); await page.keyboard.type('draft edit ');
  await page.getByRole('radio', { name: 'Folder', exact: true }).check();
  await page.locator('#close-dialog').waitFor({ state: 'visible' }); await page.locator('#close-cancel').click();
  assert.equal(await page.getByRole('radio', { name: 'File', exact: true }).isChecked(), true);
  assert.match(await preview.innerText(), /draft edit/);
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  assert.equal(await page.locator('#close-dialog').isVisible(), false, 'New must preserve the edited preview without asking to close it');
  await page.waitForFunction(() => document.querySelector('#left-source').value === '');
  assert.equal(await page.locator('.comparison-item').count(), 2);
  const retained = page.locator('.comparison-item').filter({ hasText: 'other.txt' });
  await retained.locator('button').first().click(); assert.match(await preview.innerText(), /draft edit/);
  await page.locator('#undo').click(); assert.equal(await preview.innerText(), 'other');
  await page.locator('#redo').click(); assert.match(await preview.innerText(), /draft edit/);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'New…').click());
  await page.waitForFunction(() => document.querySelector('#left-source').value === '' || document.querySelector('#close-dialog').open);
  assert.equal(await page.locator('#close-dialog').isVisible(), false, 'File > New must also retain the edited preview');
  await retained.locator('button').first().click(); assert.match(await preview.innerText(), /draft edit/);
  await retained.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('#close-dialog').waitFor({ state: 'visible' }); await page.locator('#close-cancel').click();
  assert.match(await preview.innerText(), /draft edit/);
  await retained.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('#close-discard').click();
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  assert.equal(await page.locator('#left-source').inputValue(), '');
  await page.locator('#left-source').fill(files.left); await page.locator('#left-source').press('Enter');
  await page.locator('#right-source').fill(files.right); await page.locator('#right-source').press('Enter');
  await page.waitForFunction(() => !document.querySelector('#open-comparison').disabled);
  assert.equal(await page.locator('.comparison-item').count(), 2);
  await page.locator('#open-comparison').click();
  await page.waitForFunction(() => !document.body.classList.contains('creating'));
  assert.equal(await page.locator('.comparison-item').count(), 1);
  assert.equal(await page.locator('.comparison-item').getAttribute('data-comparison'), first);
  await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('#creation-title').waitFor();
  assert.equal(await page.locator('#left-source').inputValue(), '');
  await page.screenshot({ path: 'test-results/new-comparison.png' });
});

for (const submitted of [false, true]) test(`inline revisions retain grouped edits and titles ${submitted ? 'after' : 'before'} submission`, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-grouped-revisions-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  const left = path.join(dir, 'left.txt'); const right = path.join(dir, 'right.txt');
  await writeFile(left, 'first'); await writeFile(right, 'right'); git('add', '.'); git('commit', '--quiet', '-m', 'first');
  const first = git('rev-parse', 'HEAD'); git('tag', '-a', 'release', '-m', 'release'); git('branch', 'old-branch');
  await writeFile(left, 'second'); git('add', '.'); git('commit', '--quiet', '-m', 'second');
  const app = await electron.launch({ timeout: 30000, args: submitted ? ['.', left, right] : ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  if (!submitted) {
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.locator('#left-source').fill(left); await page.locator('#left-source').press('Enter');
    await page.locator('#right-source').fill(right); await page.locator('#right-source').press('Enter');
    await page.waitForFunction(() => !document.querySelector('#open-comparison').disabled);
  }
  const leftEditor = page.locator('[data-side="left"] .cm-content'); await leftEditor.focus(); await page.keyboard.type('UNSAVED ');
  const original = await page.locator('.comparison-item').getAttribute('data-comparison');
  const originalTitle = await page.locator('.comparison-item>button').first().innerText();
  const selector = page.getByRole('combobox', { name: 'Choose left version', exact: true });
  await selector.focus(); await page.keyboard.press('Space');
  await page.locator('#history-reference').selectOption('release'); await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.comparison-group').count(), 1); assert.equal(await page.locator('.comparison-item').count(), 1);
  assert.notEqual(await page.locator('.comparison-item').getAttribute('data-comparison'), original);
  assert.equal(await page.locator('#comparison-back').isEnabled(), true);
  const changedTitle = await page.locator('.comparison-item>button').first().innerText();
  assert.notEqual(changedTitle, originalTitle); assert.ok(changedTitle.includes(first.slice(0, 8)));
  assert.equal(await leftEditor.innerText(), 'first'); assert.equal(await leftEditor.getAttribute('contenteditable'), 'false');
  assert.equal(await selector.innerText(), 'release'); assert.equal(await selector.getAttribute('title'), first);
  for (const layout of ['side-by-side', 'unified', 'merge']) {
    await page.locator('#layout').selectOption(layout);
    for (const theme of ['dark', 'light']) { await page.locator('#theme').selectOption(theme); assert.equal(await selector.isVisible(), true); assert.equal(await realpath(await page.locator('#left-source').inputValue()), await realpath(left)); }
  }
  await page.locator('#layout').selectOption('side-by-side');
  await selector.click(); await page.locator('#history-alias').selectOption('old-branch'); await page.locator('#history-close').click();
  assert.equal(await selector.innerText(), 'old-branch'); assert.equal(await page.locator('.comparison-item').count(), 1);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-side="left"] .cm-content')?.textContent.includes('UNSAVED'));
  assert.equal(await page.locator('.comparison-item>button').first().innerText(), originalTitle);
  assert.equal(await page.locator('#comparison-forward').isEnabled(), true);
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  assert.equal(await page.locator('.comparison-item>button').first().innerText(), changedTitle);
  await selector.click(); await page.locator('#history-working').click(); await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  assert.match(await leftEditor.innerText(), /UNSAVED/); assert.equal(await page.locator('.comparison-item').count(), 1);
  await page.locator(`[data-comparison="${original}"] .close-comparison`).click();
  await page.locator('#close-cancel').click(); assert.equal(await page.locator('.comparison-item').count(), 1);
  await selector.click(); await page.locator('#history-reference').selectOption('old-branch'); await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.comparison-item').count(), 1);
  assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'refs/heads/' + git('branch', '--show-current')));
  assert.equal(await readFile(left, 'utf8'), 'second');
});

test('large folder windows preserve anchors and keep comparison scrolling independent', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-windowed-folders-'));
  const left = path.join(dir, 'left'); const right = path.join(dir, 'right');
  await mkdir(left); await mkdir(right);
  await Promise.all(Array.from({ length: 1100 }, (_, index) => writeFile(path.join(left, `file-${String(index).padStart(4, '0')}.txt`), String(index))));
  const app = await electron.launch({ timeout: 30000, args: ['.', left, right], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.locator('#files button').first().waitFor();
  const region = page.locator('#comparison-region'); const original = await region.boundingBox();
  for (const top of [10000, 20000, 37000]) {
    await page.locator('#file-region').evaluate((node, value) => { node.scrollTop = value; }, top);
    await page.waitForFunction(value => Number(document.querySelector('#files button')?.style.top.replace('px', '')) > value - 1000, top);
    assert.ok(await page.locator('#files button').count() <= 60);
    assert.equal(Math.round((await region.boundingBox()).y), Math.round(original.y));
  }
  await page.locator('#files button').last().focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.activeElement.dataset.path === 'file-1099.txt');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-side="left"] .cm-content')?.textContent === '1099');
  const scroll = await page.locator('#file-region').evaluate(node => node.scrollTop);
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  await page.locator('.comparison-item>button').first().click();
  assert.ok(Math.abs(await page.locator('#file-region').evaluate(node => node.scrollTop) - scroll) < 35);
  assert.equal(await page.locator('#files button.selected').getAttribute('data-path'), 'file-1099.txt');
  await writeFile(path.join(left, 'aaa-added.txt'), 'new');
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#inventory-progress').textContent.includes('1101'));
  const refreshed = await page.evaluate(() => ({ selected: document.querySelector('#files button.selected')?.dataset.path, scroll: document.querySelector('#file-region').scrollTop, first: document.querySelector('#files button')?.dataset.path, text: document.querySelector('[data-side="left"] .cm-content')?.textContent }));
  assert.equal(refreshed.selected, 'file-1099.txt', JSON.stringify(refreshed));
  assert.ok(Math.abs(await page.locator('#file-region').evaluate(node => node.scrollTop) - scroll) < 70);
  await page.locator('#filter').fill('file-1099'); assert.equal(await page.locator('#files button').count(), 1);
  await page.locator('#filter').fill('');
  await page.locator('#file-view').selectOption('tree');
  assert.ok(await page.locator('#files button').count() <= 60);
  await page.locator('#file-view').selectOption('list');
  const height = await page.locator('#file-region').evaluate(node => node.clientHeight);
  await page.locator('#toggle-comparisons').click(); assert.equal(await page.locator('#toggle-comparisons').getAttribute('aria-expanded'), 'false');
  assert.ok(await page.locator('#file-region').evaluate(node => node.clientHeight) > height);
  await page.locator('#toggle-comparisons').click(); assert.equal(await page.locator('#documents button').first().innerText(), 'New…');
  for (let index = 0; index < 9; index++) {
    const result = await page.evaluate(request => window.diffgusting.open(request), { left: { kind: 'file', path: path.join(left, `file-${String(index).padStart(4, '0')}.txt`) }, right: { kind: 'file', path: path.join(left, 'file-1099.txt') } });
    assert.equal(result.ok, true, result.error);
  }
  assert.ok(await page.locator('#documents').evaluate(node => node.scrollHeight > node.clientHeight));
  await page.locator('#documents').evaluate(node => { node.scrollTop = node.scrollHeight; });
  assert.equal(await page.locator('#toggle-comparisons').isVisible(), true);
  await page.screenshot({ path: 'test-results/comparison-sidebar.png' });
});

test('New hides retained edits and file path changes use one group slot with restorable history', async t => {
  const { page, app, files, dir } = await fixture(t, { left: 'left', right: 'right', other: 'other', third: 'third' });
  const rows = page.locator('.comparison-item'); const original = await rows.getAttribute('data-comparison');
  const rightEditor = page.locator('[data-side="right"] .cm-content');
  await rightEditor.focus(); await page.keyboard.type('UNSAVED ');
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  assert.equal(await rows.count(), 1); assert.equal(await rows.getAttribute('data-comparison'), original);
  assert.equal(await page.locator('.comparison-item .selected').count(), 0);
  assert.equal(await page.locator('.new-comparison.selected').count(), 1);
  assert.equal(await page.locator('#close-dialog').isVisible(), false);
  assert.equal(await page.locator('#content .cm-editor').count(), 0);
  await rows.locator('button').first().click();
  assert.match(await rightEditor.innerText(), /UNSAVED/);
  await page.locator('#right-source').fill(files.other); await page.locator('#right-source').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content')?.textContent === 'other');
  const replacement = await rows.getAttribute('data-comparison'); assert.notEqual(replacement, original);
  assert.equal(await page.locator('#source-bar #comparison-back').count(), 1);
  assert.equal(await page.locator('#source-bar #comparison-forward').count(), 1);
  assert.equal(await page.locator('#comparison-region #comparison-back, #comparison-region #comparison-forward').count(), 0);
  assert.equal(await page.getByRole('combobox', { name: 'Comparison history', exact: true }).count(), 0);
  assert.equal(await rows.count(), 1); assert.equal(await page.locator('.comparison-group').count(), 1);
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  assert.equal(await rows.getAttribute('data-comparison'), replacement);
  await rows.locator('button').first().click();
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content')?.textContent === 'other');
  await page.locator('#source-bar #comparison-back').click();
  assert.match(await rightEditor.innerText(), /UNSAVED/);
  await page.locator('#undo').click(); assert.equal(await rightEditor.innerText(), 'right');
  await page.locator('#source-bar #comparison-forward').click();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, files.third);
  await page.locator('#choose-left').click();
  await page.waitForFunction(() => document.querySelector('[data-side="left"] .cm-content')?.textContent === 'third');
  assert.equal(await rows.count(), 1); assert.equal(await page.locator('#comparison-forward').isDisabled(), true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await rows.getAttribute('data-comparison'), replacement);
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await page.waitForFunction(id => document.querySelector('.comparison-item')?.dataset.comparison !== id, replacement);
  await rows.getByRole('button', { name: 'Close comparison', exact: true }).click();
  assert.equal(await rows.count(), 1); assert.equal(await rows.getAttribute('data-comparison'), replacement);
  await page.screenshot({ path: 'test-results/single-slot-comparison-group.png' });
});

for (const submitted of [false, true]) test(`New preserves an edited folder pair ${submitted ? 'after' : 'before'} explicit submission`, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-new-folder-'));
  const folders = ['left', 'right', 'other'].map(name => path.join(dir, name));
  for (const folder of folders) { await mkdir(folder); await writeFile(path.join(folder, 'child.txt'), path.basename(folder)); }
  const app = await electron.launch({ timeout: 30000, args: ['.'], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.getByRole('radio', { name: 'Folder', exact: true }).check();
  for (const [index, side] of ['left', 'right'].entries()) {
    await page.locator(`#${side}-source`).fill(folders[index]); await page.locator(`#${side}-source`).press('Enter');
    await page.locator('.comparison-item').waitFor();
    assert.ok((await page.locator('.comparison-item>button').first().innerText()).includes(side));
  }
  await page.waitForFunction(() => !document.querySelector('#open-comparison').disabled);
  if (submitted) {
    await page.locator('#open-comparison').click();
    await page.waitForFunction(() => !document.body.classList.contains('creating'));
  }
  const editor = page.locator('[data-side="right"] .cm-content');
  await editor.focus(); await page.keyboard.type('UNSAVED ');
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content').textContent.includes('UNSAVED'));
  for (const menu of [false, true]) {
    if (menu) await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'New…').click());
    else await page.getByRole('button', { name: 'New…', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#left-source').value === '' || document.querySelector('#close-dialog').open);
    assert.equal(await page.locator('#close-dialog').isVisible(), false, 'New must not prompt to close the edited folder comparison');
    assert.equal(await page.locator('.comparison-item').count(), 1);
    await page.locator('.comparison-item>button').first().click();
    assert.equal(await page.locator('#left-source').inputValue(), folders[0]);
    assert.equal(await page.locator('#right-source').inputValue(), folders[1]);
    assert.match(await editor.innerText(), /UNSAVED/);
  }
  const original = await page.locator('.comparison-item').getAttribute('data-comparison');
  const originalTitle = await page.locator('.comparison-item>button').first().innerText();
  await page.locator('#right-source').fill(folders[2]); await page.locator('#right-source').press('Enter');
  assert.equal(await page.locator('#comparison-back').isEnabled(), true, 'Back must enable while the replacement folder is loading');
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content')?.textContent === 'other' || document.querySelector('#close-dialog').open);
  assert.equal(await page.locator('#close-dialog').isVisible(), false);
  assert.notEqual(await page.locator('.comparison-item').getAttribute('data-comparison'), original);
  assert.equal(await page.locator('#comparison-back').isEnabled(), true);
  const changedTitle = await page.locator('.comparison-item>button').first().innerText();
  assert.ok(changedTitle.includes('other')); assert.notEqual(changedTitle, originalTitle);
  await page.locator('#comparison-back').click();
  assert.equal(await page.locator('.comparison-item>button').first().innerText(), originalTitle);
  assert.match(await editor.innerText(), /UNSAVED/);
  assert.equal(await page.locator('#comparison-forward').isEnabled(), true);
  await page.locator('#comparison-forward').click();
  assert.equal(await page.locator('.comparison-item>button').first().innerText(), changedTitle);
  await page.locator('#comparison-back').click();
  await page.locator('#undo').click(); assert.equal(await editor.innerText(), 'right');
  assert.equal(await readFile(path.join(folders[1], 'child.txt'), 'utf8'), 'right');
});

test('folder roots remain editable and Browse keeps replacements in one slot', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diffgusting-folder-group-'));
  const folders = ['left', 'right', 'other'].map(name => path.join(dir, name));
  for (const folder of folders) { await mkdir(folder); await writeFile(path.join(folder, 'child.txt'), path.basename(folder)); }
  const app = await electron.launch({ timeout: 30000, args: ['.', folders[0], folders[1]], env: { ...process.env, DIFFGUSTING_SETTINGS_DIR: dir } });
  t.after(async () => { await app.evaluate(({ app }) => app.exit(0)); await rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  const right = page.locator('[data-side="right"] .cm-content'); await right.focus(); await page.keyboard.type('EDIT ');
  const original = await page.locator('.comparison-item').getAttribute('data-comparison');
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async (_window, options) => { if (!options.properties.includes('openDirectory')) throw new Error('Expected a folder picker'); return { canceled: false, filePaths: [folder] }; }; }, folders[2]);
  await page.locator('#choose-right').click();
  await page.waitForFunction(() => document.querySelector('[data-side="right"] .cm-content')?.textContent === 'other');
  assert.equal(await page.locator('.comparison-item').count(), 1);
  assert.equal(await page.locator('#right-source').inputValue(), folders[2]);
  await page.locator('#left-source').fill(folders[1]); await page.locator('#left-source').press('Enter');
  await page.waitForFunction(() => document.querySelector('#left-source').value.endsWith('/right') && document.querySelector('[data-side="left"] .cm-content')?.textContent.includes('right'));
  assert.equal(await page.locator('.comparison-item').count(), 1);
  await page.getByRole('button', { name: 'New…', exact: true }).click();
  assert.equal(await page.locator('#comparison-back').isDisabled(), true);
  assert.equal(await page.locator('#comparison-forward').isDisabled(), true);
  await page.locator('.comparison-item>button').first().click();
  await page.locator('#source-bar #comparison-back').click();
  await page.locator('#source-bar #comparison-back').click();
  assert.equal(await page.locator('.comparison-item').getAttribute('data-comparison'), original);
  assert.match(await right.innerText(), /EDIT/);
  assert.equal(await page.locator('#right-source').inputValue(), folders[1]);
});
