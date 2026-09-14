import { Worker } from 'node:worker_threads';
import { watch } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { settings } from '../core/settings.mjs';
import { readDisk, saveDisk } from './files.mjs';

export class Session {
  constructor(request, options = {}) {
    this.request = request;
    this.options = settings(options);
    this.listeners = new Set(); this.documents = new Map(); this.writes = new Map(); this.aliases = new Map();
    this.watchers = []; this.generation = 0; this.closed = false;
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event) { if (!this.closed) for (const listener of this.listeners) listener(event); }
  async allow(file) {
    let canonical;
    try { canonical = await realpath(file); } catch (error) { if (error.code !== 'ENOENT') throw error; canonical = path.resolve(file); }
    this.aliases.set(path.resolve(file), canonical);
    if (!this.documents.has(canonical)) this.documents.set(canonical, { state: await readDisk(canonical, this.options) });
    return canonical;
  }
  async refresh() {
    if (this.closed) throw new Error('Session closed');
    const generation = ++this.generation;
    if (this.worker) { this.cancelWorker?.(); await this.worker.terminate(); }
    const worker = new Worker(new URL('./comparison-worker.mjs', import.meta.url), { workerData: { request: this.request, options: this.options } });
    this.worker = worker;
    const result = await new Promise((resolve, reject) => {
      this.cancelWorker = () => reject(new Error('Comparison canceled'));
      worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Comparison worker exited with ${code}`)); });
    }).finally(() => { if (this.worker === worker) { this.worker = null; this.cancelWorker = null; } });
    if (this.closed || generation !== this.generation) throw new Error('Comparison canceled');
    for (const side of ['left', 'right']) {
      for (const entry of result[side].entries) if (entry.absolute && entry.writable) entry.absolute = await this.allow(entry.absolute);
    }
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
    this.current = result;
    this.emit({ type: 'comparison', result });
    return result;
  }
  async read(file) {
    file = this.aliases.get(path.resolve(file)) ?? file;
    if (!this.documents.has(file)) throw new Error('Document is not open in this session');
    const state = await readDisk(file, this.options);
    this.documents.get(file).state = state;
    return state;
  }
  async save(file, text, expected, format) {
    file = this.aliases.get(path.resolve(file)) ?? file;
    if (!this.documents.has(file)) throw new Error('Document is not open in this session');
    if (typeof text !== 'string' || typeof expected !== 'string') throw new Error('Invalid save request');
    const previous = this.writes.get(file) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const saved = await saveDisk(file, text, expected, format, this.options);
      this.documents.get(file).state = saved;
      return saved;
    });
    this.writes.set(file, next);
    try { return await next; }
    finally { if (this.writes.get(file) === next) this.writes.delete(file); }
  }
  async poll() {
    if (this.closed || this.polling) return;
    this.polling = true;
    try {
      for (const [file, document] of this.documents) {
        if (this.writes.has(file)) continue;
        const state = await readDisk(file, this.options);
        if (state.fingerprint !== document.state.fingerprint || state.error !== document.state.error) {
          document.state = state;
          this.emit({ type: 'disk', path: file, state });
        }
      }
      if (!this.worker) await this.refresh();
    } catch (error) { this.emit({ type: 'error', message: error.message }); }
    finally { this.polling = false; }
  }
  async start() {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => this.poll(), this.options.reconcileMs);
    const roots = new Set();
    for (const source of [this.request.left, this.request.right, this.request.base].filter(Boolean)) {
      if (source.kind === 'git') roots.add(path.resolve(source.repo));
      else { const absolute = path.resolve(source.path); roots.add((await lstat(absolute)).isDirectory() ? absolute : path.dirname(absolute)); }
    }
    for (const root of roots) {
      try {
        const watcher = watch(root, { recursive: true }, () => {
          clearTimeout(this.debounce);
          this.debounce = setTimeout(() => this.poll(), this.options.watchDebounceMs);
        });
        watcher.on('error', error => this.emit({ type: 'error', message: `Watching ${root}: ${error.message}. Periodic reconciliation remains active.` }));
        this.watchers.push(watcher);
      } catch (error) { this.emit({ type: 'error', message: `Watching ${root}: ${error.message}. Periodic reconciliation remains active.` }); }
    }
  }
  close() {
    this.closed = true; clearInterval(this.timer); clearTimeout(this.debounce);
    for (const watcher of this.watchers) watcher.close();
    this.cancelWorker?.(); this.worker?.terminate(); this.listeners.clear(); this.documents.clear();
  }
}
