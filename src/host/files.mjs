import { lstat, readFile, readdir, readlink, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { defaults } from '../core/settings.mjs';

export const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');

export function decode(bytes) {
  try {
    let bom = false; let textBytes = bytes;
    if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) { bom = true; textBytes = bytes.subarray(3); }
    if (textBytes.includes(0)) throw new Error('Binary file');
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(textBytes);
    const crlf = raw.includes('\r\n');
    const loneLf = /(?<!\r)\n/.test(raw);
    if ((crlf && loneLf) || /\r(?!\n)/.test(raw)) throw new Error('Unsupported mixed or legacy line endings');
    return { text: raw.replaceAll('\r\n', '\n'), format: { bom, newline: crlf ? '\r\n' : '\n' } };
  } catch (error) { return { text: null, error: `Not editable: ${error.message}` }; }
}

export async function readDisk(file, options = defaults) {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) return { text: null, kind: 'symlink', fingerprint: `link:${await readlink(file)}`, error: 'Symbolic link: edit its target explicitly' };
    if (!info.isFile()) return { text: null, fingerprint: 'not-file', error: 'Not a regular file' };
    if (info.size > options.maxFileBytes) return { text: null, fingerprint: `large:${info.size}:${info.mtimeMs}`, error: `File exceeds the configured ${options.maxFileBytes} byte editing limit` };
    const bytes = await readFile(file);
    return { ...decode(bytes), fingerprint: fingerprint(bytes), mode: info.mode, kind: 'file' };
  } catch (error) {
    if (error.code === 'ENOENT') return { text: null, fingerprint: 'missing', missing: true };
    return { text: null, fingerprint: `error:${error.code}`, error: `Cannot read ${file}: ${error.message}` };
  }
}

export async function mapBounded(items, limit, work) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Concurrency limit must be a positive integer');
  const results = new Array(items.length); let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

export async function readInventory(root, options = defaults) {
  const absoluteRoot = path.resolve(root);
  const entries = [];
  async function visit(absolute, relative) {
    let info;
    try { info = await lstat(absolute); }
    catch (error) { entries.push({ path: relative, absolute, kind: 'unavailable', error: error.message }); return; }
    if (info.isDirectory()) {
      if (relative) entries.push({ path: relative, absolute, kind: 'directory' });
      let children;
      try { children = await readdir(absolute); }
      catch (error) { entries.push({ path: relative, absolute, kind: 'unavailable', error: error.message }); return; }
      await mapBounded(children.sort().filter(child => child !== '.git'), options.directoryConcurrency, child => visit(path.join(absolute, child), relative ? `${relative}/${child}` : child));
      return;
    }
    entries.push({ path: relative, absolute, kind: info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : 'unavailable', size: info.size, mtimeMs: info.mtimeMs });
  }
  await visit(absoluteRoot, '');
  return { version: 1, root: absoluteRoot, entries: entries.sort((left, right) => left.path.localeCompare(right.path)), batchSize: options.inventoryBatchSize };
}

export async function readInventorySource(source, options = defaults, discoveredInventory = null) {
  if (source?.kind !== 'file') return null;
  if (typeof source.path !== 'string') throw new Error('Invalid filesystem source');
  const root = path.resolve(source.path); const info = await lstat(root);
  if (!info.isDirectory()) return null;
  const inventory = discoveredInventory ?? await readInventory(root, options);
  return {
    source: { ...source, path: root }, directory: true,
    entries: inventory.entries.filter(entry => entry.kind !== 'directory').map(entry => ({
      ...entry, writable: entry.kind === 'file', lazy: true,
      fingerprint: `metadata:${entry.size ?? 0}:${entry.mtimeMs ?? 0}`,
    })),
  };
}

export async function verifyFileEquality(left, right, chunkBytes = 64 * 1024) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error('Chunk size must be a positive integer');
  const [leftInfo, rightInfo] = await Promise.all([lstat(left), lstat(right)]);
  if (!leftInfo.isFile() || !rightInfo.isFile() || leftInfo.size !== rightInfo.size) return false;
  const [leftHandle, rightHandle] = await Promise.all([open(left, 'r'), open(right, 'r')]);
  try {
    for (let position = 0; position < leftInfo.size; position += chunkBytes) {
      const size = Math.min(chunkBytes, leftInfo.size - position);
      const [leftRead, rightRead] = await Promise.all([leftHandle.read(Buffer.allocUnsafe(size), 0, size, position), rightHandle.read(Buffer.allocUnsafe(size), 0, size, position)]);
      if (leftRead.bytesRead !== rightRead.bytesRead || !leftRead.buffer.subarray(0, leftRead.bytesRead).equals(rightRead.buffer.subarray(0, rightRead.bytesRead))) return false;
    }
    const [afterLeft, afterRight] = await Promise.all([lstat(left), lstat(right)]);
    return afterLeft.size === leftInfo.size && afterLeft.mtimeMs === leftInfo.mtimeMs && afterRight.size === rightInfo.size && afterRight.mtimeMs === rightInfo.mtimeMs;
  } finally { await Promise.all([leftHandle.close(), rightHandle.close()]); }
}

