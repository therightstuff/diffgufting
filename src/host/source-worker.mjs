import { parentPort, workerData } from 'node:worker_threads';
import { readInventory, readInventorySource, readSource } from './files.mjs';
import { readGitSource } from './git.mjs';
import { realpath } from 'node:fs/promises';

try {
  if (workerData.source.kind === 'file') workerData.source.canonicalPath = await realpath(workerData.source.path);
  else if (workerData.source.kind === 'git') workerData.source.canonicalRepo = await realpath(workerData.source.repo);
  parentPort.postMessage({ type: 'progress', progress: 0, phase: 'Starting' });
  let inventory;
  if (workerData.source.kind === 'file') {
    inventory = await readInventory(workerData.source.path, workerData.options);
    const size = workerData.options.inventoryBatchSize;
    for (let offset = 0; offset < inventory.entries.length || offset === 0; offset += size) {
      parentPort.postMessage({ type: 'inventory', inventory: { ...inventory, offset, entries: inventory.entries.slice(offset, offset + size), complete: offset + size >= inventory.entries.length } });
    }
  }
  const tree = workerData.source.kind === 'git' ? await readGitSource(workerData.source, workerData.options, true, true) : await readInventorySource(workerData.source, workerData.options, inventory) ?? await readSource(workerData.source, workerData.options, update => parentPort.postMessage({ type: 'progress', ...update }));
  parentPort.postMessage({ type: 'result', tree });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error.message });
}
