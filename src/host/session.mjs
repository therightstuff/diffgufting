import { Worker } from 'node:worker_threads';
import { watch } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';
import { settings } from '../core/settings.mjs';
import { readDisk, saveDisk, verifyFileEquality } from './files.mjs';
import { discoverRepository, openHistory, readGitEntry, revisionLabels } from './git.mjs';
import { ComparisonCache, cacheKey } from './comparison-cache.mjs';

export class Session {
  constructor(request, options = {}) {
    this.request = request;
    this.options = settings(options);
    this.listeners = new Set(); this.documents = new Map(); this.writes = new Map(); this.aliases = new Map();
    this.watchers = []; this.generation = 0; this.historyGeneration = 0; this.closed = false;
    this.cache = new ComparisonCache(this.options.comparisonCacheBytes);
    this.sources = Object.fromEntries(['left', 'right'].map(side => [side, {
      descriptor: request[side] ?? null, generation: 0, status: request[side] ? 'idle' : 'empty', progress: null, tree: null, error: null,
    }]));
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event) { if (!this.closed) for (const listener of this.listeners) listener(event); }
  async allow(file) {
    let canonical;
    try { canonical = await realpath(file); } catch (error) { if (error.code !== 'ENOENT') throw error; canonical = path.resolve(file); }
    this.aliases.set(path.resolve(file), canonical);
    if (!this.documents.has(canonical)) {
      const state = await readDisk(canonical, this.options);
      this.documents.set(canonical, { state, publishedFingerprint: state.fingerprint, publishedError: state.error });
    }
    return canonical;
  }
  source(side) {
    if (!['left', 'right'].includes(side)) throw new Error('Source side must be left or right');
    return this.sources[side];
  }
  async authorize(tree) {
    for (const entry of tree.entries) if (entry.absolute && entry.writable && !entry.lazy) entry.absolute = await this.allow(entry.absolute);
  }
  async load(side, descriptor) {
    if (this.closed) throw new Error('Session closed');
    if (!descriptor || typeof descriptor !== 'object') throw new Error('Invalid source descriptor');
    const source = this.source(side); const generation = ++source.generation;
    source.cancel?.(); source.worker?.terminate();
    this.current = null;
    Object.assign(source, { descriptor, repository: null, inventory: null, status: 'loading', progress: { progress: 0, phase: 'Starting' }, tree: null, error: null, lastProgressEvent: 0 });
    this.request[side] = descriptor;
    this.emit({ type: 'source', side, generation, source: this.snapshot(source) });
    const worker = new Worker(new URL('./source-worker.mjs', import.meta.url), { workerData: { source: descriptor, options: this.options } });
    source.worker = worker;
    try {
      const tree = await new Promise((resolve, reject) => {
        source.cancel = () => {
          if (source.inventory) this.emit({ type: 'source-inventory', side, generation, inventory: { ...source.inventory, offset: source.inventory.entries.length, entries: [], canceled: true, complete: true } });
          reject(new Error('Source loading canceled'));
        };
        worker.on('message', message => {
          if (message.type === 'progress') {
            if (source.generation !== generation) return;
            const progress = Math.max(source.progress?.progress ?? 0, Math.min(99, message.progress));
            source.progress = { progress, phase: message.phase };
            const now = Date.now();
            if (message.progress === 0 || message.progress === 100 || now - source.lastProgressEvent >= 100) {
              source.lastProgressEvent = now;
              this.emit({ type: 'source-progress', side, generation, progress: source.progress });
            }
          } else if (message.type === 'inventory') {
            if (source.generation === generation) {
              const entries = source.inventory?.entries ?? [];
              entries.push(...message.inventory.entries);
              source.inventory = { ...message.inventory, entries };
              // The worker already sorted these disjoint batches. Re-sending or caching
              // each growing prefix makes main-thread serialization quadratic.
              this.emit({ type: 'source-inventory', side, generation, inventory: message.inventory });
            }
          } else if (message.type === 'result') resolve(message.tree);
          else if (message.type === 'error') reject(new Error(message.error));
        });
        worker.once('error', reject);
        worker.once('exit', code => { if (code !== 0) reject(new Error(`Source worker exited with ${code}`)); });
      });
      if (this.closed || source.generation !== generation) throw new Error('Source loading canceled');
      if (this.request.comparisonType && (tree.directory ? 'folder' : 'file') !== this.request.comparisonType) throw new Error(`Choose a ${this.request.comparisonType} source for this comparison`);
      await this.authorize(tree);
      if (this.closed || source.generation !== generation) throw new Error('Source loading canceled');
      this.request[side] = tree.source;
      Object.assign(source, { descriptor: tree.source, repository: tree.repository, status: 'ready', tree, progress: { progress: 100, phase: 'Ready' } });
      this.emit({ type: 'source', side, generation, source: this.snapshot(source) });
      if (descriptor.kind === 'file') this.discover(side, generation, descriptor.path);
      if (this.sources.left.status === 'ready' && this.sources.right.status === 'ready') {
        try { await this.calculate(); this.comparisonError = null; }
        catch (error) {
          if (!/file and a directory/i.test(error.message)) throw error;
          this.comparisonError = error.message;
          this.emit({ type: 'comparison-error', error: error.message, generations: { left: this.sources.left.generation, right: this.sources.right.generation } });
        }
      }
      return this.snapshot(source);
    } catch (error) {
      if (this.closed || source.generation !== generation) throw new Error('Source loading canceled');
      Object.assign(source, { status: 'error', error: error.message, progress: null });
      this.emit({ type: 'source', side, generation, source: this.snapshot(source) });
      throw error;
    } finally {
      if (source.worker === worker) { source.worker = null; source.cancel = null; }
      await worker.terminate().catch(() => {});
    }
  }
  async discover(side, generation, selectedPath) {
    try {
      const repository = await discoverRepository(selectedPath, this.options);
      const source = this.source(side);
      if (this.closed || source.generation !== generation) return;
      source.repository = repository;
      this.emit({ type: 'source-repository', side, generation, repository });
    } catch (error) {
      const source = this.source(side);
      if (!this.closed && source.generation === generation) this.emit({ type: 'source-repository-unavailable', side, generation, error: error.message });
    }
  }
  async selectCommit(side, generation, ref) {
    const source = this.source(side);
    if (source.generation !== generation || !source.repository) throw new Error('The selected source is no longer available for commit selection');
    return this.load(side, { kind: 'git', repo: source.repository.repo, ref, path: source.repository.path, directory: source.tree?.directory ?? false });
  }
  async openHistory(side, generation) {
    const source = this.source(side);
    if (source.generation !== generation || !source.repository) throw new Error('The selected source has no available repository history');
    const history = await openHistory(source.repository.repo, { options: this.options });
    if (this.closed || source.generation !== generation) { history.close(); throw new Error('The selected source is no longer available'); }
    const id = `${side}:${generation}:${++this.historyGeneration}:${randomUUID()}`;
    this.histories ??= new Map(); this.histories.set(id, history);
    return { id, repository: source.repository, references: history.references };
  }
  async historyPage(id, cursor) {
    const history = this.histories?.get(id);
    if (!history) throw new Error('History session is not available');
    return history.page(cursor);
  }
  closeHistory(id) {
    const history = this.histories?.get(id); history?.close(); this.histories?.delete(id);
  }
  snapshot(source) {
    return { descriptor: source.descriptor, generation: source.generation, status: source.status, progress: source.progress, tree: source.tree, error: source.error, repository: source.repository };
  }
  async calculate() {
    if (this.closed) throw new Error('Session closed');
    const pair = [this.sources.left.generation, this.sources.right.generation];
    const generation = ++this.generation;
    const resultKey = cacheKey('pair-result', 1, pair, this.request.base ?? null);
    const cached = this.cache.get(resultKey);
    if (cached) return this.acceptComparison(structuredClone(cached));
    if (this.worker) { this.cancelWorker?.(); await this.worker.terminate(); }
    const worker = new Worker(new URL('./comparison-worker.mjs', import.meta.url), { workerData: { request: this.request, left: this.sources.left.tree, right: this.sources.right.tree, options: this.options } });
    this.worker = worker;
    const result = await new Promise((resolve, reject) => {
      this.cancelWorker = () => reject(new Error('Comparison canceled'));
      worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Comparison worker exited with ${code}`)); });
    }).finally(() => { if (this.worker === worker) { this.worker = null; this.cancelWorker = null; } });
    if (this.closed || generation !== this.generation || pair.some((value, index) => value !== this.sources[['left', 'right'][index]].generation)) throw new Error('Comparison canceled');
    this.cache.set(resultKey, result);
    for (const row of result.rows) {
      for (const side of ['left', 'right']) {
        const entry = row[side];
        if (entry?.fingerprint) this.cache.set(cacheKey('fingerprint', 1, side, entry.absolute ?? entry.path, entry.fingerprint), entry.fingerprint);
      }
      if (row.hunks) this.cache.set(cacheKey('hunks', 1, row.path, row.left?.fingerprint, row.right?.fingerprint), row.hunks);
    }
    return this.acceptComparison(result);
  }
  async acceptComparison(result) {
    // Authorize missing counterparts only within a selected filesystem directory.
    for (const row of result.rows) for (const side of ['left', 'right']) {
      if (!row[side] && result[side].source.kind === 'file' && result[side].directory) {
        const destination = path.resolve(result[side].source.path, row.path);
        const parent = await realpath(path.dirname(destination)).catch(() => null);
        const root = await realpath(result[side].source.path);
        if (parent && (parent === root || parent.startsWith(root + path.sep))) {
          const absolute = await this.allow(destination);
          row[side] = { path: row.path, absolute, writable: true, text: '', fingerprint: 'missing', missing: true };
        }
      }
    }
    if (this.request.output) result.output = { path: await this.allow(this.request.output), state: await readDisk(this.request.output, this.options) };
    result.generations = Object.fromEntries(['left', 'right'].map(side => [side, this.source(side).generation]));
    this.current = result;
    this.emit({ type: 'comparison', result });
    return result;
  }
  async refresh() {
    if (this.closed) throw new Error('Session closed');
    if (!this.request.left || !this.request.right) throw new Error('Choose two comparison sources');
    const loads = await Promise.allSettled(['left', 'right'].map(side => this.load(side, this.request[side])));
    const failure = loads.find(result => result.status === 'rejected' && !/Source loading canceled/.test(result.reason.message)) ?? loads.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (!this.current) return this.calculate();
    return this.current;
  }
  async read(file) {
    file = this.aliases.get(path.resolve(file)) ?? file;
    if (!this.documents.has(file)) throw new Error('Document is not open in this session');
    const state = await readDisk(file, this.options);
    this.documents.get(file).state = state;
    return state;
  }
  async loadSelected(pathname) {
    if (this.closed) throw new Error('Comparison is not available');
    const ready = Object.entries(this.sources).filter(([, source]) => source.status === 'ready');
    const row = ready.length === 1 ? { path: pathname, [ready[0][0]]: ready[0][1].tree.entries.find(entry => entry.path === pathname), status: 'loaded' } : this.current?.rows.find(row => row.path === pathname);
    if (!row) throw new Error('Selected file is no longer available');
    const generations = Object.fromEntries(['left', 'right'].map(side => [side, this.source(side).generation]));
    for (const side of ['left', 'right']) {
      const entry = row[side]; const source = this.source(side);
      if (source.descriptor?.kind === 'git' && entry?.repoPath) {
        const loaded = await readGitEntry(source.descriptor, entry.repoPath, this.options);
        if (source.generation !== generations[side] || this.closed) throw new Error('Selected file loading canceled');
        Object.assign(entry, loaded, { lazy: false });
        this.cache.set(cacheKey('selected-text', 1, side, pathname, entry.fingerprint), entry.text ?? '');
        continue;
      }
      if (!entry?.absolute || source.descriptor?.kind !== 'file') continue;
      const state = await readDisk(entry.absolute, this.options);
      if (source.generation !== generations[side] || this.closed) throw new Error('Selected file loading canceled');
      const absolute = entry.writable && !state.error ? await this.allow(entry.absolute) : entry.absolute;
      Object.assign(entry, state, { absolute, writable: entry.writable && !state.error, lazy: false });
      this.cache.set(cacheKey('selected-text', 1, side, pathname, state.fingerprint), state.text ?? '');
    }
    if (typeof row.left?.text === 'string' && typeof row.right?.text === 'string') {
      row.hunks = Chunk.build(Text.of(row.left.text.split('\n')), Text.of(row.right.text.split('\n')), { timeout: this.options.operationTimeoutMs }).map(chunk => ({ fromA: chunk.fromA, toA: chunk.endA, fromB: chunk.fromB, toB: chunk.endB }));
      this.cache.set(cacheKey('selected-hunks', 1, pathname, row.left.fingerprint, row.right.fingerprint), row.hunks);
    }
    this.emit({ type: 'selected-entry', path: pathname, row });
    return row;
  }
  async save(file, text, expected, format) {
    file = this.aliases.get(path.resolve(file)) ?? file;
    if (!this.documents.has(file)) throw new Error('Document is not open in this session');
    if (typeof text !== 'string' || typeof expected !== 'string') throw new Error('Invalid save request');
    const previous = this.writes.get(file) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const saved = await saveDisk(file, text, expected, format, this.options);
      const document = this.documents.get(file);
      document.state = saved;
      document.publishedFingerprint = saved.fingerprint;
      document.publishedError = saved.error;
      return saved;
    });
    this.writes.set(file, next);
    try { return await next; }
    finally { if (this.writes.get(file) === next) this.writes.delete(file); }
  }
  invalidatePath(file) {
    const target = path.resolve(file);
    this.cache.deleteWhere(key => key.includes(target) || key.includes('pair-result'));
  }
  async reconcileEntry(pathname) {
    const row = this.current?.rows.find(item => item.path === pathname);
    if (!row) return false;
    for (const side of ['left', 'right']) {
      const sourceEntry = this.sources[side].tree?.entries.find(entry => entry.path === pathname);
      row[side] = sourceEntry;
    }
    const { left, right } = row;
    row.hunks = undefined;
    if (left?.error || right?.error) row.status = 'unavailable';
    else if (!left) row.status = 'added';
    else if (!right) row.status = 'removed';
    else if (left.kind !== right.kind) row.status = 'conflict';
    else if (left.kind !== 'file') row.status = left.fingerprint === right.fingerprint ? 'equal' : 'changed';
    else if (left.absolute && right.absolute) row.status = await verifyFileEquality(left.absolute, right.absolute).then(equal => equal ? 'equal' : 'changed').catch(() => 'unavailable');
    else row.status = left.fingerprint === right.fingerprint ? 'equal' : 'changed';
    this.cache.deleteWhere(key => key.includes(pathname) && (key.includes('selected') || key.includes('hunks') || key.includes('pair-result')));
    this.emit({ type: 'comparison', result: this.current, scoped: true, path: pathname });
    return true;
  }
  async reconcilePath(file, eventType = 'change') {
    if (this.closed) return;
    const target = path.resolve(file);
    const affected = []; let topologyChanged = false; const paths = new Set();
    for (const [side, source] of Object.entries(this.sources)) {
      if (source.status !== 'ready' || source.descriptor?.kind !== 'file') continue;
      const root = path.resolve(source.descriptor.path);
      const rootInfo = await lstat(root).catch(() => null);
      const contains = rootInfo?.isDirectory() ? target === root || target.startsWith(root + path.sep) : target === root;
      if (!contains) continue;
      const relative = rootInfo?.isDirectory() ? path.relative(root, target).split(path.sep).join('/') : '';
      const entry = source.tree.entries.find(item => item.absolute && path.resolve(item.absolute) === target || item.path === relative);
      if (!entry || rootInfo?.isDirectory() && target === root) {
        await this.load(side, source.descriptor);
        return;
      }
      const state = await readDisk(target, this.options);
      if (state.missing) {
        source.tree.entries.splice(source.tree.entries.indexOf(entry), 1);
        affected.push(side); topologyChanged = true;
        continue;
      }
      const canonical = this.aliases.get(target) ?? target;
      Object.assign(entry, state, { path: entry.path, absolute: canonical, writable: !state.error });
      const document = this.documents.get(canonical);
      const changed = !document || document.publishedFingerprint !== state.fingerprint || document.publishedError !== state.error;
      if (document) {
        document.state = state;
        document.publishedFingerprint = state.fingerprint;
        document.publishedError = state.error;
      }
      if (changed) this.emit({ type: 'disk', path: canonical, state });
      affected.push(side); paths.add(relative);
    }
    if (!affected.length) return;
    this.invalidatePath(target);
    this.emit({ type: 'source-invalidated', path: target, eventType, sides: affected });
    if (this.sources.left.status !== 'ready' || this.sources.right.status !== 'ready') return;
    if (topologyChanged) await this.calculate();
    else for (const pathname of paths) await this.reconcileEntry(pathname);
  }
  async poll() {
    if (this.closed || this.polling) return;
    this.polling = true;
    try {
      for (const [file, document] of this.documents) {
        if (this.writes.has(file)) continue;
        const state = await readDisk(file, this.options);
        if (state.fingerprint !== document.publishedFingerprint || state.error !== document.publishedError) {
          document.state = state;
          document.publishedFingerprint = state.fingerprint;
          document.publishedError = state.error;
          this.emit({ type: 'disk', path: file, state });
        }
      }
      if (this.calculateOnPoll !== false) for (const [side, source] of Object.entries(this.sources)) if (source.status === 'ready' && source.tree?.revision) {
        const tree = source.tree;
        const labels = await revisionLabels(tree.repository.repo, tree.revision.id, this.options);
        if (tree === source.tree && JSON.stringify(labels) !== JSON.stringify(tree.revision.labels)) {
          tree.revision.labels = labels;
          this.emit({ type: 'source-labels', side, generation: source.generation, labels });
        }
      }
      if (this.watchUnavailable && this.calculateOnPoll !== false && !this.worker) await this.refresh();
    } catch (error) { this.emit({ type: 'error', message: error.message }); }
    finally { this.polling = false; }
  }
  async start() {
    if (this.closed) return;
    this.timer ??= setInterval(() => this.poll(), this.options.reconcileMs);
    this.watchedRoots ??= new Set();
    const roots = new Set();
    for (const source of [this.sources.left.descriptor, this.sources.right.descriptor, this.request.base].filter(Boolean)) {
      if (source.kind === 'git') roots.add(path.resolve(source.repo));
      else { const absolute = path.resolve(source.path); roots.add((await lstat(absolute)).isDirectory() ? absolute : path.dirname(absolute)); }
    }
    for (const root of roots) {
      if (this.watchedRoots.has(root)) continue;
      try {
        const watcher = watch(root, { recursive: true }, (eventType, filename) => {
          this.invalidatedPaths ??= new Map();
          this.invalidatedPaths.set(filename ? path.join(root, filename) : root, eventType);
          clearTimeout(this.debounce);
          this.debounce = setTimeout(() => {
            const changes = [...(this.invalidatedPaths ?? new Map())]; this.invalidatedPaths?.clear();
            Promise.all(changes.map(([changedPath, changedType]) => this.reconcilePath(changedPath, changedType))).catch(error => this.emit({ type: 'error', message: error.message }));
          }, this.options.watchDebounceMs);
        });
        watcher.on('error', error => { this.watchUnavailable = true; this.emit({ type: 'error', message: `Watching ${root}: ${error.message}. Periodic reconciliation remains active.` }); });
        this.watchers.push(watcher);
        this.watchedRoots.add(root);
      } catch (error) { this.watchUnavailable = true; this.emit({ type: 'error', message: `Watching ${root}: ${error.message}. Periodic reconciliation remains active.` }); }
    }
  }
  close() {
    this.closed = true; clearInterval(this.timer); clearTimeout(this.debounce);
    for (const watcher of this.watchers) watcher.close();
    this.cancelWorker?.(); this.worker?.terminate();
    for (const source of Object.values(this.sources)) { source.cancel?.(); source.worker?.terminate(); }
    for (const history of this.histories?.values() ?? []) history.close();
    this.cache.clear();
    this.listeners.clear(); this.documents.clear();
  }
}
