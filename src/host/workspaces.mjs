import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { Session } from './session.mjs';
import { settings } from '../core/settings.mjs';

function sourceIdentity(tree) {
  if (!tree) return null;
  const source = tree.source;
  return [source.kind, path.resolve(source.canonicalRepo ?? source.canonicalPath ?? source.repo ?? source.path), source.kind === 'git' ? source.path ?? '' : '', source.ref ?? 'working', tree.revision?.id ?? source.baseCommit ?? null];
}

function sourceLocation(tree) {
  if (!tree) return null;
  const source = tree.source;
  return [path.resolve(source.kind === 'git' ? path.join(source.canonicalRepo ?? source.repo, source.path ?? '') : source.canonicalPath ?? source.path), tree.repository?.repo ?? source.canonicalRepo ?? source.repo ?? null];
}

export function groupKey(result) {
  return JSON.stringify([
    sourceLocation(result.left),
    sourceLocation(result.right),
    Boolean(result.left?.directory ?? result.right?.directory),
    result.base ? sourceLocation(result.base) : null,
    result.output?.path ? path.resolve(result.output.path) : null,
  ]);
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
    this.records = new Map(); this.drafts = new Map(); this.groups = new Map(); this.active = null; this.draft = null;
  }
  snapshot(record = this.active) {
    if (!record) return null;
    return { id: record.id, key: record.key, label: record.label, type: record.type ?? 'file', group: record.group, comparison: record.session.current ?? null,
      sources: Object.fromEntries(['left', 'right'].map(side => [side, record.session.snapshot(record.session.source(side))])) };
  }
  list() {
    return [...this.records.values(), ...this.drafts.values()].map(({ id, key, label, group }) => ({
      id, key, label, group, active: id === this.active?.id,
    }));
  }
  groupList() {
    return [...this.groups.values()].map(group => ({
      key: group.key,
      current: group.visits[group.cursor] ?? group.members[0],
      members: group.members.map(id => this.records.get(id)).filter(Boolean).map(({ id, label }) => ({ id, label })),
      cursor: group.cursor,
      canBack: group.cursor > 0, canForward: group.cursor < group.visits.length - 1,
    })).concat([...this.drafts.values()].map(record => ({
      key: record.id, current: record.id, members: [{ id: record.id, label: record.label }],
      cursor: 0, canBack: false, canForward: false,
    })));
  }
  publish() { this.emit({ type: 'workspace', workspace: this.snapshot(), comparisons: this.list(), groups: this.groupList() }); }
  updateDraft(record) {
    const sources = Object.values(record.session.sources).filter(source => source.descriptor);
    if (!sources.length) return false;
    record.label = sources.map(source => sourceLabel(source.tree ?? { source: source.descriptor })).join(' ↔ ');
    this.drafts.set(record.id, record);
    return true;
  }
  retainDraft() {
    const record = this.draft;
    if (!record) return;
    // A loaded preview owns editable buffers even before explicit submission.
    if (!this.updateDraft(record)) { this.drafts.delete(record.id); record.session.close(); }
    record.session.calculateOnPoll = false;
    this.draft = null;
  }
  create(request = {}) {
    const record = { id: randomUUID(), session: new Session(structuredClone(request), this.options) };
    record.session.subscribe(event => {
      if (event.type === 'comparison') {
        if (record.backgroundOpen) return;
      }
      this.emit({ ...event, workspaceId: record.id });
      if (event.type === 'source' && !record.key && !record.backgroundOpen && (record === this.draft || this.drafts.has(record.id))) {
        this.updateDraft(record); this.publish();
      }
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
  register(record, originGroup) {
    const result = record.session.current;
    const key = comparisonKey(result);
    if (record.key === key) return record;
    // Replacements belong to their invoking group, even if another group contains the same pair.
    const existing = [...this.records.values()].find(item => item.key === key && (!originGroup || item.group === originGroup));
    if (existing && existing !== record) {
      this.discardPending(record);
      this.drafts.delete(record.id);
      record.session.close();
      if (this.draft === record) this.draft = null;
      if (this.active === record) this.activate(existing.id);
      return existing;
    }
    if (this.records.size >= this.options.openComparisonLimit) throw new Error(`Open comparison limit (${this.options.openComparisonLimit}) reached`);
    record.type = result.left.directory ? 'folder' : 'file';
    record.session.request.comparisonType = record.type;
    record.key = key; record.label = `${sourceLabel(result.left)} ↔ ${sourceLabel(result.right)}`;
    record.group = originGroup ?? groupKey(result);
    if (result.base) record.session.request.base = descriptor(result.base);
    this.records.set(record.id, record);
    this.drafts.delete(record.id);
    const group = this.groups.get(record.group) ?? { key: record.group, members: [], visits: [], cursor: -1 };
    if (!group.members.includes(record.id)) group.members.push(record.id);
    this.groups.set(record.group, group);
    if (this.draft === record) this.draft = null;
    this.remember(record);
    if (this.active === record) this.publish();
    return record;
  }
  activate(id, visit = true) {
    const record = this.records.get(id) ?? this.drafts.get(id);
    if (!record) throw new Error('Comparison is no longer open');
    this.openGeneration = (this.openGeneration ?? 0) + 1;
    if (this.draft && this.draft !== record) this.retainDraft();
    this.draft = record.key ? null : record;
    if (this.active) this.active.session.calculateOnPoll = false;
    this.active = record; record.session.calculateOnPoll = true;
    const group = this.groups.get(record.group);
    if (visit && group) {
      if (group.visits[group.cursor] !== id) {
        group.visits.splice(group.cursor + 1);
        group.visits.push(id);
        group.cursor = group.visits.length - 1;
      }
    }
    this.remember(record); this.publish(); return this.snapshot();
  }
  beginReplacement(record, groupKey) {
    if (this.records.size >= this.options.openComparisonLimit) throw new Error(`Open comparison limit (${this.options.openComparisonLimit}) reached`);
    const prior = this.active;
    record.type = prior.type; record.group = groupKey; record.pending = true;
    record.session.request.comparisonType = record.type;
    record.label = `${sourceLabel({ source: record.session.request.left })} ↔ ${sourceLabel({ source: record.session.request.right })}`;
    this.records.set(record.id, record);
    const group = this.groups.get(groupKey);
    group.members.push(record.id); group.visits.splice(group.cursor + 1); group.visits.push(record.id); group.cursor = group.visits.length - 1;
    prior.session.calculateOnPoll = false; this.active = record; record.session.calculateOnPoll = true;
    this.publish();
  }
  discardPending(record) {
    if (!record.pending) return;
    const group = this.groups.get(record.group);
    group.members = group.members.filter(id => id !== record.id);
    group.visits = group.visits.filter(id => id !== record.id);
    group.cursor = Math.min(group.cursor, group.visits.length - 1);
    this.records.delete(record.id);
    if (this.active === record) this.active = this.records.get(group.visits[group.cursor]) ?? null;
    if (this.active) this.active.session.calculateOnPoll = true;
  }
  async open(request, originGroup) {
    if (!request?.left || !request?.right) throw new Error('Choose two comparison sources');
    const generation = this.openGeneration = (this.openGeneration ?? 0) + 1;
    request = structuredClone(request);
    if (originGroup) request.comparisonType = this.active?.type;
    const record = this.create(request);
    if (originGroup) this.beginReplacement(record, originGroup);
    try {
      for (const side of ['left', 'right', 'base']) if (request[side]) request[side] = await this.canonicalSource(request[side]);
      record.session.request = request; record.backgroundOpen = true;
      await record.session.refresh(); await record.session.start();
      if (generation !== this.openGeneration) throw new Error('Comparison opening canceled');
      const chosen = this.register(record, originGroup);
      record.backgroundOpen = false;
      record.pending = false;
      this.activate(chosen.id);
      return chosen.session.current;
    }
    catch (error) {
      const mismatch = /Choose a (file|folder) source/.exec(error.message);
      const wasPending = record.pending;
      this.discardPending(record); record.session.close(); this.publish();
      if (wasPending && mismatch) throw new Error(`A ${record.type} comparison cannot contain a ${mismatch[1] === 'file' ? 'folder' : 'file'} source`);
      throw error;
    }
  }
  async canonicalSource(source) {
    if (source.kind === 'file') return { ...source, canonicalPath: await realpath(source.path) };
    if (source.kind === 'git') return { ...source, canonicalRepo: await realpath(source.repo) };
    throw new Error('Invalid source kind');
  }
  cancelOpening(session) {
    if (this.active?.session === session) this.openGeneration = (this.openGeneration ?? 0) + 1;
  }
  async newDraft(type = 'file') {
    this.retainDraft();
    if (this.active && !this.active.key) this.active = null;
    const record = await this.ensureDraft();
    record.type = type; record.session.request.comparisonType = type;
    this.publish(); return this.snapshot(record);
  }
  async ensureDraft() {
    if (this.active && !this.active.key) { const record = this.active; await record.ready; return record; }
    this.retainDraft();
    const previous = this.active;
    this.openGeneration = (this.openGeneration ?? 0) + 1;
    const record = this.create(); record.draft = true;
    // New changes the displayed workspace; the previous registered session and group cursor remain retained.
    if (previous) previous.session.calculateOnPoll = false;
    this.draft = record; this.active = record; this.publish();
    record.ready = Promise.all(Object.values(record.session.sources).filter(source => source.tree).map(source => record.session.authorize(source.tree))).then(() => record.session.start());
    await record.ready;
    return record;
  }
  async load(side, source) {
    // Preserve a complete pair before changing its identity, even without explicit submission.
    if (!this.active?.key && this.active?.session.current) await this.submitDraft();
    const origin = this.active;
    if (origin?.key) {
      if (this.active !== origin) throw new Error('Source replacement canceled');
      return this.open({ ...origin.session.request, [side]: source }, origin.group);
    }
    const draft = await this.ensureDraft();
    if (!draft.type) draft.type = source.kind === 'file' && (await stat(source.path)).isDirectory() ? 'folder' : source.directory ? 'folder' : 'file';
    draft.session.request.comparisonType = draft.type;
    const loaded = await draft.session.load(side, source);
    const kind = loaded.tree?.directory ? 'folder' : 'file';
    if (draft.type && draft.type !== kind) throw new Error(`A ${draft.type} comparison cannot contain a ${kind} source`);
    draft.type ??= kind;
    return loaded;
  }
  async setDraftType(type) {
    if (!['file', 'folder'].includes(type)) throw new Error('Comparison type must be file or folder');
    if (this.active?.key) throw new Error('An open comparison has a fixed type');
    const draft = await this.ensureDraft();
    if (draft.type && draft.type !== type) {
      draft.session.close(); this.drafts.delete(draft.id); this.draft = null; this.active = null;
      return this.newDraft(type);
    }
    draft.type = type;
    draft.session.request.comparisonType = type;
    return this.snapshot(draft);
  }
  async submitDraft() {
    if (this.active?.key) return this.active.session.current;
    const record = await this.ensureDraft();
    record.submission ??= this.submitRecord(record).finally(() => { record.submission = null; });
    return record.submission;
  }
  async submitRecord(record) {
    const sources = Object.values(record.session.sources);
    if (!sources.every(source => source.status === 'ready')) throw new Error('Choose two ready comparison sources');
    if (sources[0].tree.directory !== sources[1].tree.directory) throw new Error('A comparison requires two files or two folders');
    if (!record.session.current) throw new Error('Comparison is still loading');
    await record.session.start();
    if (record.session.closed || this.active !== record) throw new Error('Comparison submission canceled');
    const chosen = this.register(record);
    record.draft = false;
    this.activate(chosen.id);
    return chosen.session.current;
  }
  async selectCommit(side, generation, ref, workspaceId = this.active?.id) {
    if (workspaceId !== this.active?.id) throw new Error('The selected comparison is no longer active');
    const current = this.active?.session.source(side);
    if (current?.generation !== generation || !current.repository) throw new Error('The selected source is no longer available for commit selection');
    const source = { kind: 'git', repo: current.repository.repo, path: current.repository.path, directory: current.tree.directory, ref };
    if (this.active?.key) {
      const request = structuredClone(this.active.session.request);
      request[side] = source;
      return this.open(request, this.active.group);
    }
    return this.load(side, source);
  }
  async selectWorking(side, generation, workspaceId = this.active?.id) {
    if (workspaceId !== this.active?.id) throw new Error('The selected comparison is no longer active');
    const current = this.active?.session.source(side);
    if (current?.generation !== generation || !current.repository) throw new Error('The selected source is no longer available for working-version selection');
    const source = { kind: 'file', path: path.join(current.repository.repo, current.repository.path) };
    for (const record of this.records.values()) {
      if (record.group === this.active?.group && record.session.current?.[side]?.source.kind === 'file' && sourceLocation(record.session.current[side])[0] === path.resolve(source.path)
        && JSON.stringify(sourceIdentity(record.session.current[side === 'left' ? 'right' : 'left'])) === JSON.stringify(sourceIdentity(this.active.session.current?.[side === 'left' ? 'right' : 'left']))) return this.activate(record.id);
    }
    if (this.active?.key) {
      const request = structuredClone(this.active.session.request);
      request[side] = source;
      return this.open(request, this.active.group);
    }
    return this.load(side, source);
  }
  owner(file) {
    const records = [...this.records.values(), ...this.drafts.values(), this.draft].filter(Boolean);
    const record = records.find(record => record.session.documents.has(record.session.aliases.get(path.resolve(file)) ?? path.resolve(file)));
    if (!record) throw new Error('Document is not open in any comparison');
    return record.session;
  }
  read(file) { return this.owner(file).read(file); }
  loadSelected(pathname) { if (!this.active) throw new Error('Comparison is not open'); return this.active.session.loadSelected(pathname); }
  async save(file, text, expected, format) {
    const owner = this.owner(file);
    const saved = await owner.save(file, text, expected, format);
    for (const record of new Set([...this.records.values(), ...this.drafts.values(), this.draft].filter(Boolean))) {
      const document = record.session.documents.get(owner.aliases.get(path.resolve(file)) ?? path.resolve(file));
      if (document) document.state = saved;
    }
    return saved;
  }
  back() {
    const group = this.groups.get(this.active?.group);
    if (!group || group.cursor <= 0) return this.snapshot();
    group.cursor -= 1;
    return this.activate(group.visits[group.cursor], false);
  }
  forward() {
    const group = this.groups.get(this.active?.group);
    if (!group || group.cursor >= group.visits.length - 1) return this.snapshot();
    group.cursor += 1;
    return this.activate(group.visits[group.cursor], false);
  }
  remove(id) {
    this.openGeneration = (this.openGeneration ?? 0) + 1;
    const record = this.records.get(id) ?? this.drafts.get(id) ?? (this.draft?.id === id ? this.draft : null);
    if (!record) throw new Error('Comparison is no longer open');
    const group = this.groups.get(record.group);
    if (group) {
      const prior = group.visits.slice(0, group.cursor + 1).filter(member => member !== id);
      group.members = group.members.filter(member => member !== id);
      group.visits = group.visits.filter(member => member !== id);
      group.cursor = prior.length - 1;
      if (group.cursor < 0 && group.visits.length) group.cursor = 0;
      if (!group.members.length) this.groups.delete(group.key);
    }
    record.session.close(); this.records.delete(id); this.drafts.delete(id);
    if (this.draft === record) this.draft = null;
    if (this.active === record) {
      const replacement = group?.visits[group.cursor] ?? group?.members[0];
      this.active = replacement ? this.records.get(replacement) : this.records.values().next().value ?? this.drafts.values().next().value ?? null;
      this.draft = this.active && !this.active.key ? this.active : null;
    }
    if (this.active) this.active.session.calculateOnPoll = true;
    this.publish();
  }
  close() { for (const record of new Set([...this.records.values(), ...this.drafts.values(), this.draft].filter(Boolean))) record.session.close(); }
}
