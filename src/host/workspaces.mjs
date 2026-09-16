import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Session } from './session.mjs';
import { settings } from '../core/settings.mjs';

function sourceIdentity(tree) {
  if (!tree) return null;
  const source = tree.source;
  return [source.kind, path.resolve(source.repo ?? source.path), source.kind === 'git' ? source.path ?? '' : '', source.ref ?? 'working', tree.revision?.id ?? source.baseCommit ?? null];
}
export function comparisonKey(result) {
  return JSON.stringify([sourceIdentity(result.left), sourceIdentity(result.right), sourceIdentity(result.base), result.output?.path ? path.resolve(result.output.path) : null]);
}
export function recentComparisons(recent, entry) {
  return [entry, ...recent.filter(item => item.key !== entry.key)].slice(0, 10);
}
function descriptor(tree) {
  return { ...tree.source, ...(tree.revision ? { baseCommit: tree.revision.id } : {}) };
}
function sourceLabel(tree) {
  const source = tree.source;
  const location = source.kind === 'git' ? path.join(source.repo, source.path ?? '') : source.path;
  const liveLabel = source.kind === 'file' ? 'Working tree' : ({ '@worktree': 'Working tree', '@index': 'Index', '@base': 'Base stage', '@ours': 'Ours stage', '@theirs': 'Theirs stage' })[source.ref];
  const revision = tree.revision?.id?.slice(0, 8) ?? (liveLabel ? '' : source.ref);
  return [location, liveLabel, revision].filter(Boolean).join(' · ');
}

export class Workspaces {
  constructor(options = {}, emit = () => {}, onRecent = () => {}) {
    this.options = settings(options); this.emit = emit; this.onRecent = onRecent;
    this.records = new Map(); this.active = null; this.draft = null;
  }
  snapshot(record = this.active) {
    if (!record) return null;
    return { id: record.id, key: record.key, label: record.label, comparison: record.session.current ?? null,
      sources: Object.fromEntries(['left', 'right'].map(side => [side, record.session.snapshot(record.session.source(side))])) };
  }
  list() { return [...this.records.values()].map(({ id, key, label }) => ({ id, key, label })); }
  openCount() { return this.records.size + (this.draft && !this.records.has(this.draft.id) ? 1 : 0); }
  ensureCapacity() {
    if (this.openCount() >= this.options.openComparisonLimit) {
      throw new Error(`Open comparison limit (${this.options.openComparisonLimit}) reached`);
    }
  }
  publish() { this.emit({ type: 'workspace', workspace: this.snapshot(), comparisons: this.list() }); }
  create(request = {}) {
    this.ensureCapacity();
    const record = { id: randomUUID(), session: new Session(structuredClone(request), this.options) };
    record.session.subscribe(event => {
      if (event.type === 'comparison') {
        if (record.backgroundOpen) return;
        const chosen = this.register(record);
        if (chosen !== record) return;
      }
      this.emit({ ...event, workspaceId: record.id });
    });
    return record;
  }
  remember(record) {
    if (!record.key) return;
    const result = record.session.current;
    this.onRecent({ key: record.key, label: record.label, request: {
      left: descriptor(result.left), right: descriptor(result.right),
      ...(result.base ? { base: descriptor(result.base) } : {}),
      ...(result.output ? { output: result.output.path } : {}),
      ...(record.session.request.gitBase ? { gitBase: record.session.request.gitBase } : {}),
    } });
  }
  register(record) {
    const result = record.session.current;
    const key = comparisonKey(result);
    if (record.key === key) return record;
    const existing = [...this.records.values()].find(item => item.key === key);
    if (existing && existing !== record) {
      record.session.close();
      if (this.draft === record) this.draft = null;
      if (this.active === record) this.activate(existing.id);
      return existing;
    }
    record.key = key; record.label = `${sourceLabel(result.left)} ↔ ${sourceLabel(result.right)}`;
    if (result.base) record.session.request.base = descriptor(result.base);
    this.records.set(record.id, record);
    if (this.draft === record) this.draft = null;
    this.remember(record);
    if (this.active === record) this.publish();
    return record;
  }
  activate(id) {
    const record = this.records.get(id);
    if (!record) throw new Error('Comparison is no longer open');
    if (this.draft && this.draft !== record) { this.draft.session.close(); this.draft = null; }
    if (this.active) this.active.session.calculateOnPoll = false;
    this.active = record; record.session.calculateOnPoll = true;
    this.remember(record); this.publish(); return this.snapshot();
  }
  async open(request) {
    if (!request?.left || !request?.right) throw new Error('Choose two comparison sources');
    const record = this.create(request); record.backgroundOpen = true;
    try { await record.session.refresh(); await record.session.start(); }
    catch (error) { record.session.close(); throw error; }
    record.backgroundOpen = false;
    const chosen = this.register(record);
    this.activate(chosen.id);
    return chosen.session.current;
  }
  async ensureDraft() {
    if (this.active && !this.active.key) { const record = this.active; await record.ready; return record; }
    if (this.draft) this.draft.session.close();
    const previous = this.active;
    const record = this.create(previous?.session.request ?? {});
    if (previous) {
      previous.session.calculateOnPoll = false;
      for (const side of ['left', 'right']) {
        const source = previous.session.snapshot(previous.session.source(side));
        Object.assign(record.session.source(side), structuredClone(source));
      }
    }
    this.draft = record; this.active = record; this.publish();
    record.ready = Promise.all(Object.values(record.session.sources).filter(source => source.tree).map(source => record.session.authorize(source.tree))).then(() => record.session.start());
    await record.ready;
    return record;
  }
  async load(side, source) { return (await this.ensureDraft()).session.load(side, source); }
  async selectCommit(side, generation, ref) {
    const current = this.active?.session.source(side);
    if (current?.generation !== generation || !current.repository) throw new Error('The selected source is no longer available for commit selection');
    const source = { kind: 'git', repo: current.repository.repo, path: current.repository.path, directory: current.tree.directory, ref };
    return this.load(side, source);
  }
  owner(file) {
    const records = [...this.records.values(), this.draft].filter(Boolean);
    const record = records.find(record => record.session.documents.has(record.session.aliases.get(path.resolve(file)) ?? path.resolve(file)));
    if (!record) throw new Error('Document is not open in any comparison');
    return record.session;
  }
  read(file) { return this.owner(file).read(file); }
  loadSelected(pathname) { if (!this.active) throw new Error('Comparison is not open'); return this.active.session.loadSelected(pathname); }
  async save(file, text, expected, format) {
    const owner = this.owner(file);
    const saved = await owner.save(file, text, expected, format);
    for (const record of [...this.records.values(), this.draft].filter(Boolean)) {
      const document = record.session.documents.get(owner.aliases.get(path.resolve(file)) ?? path.resolve(file));
      if (document) document.state = saved;
    }
    return saved;
  }
  remove(id) {
    const record = this.records.get(id) ?? (this.draft?.id === id ? this.draft : null);
    if (!record) throw new Error('Comparison is no longer open');
    record.session.close(); this.records.delete(id);
    if (this.draft === record) this.draft = null;
    if (this.active === record) this.active = this.records.values().next().value ?? null;
    if (this.active) this.active.session.calculateOnPoll = true;
    this.publish();
  }
  close() { for (const record of [...this.records.values(), this.draft].filter(Boolean)) record.session.close(); }
}
