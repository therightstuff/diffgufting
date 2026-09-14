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

export async function readSource(source, options = defaults) {
  if (source.kind === 'git') {
    const { readGitSource } = await import('./git.mjs');
    return readGitSource(source, options);
  }
  if (source.kind !== 'file' || typeof source.path !== 'string') throw new Error('Invalid filesystem source');
  const root = path.resolve(source.path);
  const entries = [];
  async function visit(absolute, relative) {
    let info;
    try { info = await lstat(absolute); }
    catch (error) { entries.push({ path: relative, absolute, kind: 'unavailable', error: error.message }); return; }
    if (info.isDirectory()) {
      let children;
      try { children = await readdir(absolute); }
      catch (error) { entries.push({ path: relative, absolute, kind: 'unavailable', error: error.message }); return; }
      for (const child of children.sort()) {
        if (child === '.git') continue;
        await visit(path.join(absolute, child), relative ? `${relative}/${child}` : child);
      }
    } else {
      const state = await readDisk(absolute, options);
      entries.push({ path: relative, absolute, writable: !state.error, ...state });
    }
  }
  const info = await lstat(root);
  await visit(root, '');
  return { source: { ...source, path: root }, directory: info.isDirectory(), entries };
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
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.diffgusting-${randomUUID()}`);
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