async function readSourceFile(file, info, options, reportRead) {
  if (!info.isFile() || info.size > options.maxFileBytes) return readDisk(file, options);
  let handle;
  try {
    handle = await open(file, 'r');
    const chunks = []; let position = 0;
    while (position < info.size) {
      const size = Math.min(64 * 1024, info.size - position); const chunk = Buffer.allocUnsafe(size);
      const { bytesRead } = await handle.read(chunk, 0, size, position);
      if (!bytesRead) break;
      chunks.push(chunk.subarray(0, bytesRead)); position += bytesRead; reportRead(position / info.size);
    }
    const bytes = Buffer.concat(chunks);
    return { ...decode(bytes), fingerprint: fingerprint(bytes), mode: info.mode, kind: 'file' };
  } catch (error) {
    return { text: null, fingerprint: `error:${error.code}`, error: `Cannot read ${file}: ${error.message}` };
  } finally { await handle?.close(); }
}

export async function readSource(source, options = defaults, reportProgress = () => {}) {
  if (source.kind === 'git') {
    const { readGitSource } = await import('./git.mjs');
    return readGitSource(source, options);
  }
  if (source.kind !== 'file' || typeof source.path !== 'string') throw new Error('Invalid filesystem source');
  const root = path.resolve(source.path);
  const entries = []; let completed = 0; let discovered = 1;
  const report = (phase, terminal = false) => reportProgress({ progress: terminal ? 100 : Math.min(95, Math.floor((completed / Math.max(discovered, 1)) * 95)), phase });
  async function visit(absolute, relative) {
    let info;
    try { info = await lstat(absolute); }
    catch (error) { entries.push({ path: relative, absolute, kind: 'unavailable', error: error.message }); return; }
    if (info.isDirectory()) {
      let children;
      try { children = await readdir(absolute); }
      catch (error) { entries.push({ path: relative, absolute, kind: 'unavailable', error: error.message }); return; }
      discovered += children.length;
      for (const child of children.sort()) {
        if (child === '.git') continue;
        await visit(path.join(absolute, child), relative ? `${relative}/${child}` : child);
      }
    } else {
      const state = await readSourceFile(absolute, info, options, fraction => {
        const progress = Math.min(94, Math.floor(((completed + fraction) / Math.max(discovered, 1)) * 95));
        reportProgress({ progress, phase: 'Reading files' });
      });
      entries.push({ path: relative, absolute, writable: !state.error, ...state });
    }
    completed += 1; report('Loading files');
  }
  const info = await lstat(root);
  reportProgress({ progress: 0, phase: 'Scanning' });
  await visit(root, '');
  report('Ready', true);
  const { attachRevision } = await import('./git.mjs');
  return attachRevision({ source: { ...source, path: root }, directory: info.isDirectory(), entries }, options);
}

export function compareTrees(left, right) {
  if (left.directory !== right.directory) throw new Error('Compare two files or two directories, not a file and a directory');
  const a = new Map(left.entries.map(e => [e.path, e]));
  const b = new Map(right.entries.map(e => [e.path, e]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().map(key => {
    const l = a.get(key); const r = b.get(key);
    return { path: key, left: l, right: r, status: l?.error || r?.error ? 'unavailable' : !l ? 'added' : !r ? 'removed' : l.fingerprint === r.fingerprint ? 'equal' : 'changed' };
  });
}

export async function saveDisk(file, text, expected, format = {}, options = defaults) {
  const before = await readDisk(file, options);
  if (before.error) throw new Error(before.error);
  if (before.fingerprint !== expected) { const error = new Error('File changed externally; review the latest disk contents before saving'); error.external = before; throw error; }
  const raw = text.replaceAll('\n', format.newline ?? '\n');
  const bytes = Buffer.from((format.bom ? '\uFEFF' : '') + raw);
  if (bytes.length > options.maxFileBytes) throw new Error('Save exceeds configured file size limit');
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.diffgufting-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temp, 'wx', before.mode ?? 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    const check = await readDisk(file, options);
    if (check.fingerprint !== expected) { const error = new Error('File changed externally during save; review required'); error.external = check; throw error; }
    await rename(temp, file);
    const after = await readDisk(file, options);
    if (after.fingerprint !== fingerprint(bytes)) { const error = new Error('File changed externally immediately after save'); error.external = after; throw error; }
    return { ...after, before };
  } finally {
    if (handle) await handle.close();
    await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
