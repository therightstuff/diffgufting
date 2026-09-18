import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { decode, fingerprint, readDisk } from './files.mjs';
import { defaults } from '../core/settings.mjs';
const execute = promisify(execFile);

async function git(repo, args, options = defaults) {
  try {
    const { stdout } = await execute('git', ['--no-optional-locks', '-C', repo, ...args], { encoding: 'buffer', maxBuffer: options.maxFileBytes, timeout: options.operationTimeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
    return stdout;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Git is not installed or not on PATH. Install Git for repository comparisons.');
    throw new Error(`Git ${args[0]} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}
function relativePath(value) {
  if (typeof value !== 'string' || value.includes('\0') || value.startsWith('/') || value.split(/[\\/]/).includes('..')) throw new Error('Git path must be relative to the repository and cannot traverse parents');
  return value.replaceAll('\\', '/').replace(/\/$/, '');
}
async function rootOf(repo, options) { return (await git(repo, ['rev-parse', '--show-toplevel'], options)).toString().trim(); }
async function resolveCommit(repo, ref, options) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-') || ref.includes('\0')) throw new Error('Invalid Git revision');
  const value = (await git(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], options)).toString().trim();
  if (!/^[0-9a-f]{40,64}$/.test(value)) throw new Error('Git returned an invalid commit object ID');
  return value;
}
async function isUnborn(repo, options) {
  const ref = (await git(repo, ['symbolic-ref', '-q', 'HEAD'], options)).toString().trim();
  const refs = (await git(repo, ['for-each-ref', '--format=%(refname)', ref], options)).toString().trim();
  return !refs;
}

export async function discoverRepository(selected, options = defaults) {
  const info = await lstat(selected);
  const directory = info.isDirectory() ? selected : path.dirname(selected);
  const repo = await rootOf(directory, options);
  const prefix = (await git(directory, ['rev-parse', '--show-prefix'], options)).toString().trim();
  return { repo, path: `${prefix}${info.isDirectory() ? '' : path.basename(selected)}`.replaceAll('\\', '/') };
}

export async function revisionLabels(repo, id, options = defaults) {
  if (!id) return [];
  const labels = [];
  const records = (await git(repo, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(*objectname)', 'refs/heads', 'refs/tags', 'refs/remotes'], options)).toString().trim().split('\n');
  for (const record of records) {
    const [ref, object, peeled] = record.split('\t');
    if (object === id || peeled === id) labels.push({ name: ref.replace(/^refs\/(heads|tags|remotes)\//, ''), rank: ref.startsWith('refs/heads/') ? 0 : ref.startsWith('refs/tags/') ? 1 : 2 });
  }
  return [...new Set(labels.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map(label => label.name))];
}

export async function openHistory(repo, { pageSize = 100, options = defaults } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('History page size must be between 1 and 100');
  const root = await rootOf(repo, options);
  const refRecords = (await git(root, ['for-each-ref', '--format=%(objectname)%09%(*objectname)%09%(refname:short)', 'refs/heads', 'refs/remotes', 'refs/tags'], options)).toString().trim().split('\n').filter(Boolean);
  const labels = new Map();
  const references = [];
  const refs = refRecords.map(record => {
    const [object, peeled, label] = record.split('\t');
    const id = peeled || object;
    references.push({ id, label });
    if (id && label) labels.set(id, [...(labels.get(id) ?? []), label]);
    return id;
  }).filter(Boolean);
  const head = await git(root, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'], options).then(value => value.toString().trim()).catch(() => null);
  if (head) labels.set(head, [...(labels.get(head) ?? []), 'HEAD']);
  const tips = [...new Set([...refs, head].filter(Boolean))];
  const parseCommit = line => {
    // Git adds a newline after each record terminator; it is framing, not part of the next hash.
    const [id, parents, author, timestamp, subject, ...messageParts] = line.split('\x1f');
    if (!/^[0-9a-f]{40,64}$/.test(id)) throw new Error('Git history returned an invalid commit object ID');
    const message = messageParts.join('\x1f');
    return { id, parents: parents ? parents.split(' ').filter(Boolean) : [], author, timestamp, subject, message, refs: labels.get(id) ?? [] };
  };
  let closed = false;
  let ended = !tips.length; let failure; let remainder = ''; const buffered = []; const waiters = [];
  const wake = () => { while (waiters.length) waiters.shift()(); };
  const child = tips.length ? spawn('git', ['--no-optional-locks', '-C', root, 'log', '--topo-order', '--date=iso-strict', '--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1f%B%x1e', '--end-of-options', ...tips], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } }) : null;
  child?.stdout.setEncoding('utf8');
  child?.stdout.on('data', chunk => {
    remainder += chunk;
    const records = remainder.split('\x1e'); remainder = records.pop();
    for (const record of records) if (record.trim()) buffered.push(parseCommit(record.replace(/^\n+/, '')));
    if (buffered.length >= pageSize * 2) child.stdout.pause();
    wake();
  });
  child?.once('error', error => { failure = error; ended = true; wake(); });
  child?.once('close', code => {
    if (remainder.trim()) {
      try { buffered.push(parseCommit(remainder.replace(/^\n+/, ''))); }
      catch (error) { failure = error; }
    }
    if (code && !closed) failure = new Error(`Git log failed with exit code ${code}`);
    ended = true; wake();
  });
  const readPage = async () => {
    while (!ended && buffered.length < pageSize) {
      child.stdout.resume();
      await new Promise(resolve => waiters.push(resolve));
    }
    if (failure) throw failure;
    const commits = buffered.splice(0, pageSize);
    if (!buffered.length && !ended) {
      child.stdout.resume();
      await new Promise(resolve => waiters.push(resolve));
      if (failure) throw failure;
    }
    return commits;
  };
  const cursorToken = randomUUID(); let expectedCursor = null; let offset = 0;
  return {
    references,
    async page(cursor = null) {
      if (closed) throw new Error('History session is closed');
      if (cursor !== expectedCursor) throw new Error('Invalid history cursor');
      const commits = await readPage(); offset += commits.length;
      expectedCursor = ended && !buffered.length ? null : Buffer.from(`${cursorToken}:${offset}`).toString('base64url');
      return { commits, cursor: expectedCursor, end: expectedCursor === null };
    },
    close() { closed = true; child?.kill(); wake(); },
  };
}

export async function attachRevision(tree, options = defaults) {
  let repository;
  if (tree.source.kind === 'git') repository = { repo: tree.source.repo, path: tree.source.path ?? '' };
  else {
    try { repository = await discoverRepository(tree.source.path, options); }
    catch (error) { tree.repositoryError = error.message; return tree; }
  }
  const source = tree.source;
  const historical = source.kind === 'git' && !source.ref.startsWith('@');
  let id;
  if (historical) id = source.ref;
  else if (Object.hasOwn(source, 'baseCommit')) id = source.baseCommit;
  else {
    try { id = await resolveCommit(repository.repo, 'HEAD', options); }
    catch (error) { if (!await isUnborn(repository.repo, options)) throw error; id = null; }
  }
  tree.repository = repository;
  tree.revision = { id, labels: await revisionLabels(repository.repo, id, options), working: !historical };
  tree.source = { ...source, baseCommit: id };
  let base;
  if (id && !historical && !tree.lazy) base = await readGitSource({ kind: 'git', ...repository, ref: id, directory: tree.directory }, options, false);
  const originals = new Map(base?.entries.map(entry => [entry.repoPath, entry.text]) ?? []);
  for (const entry of tree.entries) {
    entry.repoPath ??= [repository.path, entry.path].filter(Boolean).join('/');
    entry.baseText = historical ? entry.text : originals.get(entry.repoPath) ?? '';
    if (!entry.writable) entry.documentId = JSON.stringify([repository.repo, entry.repoPath, source.ref, id, entry.fingerprint]);
  }
  return tree;
}

export async function readGitSource(input, options = defaults, withRevision = true, lazy = false) {
  const repo = await rootOf(input.repo, options);
  const selection = relativePath(input.path ?? '');
  const source = { ...input, repo, canonicalRepo: repo, path: selection };
  const live = ['@worktree', '@index', '@base', '@ours', '@theirs'].includes(source.ref);
  let records = [];
  if (live) {
    const listing = (await git(repo, ['ls-files', '--stage', '-z'], options)).toString();
    records = listing.split('\0').filter(Boolean).map(line => {
      const tab = line.indexOf('\t'); const [mode, oid, stage] = line.slice(0, tab).split(' ');
      return { mode, oid, stage: Number(stage), path: line.slice(tab + 1) };
    });
    if (source.ref === '@worktree') {
      const untracked = (await git(repo, ['ls-files', '--others', '--exclude-standard', '-z'], options)).toString().split('\0').filter(Boolean);
      records.push(...untracked.map(file => ({ path: file, untracked: true })));
      records = [...new Map(records.map(record => [record.path, record])).values()];
    } else {
      const stage = { '@index': 0, '@base': 1, '@ours': 2, '@theirs': 3 }[source.ref];
      const conflicts = new Set(records.filter(r => r.stage !== 0).map(r => r.path));
      records = records.filter(r => r.stage === stage);
      if (stage === 0) records.push(...[...conflicts].map(file => ({ path: file, conflict: true })));
    }
  } else {
    try { source.ref = await resolveCommit(repo, source.ref, options); }
    catch (error) {
      if (source.ref !== 'HEAD' || !await isUnborn(repo, options)) throw error;
      return { source, directory: !selection, entries: [] };
    }
    const listing = (await git(repo, ['ls-tree', '-rz', '--full-tree', source.ref], options)).toString();
    records = listing.split('\0').filter(Boolean).map(line => {
      const tab = line.indexOf('\t'); const [mode, type, oid] = line.slice(0, tab).split(' ');
      return { mode, type, oid, path: line.slice(tab + 1) };
    });
  }
  const exact = selection && records.some(record => record.path === selection);
  const entries = [];
  for (const record of records) {
    if (selection && record.path !== selection && !record.path.startsWith(`${selection}/`)) continue;
    const key = exact ? '' : selection ? record.path.slice(selection.length + 1) : record.path;
    let state;
    if (lazy && source.ref === '@worktree') {
      const info = await lstat(path.join(repo, record.path)).catch(() => null);
      state = info ? { text: undefined, fingerprint: `metadata:${info.size}:${info.mtimeMs}`, kind: info.isFile() ? 'file' : 'unavailable', lazy: true } : { text: null, fingerprint: 'missing', missing: true };
    }
    else if (source.ref === '@worktree') state = await readDisk(path.join(repo, record.path), options);
    else if (record.conflict) state = { text: null, error: 'Unmerged index: compare @base, @ours, and @theirs', fingerprint: 'unmerged' };
    else if (record.mode === '160000') state = { text: null, error: 'Submodule: compare its repository explicitly', fingerprint: record.oid };
    else if (lazy) state = { text: undefined, fingerprint: record.oid, kind: 'file', lazy: true };
    else {
      const size = Number((await git(repo, ['cat-file', '-s', record.oid], options)).toString());
      if (size > options.maxFileBytes) state = { text: null, error: 'Git blob exceeds configured editing limit', fingerprint: record.oid };
      else {
        const bytes = await git(repo, ['cat-file', 'blob', record.oid], options);
        state = { ...decode(bytes), fingerprint: fingerprint(bytes) };
        if (record.mode === '120000') state = { ...state, text: null, error: 'Symbolic link', kind: 'symlink' };
      }
    }
    if (state.missing) continue;
    entries.push({ path: key, repoPath: record.path, absolute: source.ref === '@worktree' ? path.join(repo, record.path) : null, writable: source.ref === '@worktree' && !state.error, untracked: !!record.untracked, ...state });
  }
  if (selection && !exact && !entries.length) entries.push({ path: '', repoPath: selection, writable: false, missing: true, fingerprint: 'missing', error: `Path is absent at ${source.ref}` });
  const tree = { source, directory: selection ? (exact ? false : source.directory ?? true) : true, entries, lazy };
  return withRevision ? attachRevision(tree, options) : tree;
}

export async function readGitEntry(source, repoPath, options = defaults) {
  const tree = await readGitSource({ ...source, path: repoPath, directory: false }, options);
  return tree.entries[0] ?? null;
}

export async function gitLayers(source, base = 'HEAD', options = defaults) {
  const snapshots = [];
  for (const ref of [base, 'HEAD', '@index', '@worktree']) snapshots.push(await readGitSource({ ...source, ref }, options, false));
  const categories = ['committed', 'staged', 'unstaged'];
  return categories.map((category, index) => {
    const a = new Map(snapshots[index].entries.map(e => [e.repoPath, e]));
    const b = new Map(snapshots[index + 1].entries.map(e => [e.repoPath, e]));
    const entries = [];
    for (const file of new Set([...a.keys(), ...b.keys()])) {
      const before = a.get(file); const after = b.get(file);
      if (before?.fingerprint === after?.fingerprint) continue;
      entries.push({ path: file, before: before?.text ?? '', after: after?.text ?? '', error: before?.error ?? after?.error, untracked: after?.untracked ?? false });
    }
    return { category, repo: snapshots[index].source.repo, entries };
  });
}
