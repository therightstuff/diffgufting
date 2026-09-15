import { parentPort, workerData } from 'node:worker_threads';
import { readSource } from './files.mjs';

try {
  parentPort.postMessage({ type: 'progress', progress: 0, phase: 'Starting' });
  const tree = await readSource(workerData.source, workerData.options, update => parentPort.postMessage({ type: 'progress', ...update }));
  parentPort.postMessage({ type: 'result', tree });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error.message });
}
