import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
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

export async function readGitSource(input, options = defaults) {
  const repo = await rootOf(input.repo, options);
  const selection = relativePath(input.path ?? '');
  const source = { ...input, repo, path: selection };
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
    if (source.ref === '@worktree') state = await readDisk(path.join(repo, record.path), options);
    else if (record.conflict) state = { text: null, error: 'Unmerged index: compare @base, @ours, and @theirs', fingerprint: 'unmerged' };
    else if (record.mode === '160000') state = { text: null, error: 'Submodule: compare its repository explicitly', fingerprint: record.oid };
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
  return { source, directory: !exact, entries };
}

export async function gitLayers(source, base = 'HEAD', options = defaults) {
  const snapshots = [];
  for (const ref of [base, 'HEAD', '@index', '@worktree']) snapshots.push(await readGitSource({ ...source, ref }, options));
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
