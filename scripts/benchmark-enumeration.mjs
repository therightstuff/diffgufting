import { opendir, readdir } from 'node:fs/promises';
import path from 'node:path';

async function collect(root, readChildren) {
  const entries = [];
  async function visit(directory, relative = '') {
    const children = await readChildren(directory);
    for (const child of children.sort()) {
      if (child === '.git') continue;
      const absolute = path.join(directory, child);
      const item = { path: relative ? `${relative}/${child}` : child, absolute };
      entries.push(item);
      const nested = await readChildren(absolute).catch(error => error.code === 'ENOTDIR' ? null : Promise.reject(error));
      if (nested) await visit(absolute, item.path);
    }
  }
  await visit(root);
  return entries;
}

export function enumerateWithReaddir(root) {
  return collect(root, async directory => readdir(directory));
}

export function enumerateWithOpendir(root) {
  return collect(root, async directory => {
    const handle = await opendir(directory);
    try { return (await Array.fromAsync(handle)).map(entry => entry.name); }
    finally { await handle.close().catch(error => { if (error.code !== 'ERR_DIR_CLOSED') throw error; }); }
  });
}

export const enumerationCandidates = Object.freeze({ readdir: enumerateWithReaddir, opendir: enumerateWithOpendir });
