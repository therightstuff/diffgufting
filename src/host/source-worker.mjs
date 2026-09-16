import { parentPort, workerData } from 'node:worker_threads';
import { readInventory, readInventorySource, readSource } from './files.mjs';
import { readGitSource } from './git.mjs';

try {
  parentPort.postMessage({ type: 'progress', progress: 0, phase: 'Starting' });
  if (workerData.source.kind === 'file') {
    const inventory = await readInventory(workerData.source.path, workerData.options);
    const size = workerData.options.inventoryBatchSize;
    for (let offset = 0; offset < inventory.entries.length || offset === 0; offset += size) {
      parentPort.postMessage({ type: 'inventory', inventory: { ...inventory, entries: inventory.entries.slice(offset, offset + size), complete: offset + size >= inventory.entries.length } });
    }
  }
  const tree = workerData.source.kind === 'git' ? await readGitSource(workerData.source, workerData.options, true, true) : await readInventorySource(workerData.source, workerData.options) ?? await readSource(workerData.source, workerData.options, update => parentPort.postMessage({ type: 'progress', ...update }));
  parentPort.postMessage({ type: 'result', tree });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error.message });
}
