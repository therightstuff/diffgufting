import { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from '../host/session.mjs';
import { parseArguments } from '../core/arguments.mjs';
import { settings } from '../core/settings.mjs';
import { applyTheme, subscribeToAppearance } from './theme.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let window; let session; let pendingClose = false; let dirty = false; let preferences = settings(); let appearance = 'dark'; let stopAppearanceUpdates; let initial; let initialComparison;
const send = value => { if (window && !window.isDestroyed()) window.webContents.send('diffgusting:event', value); };
function preferenceState() { return { preferences, appearance }; }
function publishAppearance(next) {
  appearance = next;
  send({ type: 'appearance', ...preferenceState() });
}
function authorize(event) { if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted application frame'); }
function ipc(name, action) {
  ipcMain.handle(`diffgusting:${name}`, async (event, ...args) => {
    authorize(event);
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message, external: error.external }; }
  });
}
async function openSession(request) {
  if (!request?.left || !request?.right) throw new Error('Choose two comparison sources');
  const next = new Session(request, preferences);
  let comparison;
  try { comparison = await next.refresh(); }
  catch (error) { next.close(); throw error; }
  session?.close(); session = next;
  session.subscribe(send);
  await session.start();
  return comparison;
}
async function ensureSession() {
  if (session) return session;
  session = new Session({}, preferences);
  session.subscribe(send);
  await session.start();
  return session;
}
async function launch() {
  const rawArgs = process.argv.slice(app.isPackaged ? 1 : 2);
  const separator = rawArgs.indexOf('--');
  const argv = rawArgs.filter((arg, index) => (separator >= 0 && index >= separator) || !/^--(?:inspect(?:-brk)?|remote-debugging-port)=/.test(arg));
  initial = argv.length ? parseArguments(argv) : null;
  await app.whenReady();
  const settingsDir = process.env.DIFFGUSTING_SETTINGS_DIR ?? app.getPath('userData');
  const settingsFile = path.join(settingsDir, 'settings.json');
  try { preferences = settings(JSON.parse(await readFile(settingsFile, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') console.error(`Preferences could not be loaded: ${error.message}`); }
  appearance = applyTheme(nativeTheme, preferences.theme);
  stopAppearanceUpdates = subscribeToAppearance(nativeTheme, () => preferences.theme, publishAppearance);
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 600, title: 'Diffgusting', show: false, backgroundColor: appearance === 'dark' ? '#171a21' : '#f5f4f0', icon: path.join(root, 'assets/branding/diffgusting-icon.png'), webPreferences: { preload: path.join(root, 'src/desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const eventMenu = (label, command, accelerator) => ({ label, accelerator, click: () => send({ type: 'command', command }) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [eventMenu('Save', 'save', 'CmdOrCtrl+S'), eventMenu('Save As…', 'save-as', 'CmdOrCtrl+Shift+S'), { role: 'close' }] },
    { label: 'Edit', submenu: [eventMenu('Undo', 'undo', 'CmdOrCtrl+Z'), eventMenu('Redo', 'redo', 'CmdOrCtrl+Shift+Z'), { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
  ]));
  if (initial) initialComparison = await openSession(initial);
  ipc('bootstrap', async () => ({ ...preferenceState(), comparison: initialComparison ?? null }));
  ipc('open', openSession);
  ipc('source-load', async (side, descriptor) => (await ensureSession()).load(side, descriptor));
  ipc('source-state', async () => {
    const active = await ensureSession();
    return Object.fromEntries(['left', 'right'].map(side => [side, active.snapshot(active.source(side))]));
  });
  ipc('history-open', (side, generation) => session?.openHistory(side, generation));
  ipc('history-page', (id, cursor) => session?.historyPage(id, cursor));
  ipc('history-close', id => session?.closeHistory(id));
  ipc('source-commit', (side, generation, ref) => session?.selectCommit(side, generation, ref));
  ipc('read', file => session.read(file));
  ipc('save', request => session.save(request.path, request.text, request.fingerprint, request.format));
  ipc('save-as', async request => {
    const chosen = await dialog.showSaveDialog(window, { defaultPath: request.path });
    if (chosen.canceled) return null;
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
  ipc('refresh', () => session?.poll());
  ipc('preferences', async value => {
    preferences = settings({ ...preferences, ...value });
    appearance = applyTheme(nativeTheme, preferences.theme);
    await mkdir(settingsDir, { recursive: true }); await writeFile(settingsFile, JSON.stringify(preferences, null, 2));
    return preferenceState();
  });
  ipcMain.on('diffgusting:dirty', (event, value) => { authorize(event); dirty = !!value; });
  ipcMain.on('diffgusting:close-approved', event => { authorize(event); pendingClose = true; window.close(); });
  window.on('close', event => { if (dirty && !pendingClose) { event.preventDefault(); send({ type: 'close-request' }); } });
  window.on('closed', () => session?.close());
  window.on('focus', () => session?.poll());
  window.webContents.once('did-fail-load', (_event, _code, message) => { process.send?.({ error: message }); app.exit(1); });
  await window.loadFile(path.join(root, 'dist/index.html'));
  window.show();
  process.send?.({ ready: true });
  app.on('window-all-closed', () => app.quit());
  app.once('will-quit', () => stopAppearanceUpdates?.());
}
// Electron waits for ESM evaluation before ready; do not await launch at module scope.
launch().catch(error => { process.send?.({ error: error.message }); console.error(error.message); app.exit(1); });
