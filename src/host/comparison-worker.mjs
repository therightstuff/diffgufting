import { parentPort, workerData } from 'node:worker_threads';
import { readSource, compareTrees, verifyFileEquality } from './files.mjs';
import { gitLayers } from './git.mjs';
import { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';
import { BoundedQueue } from './bounded-queue.mjs';

try {
  const { request, options } = workerData;
  const left = workerData.left ?? await readSource(request.left, options);
  const right = workerData.right ?? await readSource(request.right, options);
  const base = request.base ? await readSource(request.base, options) : null;
  if (base && (base.directory || left.directory || right.directory)) throw new Error('Three-way merge requires file sources; select individual files within folders');
  const layers = [];
  for (const side of ['left', 'right']) {
    const source = request[side];
    if (source.kind === 'git' && ['@worktree', '@index'].includes(source.ref)) {
      layers.push(...(await gitLayers(source, request.gitBase ?? 'HEAD', options)).map(layer => ({ ...layer, side })));
    }
  }
  const rows = compareTrees(left, right);
  const queue = new BoundedQueue({ concurrency: options.directoryConcurrency, capacity: options.comparisonQueueSize });
  await Promise.all(rows.map(row => queue.add(async () => {
    if (row.left?.absolute && row.right?.absolute && row.left.kind === 'file' && row.right.kind === 'file') {
      row.byteEqual = await verifyFileEquality(row.left.absolute, row.right.absolute).catch(() => false);
      if (row.byteEqual) row.status = 'equal';
    }
    if (typeof row.left?.text === 'string' && typeof row.right?.text === 'string') row.hunks = Chunk.build(Text.of(row.left.text.split('\n')), Text.of(row.right.text.split('\n')), { timeout: options.operationTimeoutMs }).map(chunk => ({ fromA: chunk.fromA, toA: chunk.endA, fromB: chunk.fromB, toB: chunk.endB }));
  })));
  parentPort.postMessage({ result: { left, right, base, rows, layers } });
} catch (error) { parentPort.postMessage({ error: error.message }); }
