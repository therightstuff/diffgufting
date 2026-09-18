import { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, shell } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspaces, recentComparisons } from '../host/workspaces.mjs';
import { parseArguments } from '../core/arguments.mjs';
import { settings } from '../core/settings.mjs';
import { applyTheme, subscribeToAppearance } from './theme.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let application;
let window; let workspaces; let pendingClose = false; let rendererReady = false; let dirty = false; let preferences = settings(); let appearance = 'dark'; let stopAppearanceUpdates; let initial; let initialComparison;
const send = value => { if (window && !window.isDestroyed()) window.webContents.send('diffgufting:event', value); };
function preferenceState() { return { preferences, appearance }; }
function publishAppearance(next) {
  appearance = next;
  send({ type: 'appearance', ...preferenceState() });
}
function authorize(event) { if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted application frame'); }
function ipc(name, action) {
  ipcMain.handle(`diffgufting:${name}`, async (event, ...args) => {
    authorize(event);
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message, external: error.external }; }
  });
}
async function openSession(request) {
  return workspaces.open(request);
}
async function ensureSession() {
  return (workspaces.active ?? await workspaces.ensureDraft()).session;
}
async function launch() {
  const rawArgs = process.argv.slice(app.isPackaged ? 1 : 2);
  const separator = rawArgs.indexOf('--');
  const argv = rawArgs.filter((arg, index) => (separator >= 0 && index >= separator) || !/^--(?:inspect(?:-brk)?|remote-debugging-port)=/.test(arg));
  initial = argv.length ? parseArguments(argv) : null;
  await app.whenReady();
  const settingsDir = process.env.DIFFGUFTING_SETTINGS_DIR ?? app.getPath('userData');
  const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  application = Object.freeze({ name: packageInfo.name, version: packageInfo.version, description: packageInfo.description, logo: '../assets/branding/diffgufting-logo.png', repository: packageInfo.repository.url, support: packageInfo.funding.url });
  app.setName(application.name);
  app.dock?.setIcon(path.join(root, 'assets/branding/diffgufting-icon.png'));
  const settingsFile = path.join(settingsDir, 'settings.json');
  const recentFile = path.join(settingsDir, 'recent-comparisons.json');
  let recent = []; let recentWrite = Promise.resolve();
  try {
    const saved = JSON.parse(await readFile(recentFile, 'utf8'));
    if (saved.version === 1 && Array.isArray(saved.comparisons)) recent = saved.comparisons.filter(item => typeof item.key === 'string' && typeof item.label === 'string' && item.request?.left && item.request?.right).slice(0, 10);
  } catch (error) { if (error.code !== 'ENOENT') send({ type: 'error', message: `Recent comparisons could not be loaded: ${error.message}` }); }
  workspaces = new Workspaces(preferences, send, entry => {
    recent = recentComparisons(recent, entry);
    const contents = JSON.stringify({ version: 1, comparisons: recent }, null, 2);
    recentWrite = recentWrite.then(async () => { await mkdir(settingsDir, { recursive: true }); await writeFile(recentFile, contents); }).catch(error => send({ type: 'error', message: `Recent comparisons could not be saved: ${error.message}` }));
    updateMenu();
  });
  try { preferences = settings(JSON.parse(await readFile(settingsFile, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') console.error(`Preferences could not be loaded: ${error.message}`); }
  workspaces.options = preferences;
  appearance = applyTheme(nativeTheme, preferences.theme);
  stopAppearanceUpdates = subscribeToAppearance(nativeTheme, () => preferences.theme, publishAppearance);
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 600, title: application.name, show: false, backgroundColor: appearance === 'dark' ? '#171a21' : '#f5f4f0', icon: path.join(root, 'assets/branding/diffgufting-icon.png'), webPreferences: { preload: path.join(root, 'src/desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const eventMenu = (label, command, accelerator) => ({ label, accelerator, click: () => send({ type: 'command', command }) });
  function updateMenu() { Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: application.name, submenu: [{ label: `About ${application.name}`, click: () => send({ type: 'command', command: 'about' }) }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [eventMenu('New…', 'new-comparison', 'CmdOrCtrl+N'), { label: 'Recent', submenu: recent.length ? recent.map(item => ({ label: item.label, click: () => send({ type: 'recent-open', key: item.key }) })) : [{ label: 'No recent comparisons', enabled: false }] }, eventMenu('Save', 'save', 'CmdOrCtrl+S'), eventMenu('Save As…', 'save-as', 'CmdOrCtrl+Shift+S'), eventMenu('Close comparison', 'close-comparison'), { role: 'close' }] },
    { label: 'Edit', submenu: [eventMenu('Undo', 'undo', 'CmdOrCtrl+Z'), eventMenu('Redo', 'redo', 'CmdOrCtrl+Shift+Z'), { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    ...(process.platform === 'darwin' ? [] : [{ label: 'Help', submenu: [{ label: `About ${application.name}`, click: () => send({ type: 'command', command: 'about' }) }] }]),
  ])); }
  updateMenu();
  if (initial) initialComparison = await openSession(initial);
  else await workspaces.newDraft();
  ipc('bootstrap', async () => { rendererReady = true; return { ...preferenceState(), application, comparison: initialComparison ?? null, workspace: workspaces.snapshot(), comparisons: workspaces.list(), groups: workspaces.groupList() }; });
  ipc('about-link', link => {
    const destination = link === 'repository' ? application.repository : link === 'support' ? application.support : null;
    if (!destination) throw new Error('Unknown About link');
    return shell.openExternal(destination);
  });
  ipc('open', openSession);
  ipc('comparison-activate', id => workspaces.activate(id));
  ipc('comparison-close', id => workspaces.remove(id));
  ipc('comparison-back', () => workspaces.back());
  ipc('comparison-forward', () => workspaces.forward());
  ipc('comparison-new', () => workspaces.newDraft());
  ipc('comparison-submit', () => workspaces.submitDraft());
  ipc('comparison-type', type => workspaces.setDraftType(type));
  ipc('recent-open', key => {
    const item = recent.find(entry => entry.key === key);
    if (!item) throw new Error('Recent comparison is no longer available');
    const existing = [...workspaces.records.values()].find(record => record.key === key);
    return existing ? workspaces.activate(existing.id) : workspaces.open(item.request);
  });
  ipc('source-load', (side, descriptor) => workspaces.load(side, descriptor));
  ipc('source-state', async () => {
    const active = await ensureSession();
    return Object.fromEntries(['left', 'right'].map(side => [side, active.snapshot(active.source(side))]));
  });
  const histories = new Map();
  ipc('history-open', async (side, generation) => { const session = await ensureSession(); const opened = await session.openHistory(side, generation); histories.set(opened.id, session); return opened; });
  ipc('history-page', (id, cursor) => histories.get(id)?.historyPage(id, cursor));
  ipc('history-close', id => { const session = histories.get(id); if (session) { workspaces.cancelOpening(session); session.closeHistory(id); } histories.delete(id); });
  ipc('source-commit', (side, generation, ref, owner) => workspaces.selectCommit(side, generation, ref, owner));
  ipc('source-working', (side, generation, owner) => workspaces.selectWorking(side, generation, owner));
  ipc('read', file => workspaces.read(file));
  ipc('selected-entry', pathname => workspaces.loadSelected(pathname));
  ipc('save', request => workspaces.save(request.path, request.text, request.fingerprint, request.format));
  ipc('save-as', async request => {
    const chosen = await dialog.showSaveDialog(window, { defaultPath: request.path });
    if (chosen.canceled) return null;
    const session = await ensureSession();
    const file = await session.allow(chosen.filePath);
    const state = await session.read(file);
    return { path: file, state };
  });
  ipc('choose', async request => {
    const choice = typeof request === 'object' ? request : { directory: request };
    const defaultPath = typeof choice.defaultPath === 'string' && choice.defaultPath ? choice.defaultPath : undefined;
    const chosen = await dialog.showOpenDialog(window, { defaultPath, properties: [choice.directory ? 'openDirectory' : 'openFile'] });
    return chosen.canceled ? null : chosen.filePaths[0];
  });
  ipc('refresh', () => workspaces.active?.session.poll());
  ipc('preferences', async value => {
    preferences = settings({ ...preferences, ...value });
    workspaces.options = preferences;
    appearance = applyTheme(nativeTheme, preferences.theme);
    await mkdir(settingsDir, { recursive: true }); await writeFile(settingsFile, JSON.stringify(preferences, null, 2));
    return preferenceState();
  });
  ipcMain.on('diffgufting:dirty', (event, value) => { authorize(event); dirty = !!value; window.setDocumentEdited(dirty); });
  ipcMain.on('diffgufting:close-approved', event => { authorize(event); pendingClose = true; window.close(); });
  // Ask the renderer for current state: its latest edit notification can still be in flight.
  window.webContents.on('render-process-gone', () => { rendererReady = false; });
  window.on('close', event => { if (!pendingClose && rendererReady) { event.preventDefault(); send({ type: 'close-request' }); } });
  window.on('closed', () => workspaces.close());
  window.on('focus', () => workspaces.active?.session.poll());
  window.webContents.once('did-fail-load', (_event, _code, message) => { process.send?.({ error: message }); app.exit(1); });
  await window.loadFile(path.join(root, 'dist/index.html'));
  window.show();
  process.send?.({ ready: true });
  app.on('window-all-closed', () => app.quit());
  app.once('will-quit', () => stopAppearanceUpdates?.());
}
// Electron waits for ESM evaluation before ready; do not await launch at module scope.
launch().catch(error => { process.send?.({ error: error.message }); console.error(error.message); app.exit(1); });
