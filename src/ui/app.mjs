import { EditorState, Annotation, ChangeSet, Text, RangeSet } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, gutter, GutterMarker } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { MergeView, unifiedMergeView, diff, Chunk, originalDocChangeEffect, getOriginalDoc } from '@codemirror/merge';
import { Document } from '../core/document.mjs';
import { layerRanges } from '../core/change-layers.mjs';
import { Navigation, fromNavigation } from './navigation.mjs';
import { IncrementalDiffs } from '../core/incremental-diff.mjs';

const $ = selector => document.querySelector(selector);
const host = window.diffgusting;
const fromModel = Annotation.define();
const documents = new Map();
const views = [];
let comparison = null; let selected = null; let active = null; let resultDocument = null;
let preferences; let application; let mergeView; let syncing = false; let review; let closeAction; let navigation; let aboutReturnFocus;
const workspaces = new Map();
let workspaceId = null; let openComparisons = []; let comparisonGroups = []; let workspaceChanging = false;
const sourceState = { left: null, right: null };
const inventories = { left: null, right: null };
const diffResults = new IncrementalDiffs();
let fileListing = []; let fileAnchor = null; let selectingEntry = 0; let fileRenderFrame = null;
const expandedDirectories = new Set(['']);
const browse = { linked: true, locations: { left: null, right: null }, latest: null };
let historyPicker = null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, className) {
  const node = element('button', text, className);
  node.onclick = () => safely(action);
  return node;
}
function notice(message = '') { $('#notice').textContent = message; if (message && $('#review').open) $('#review-message').textContent = message; }
function applyAppearance(state) {
  preferences = state.preferences;
  document.documentElement.dataset.theme = preferences.theme === 'system' ? state.appearance : preferences.theme;
  $('#theme').value = preferences.theme;
}
async function call(method, ...args) {
  const response = await host[method](...args);
  if (!response.ok) { const error = new Error(response.error); error.external = response.external; throw error; }
  return response.value;
}
async function safely(action) {
  try { return await action(); } catch (error) { notice(error.message); }
}
function documentFor(entry, side, key) {
  if (!entry) entry = { text: '', writable: false, fingerprint: 'missing' };
  const id = entry.documentId ?? entry.absolute ?? `${workspaceId ?? 'draft'}:${side}:${key}`;
  let doc = documents.get(id);
  if (!doc) {
    doc = new Document(id, entry.text ?? '', { ...preferences, fingerprint: entry.fingerprint, writable: entry.writable ?? false });
    doc.path = entry.absolute; doc.format = entry.format; doc.error = entry.error; doc.label = entry.absolute ?? `${side}: ${key || 'snapshot'}`;
    if (entry.missing) doc.disk = { ...entry, text: null };
    documents.set(id, doc);
    doc.subscribe(() => queueMicrotask(syncDocuments));
  }
  workspaces.get(workspaceId)?.documents.add(id);
  return doc;
}
function selection(doc, view) {
  doc.selection = { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head, scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft };
}
function editKind(transaction) {
  if (transaction.isUserEvent('input.paste')) return 'paste';
  if (transaction.isUserEvent('delete.cut')) return 'cut';
  if (transaction.isUserEvent('input.compose')) return 'composition';
  if (transaction.isUserEvent('delete.backward')) return 'backspace';
  if (transaction.isUserEvent('delete.forward')) return 'delete-forward';
  let inserted = '';
  transaction.changes.iterChanges((fromA, toA, fromB, toB, text) => { inserted += text.toString(); });
  if (inserted.includes('\n')) return 'enter';
  if (transaction.isUserEvent('input.type') && transaction.startState.selection.main.empty) return 'typing';
  return 'replacement';
}
function revealHistorySelection(doc, target = views.find(entry => entry.doc === doc)?.view) {
  if (!target) return;
  const position = doc.selection.head;
  target.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
}
function runHistory(doc, operation, view) {
  const changed = doc[operation]();
  if (changed) revealHistorySelection(doc, view);
  return changed;
}
class CategoryMarker extends GutterMarker {
  constructor(ranges) { super(); this.ranges = ranges; }
  toDOM() {
    const node = element('span', undefined, 'category-markers');
    for (const range of this.ranges) {
      const mark = button(range.category[0].toUpperCase(), () => inspectVersions(range.layer, range.entry), range.category);
      mark.title = `${range.side} ${range.category}: ${range.repo}`; mark.setAttribute('aria-label', mark.title); node.append(mark);
    }
    return node;
  }
}
function categoryMarkers(doc, view) {
  if (!selected || doc.transient || !comparison) return RangeSet.empty;
  const byLine = new Map();
  for (const side of ['left', 'right']) {
    const source = selected[side];
    if (!source || documentFor(source, side, selected.path).id !== doc.id) continue;
    const ranges = layerRanges(comparison.layers.filter(layer => layer.side === side), source.repoPath ?? selected.path, view.state.doc.toString());
    for (const range of ranges) {
      const start = view.state.doc.lineAt(range.from).number;
      const end = view.state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
      for (let number = start; number <= end; number++) {
        const position = view.state.doc.line(number).from;
        const markers = byLine.get(position) ?? new Map(); markers.set(`${range.side}:${range.category}`, range); byLine.set(position, markers);
      }
    }
  }
  return RangeSet.of([...byLine].sort(([a], [b]) => a - b).map(([position, ranges]) => new CategoryMarker([...ranges.values()]).range(position)));
}
function extensions(doc, extra = []) {
  return [lineNumbers(), gutter({ class: 'git-category-gutter', markers: view => categoryMarkers(doc, view) }), highlightActiveLine(), drawSelection(), highlightSelectionMatches(), EditorState.readOnly.of(!doc.writable), EditorView.editable.of(doc.writable),
    keymap.of([{ key: 'Mod-z', run: view => runHistory(doc, 'undo', view) }, { key: 'Mod-Shift-z', run: view => runHistory(doc, 'redo', view) }, { key: 'Mod-y', run: view => runHistory(doc, 'redo', view) }, { key: 'Mod-s', run: () => { safely(() => save(doc)); return true; } }, ...searchKeymap, ...defaultKeymap]),
    EditorView.domEventHandlers({ focus: () => { if (!doc.transient) { active = doc; updateStatus(); } }, blur: () => doc.closeHistoryGroup() }),
    EditorState.transactionFilter.of(transaction => {
      if (!transaction.docChanged || transaction.annotation(fromModel)) return transaction;
      const main = transaction.newSelection.main;
      const ranges = [];
      transaction.changes.iterChanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }));
      try { doc.replace(transaction.newDoc.toString(), { kind: editKind(transaction), time: performance.now(), ranges, selection: { anchor: main.anchor, head: main.head } }); return transaction; }
      catch (error) { notice(error.message); return []; }
    }),
    EditorView.updateListener.of(update => {
      const propagated = update.transactions.some(transaction => transaction.annotation(fromModel) || transaction.annotation(fromNavigation));
      if (update.selectionSet) {
        if (!update.docChanged && !propagated) doc.closeHistoryGroup();
        selection(doc, update.view);
        if (!doc.transient && !propagated) navigation?.selection(update.view);
      }
    }),
    ...extra];
}
function mountEditor(doc, mount, extra = []) {
  const view = new EditorView({ parent: mount, state: EditorState.create({ doc: doc.text, selection: { anchor: Math.min(doc.selection.anchor, doc.text.length), head: Math.min(doc.selection.head, doc.text.length) }, extensions: extensions(doc, extra) }) });
  view.scrollDOM.scrollTop = doc.selection.scrollTop;
  view.scrollDOM.scrollLeft = doc.selection.scrollLeft ?? 0;
  views.push({ doc, view });
  return view;
}
function title(doc, side) {
  const node = element('div', undefined, 'pane-title'); node.dataset.document = doc.id;
  node.dataset.sourceSide = side;
  const tree = side === 'result' ? comparison?.base : comparison?.[side];
  const entry = side === 'result' || side === 'base' ? tree?.entries[0] : selected?.[side];
  const source = tree?.source;
  const location = side === 'result' ? doc.path : entry?.absolute ?? (source?.kind === 'git' ? `${source.repo}/${entry?.repoPath ?? source.path ?? ''}` : source?.path ?? doc.label);
  const pathLabel = element('strong', undefined, 'name'); pathLabel.title = location;
  const split = Math.max(location.lastIndexOf('/'), location.lastIndexOf('\\')) + 1;
  pathLabel.append(element('span', location.slice(0, split), 'path-directory'), element('span', location.slice(split), 'file-name'));
  node.append(element('span', side.toUpperCase(), 'pane-role'), pathLabel);
  const identity = element('span', undefined, 'source-identity');
  const revision = tree?.revision;
  if (revision) {
    const aliases = workspaces.get(workspaceId)?.aliases;
    const aliasKey = `${side}:${revision.id}`;
    const names = revision.labels;
    const chosen = names.includes(aliases?.[aliasKey]) ? aliases[aliasKey] : names[0] ?? revision.id?.slice(0, 12) ?? 'No commits';
    const label = ['left', 'right'].includes(side)
      ? button(chosen, () => showHistory(side, sourceState[side]?.generation), 'revision-name')
      : element('span', chosen, 'revision-name');
    label.title = revision.id ?? 'Repository has no commits'; identity.append(label);
    node.baseText = entry?.baseText ?? entry?.text ?? '';
    identity.append(element('span', '', 'base-dirty'));
    if (revision.working || side === 'result') identity.append(element('span', side === 'result' ? 'Merge result' : ({ '@index': 'Index', '@base': 'Base stage', '@ours': 'Ours stage', '@theirs': 'Theirs stage' })[source.ref] ?? 'Working tree', 'badge'));
    else identity.append(element('span', 'Snapshot', 'badge'));
  } else identity.append(element('span', side === 'result' ? 'Merge result' : doc.writable ? 'Working file' : 'Snapshot', 'badge'));
  node.append(identity);
  if (!doc.writable) node.append(element('span', 'READ ONLY', 'badge'));
  return node;
}
function pane(doc, side, parent, extra = []) {
  const node = element('section', undefined, 'pane'); node.dataset.side = side;
  node.append(title(doc, side));
  const mount = element('div', undefined, 'editor-mount'); node.append(mount); parent.append(node);
  if (doc.error) mount.append(element('p', doc.error));
  else mountEditor(doc, mount, extra);
  return node;
}
function destroyViews() {
  navigation?.destroy(); navigation = null;
  $('#overview').replaceChildren();
  for (const { doc, view } of views) selection(doc, view);
  if (mergeView) { mergeView.destroy(); mergeView = null; }
  else for (const { view } of views) view.destroy();
  views.length = 0;
}
const layouts = new Map([
  ['side-by-side', (a, b, root) => {
    if (a.error || b.error) { const container = element('div', undefined, 'editors'); root.append(container); pane(a, 'left', container); pane(b, 'right', container); return; }
    mergeView = new MergeView({ parent: root, a: { doc: a.text, extensions: extensions(a) }, b: { doc: b.text, extensions: extensions(b) }, highlightChanges: true, gutter: true });
    for (const [doc, side, view] of [[a, 'left', mergeView.a], [b, 'right', mergeView.b]]) {
      const savedSelection = { ...doc.selection };
      const container = view.dom.parentElement; container.dataset.side = side; container.prepend(title(doc, side));
      view.dispatch({ selection: { anchor: Math.min(savedSelection.anchor, doc.text.length), head: Math.min(savedSelection.head, doc.text.length) } });
      view.scrollDOM.scrollTop = savedSelection.scrollTop; views.push({ doc, view });
      view.scrollDOM.scrollLeft = savedSelection.scrollLeft ?? 0;
    }
  }],
  ['unified', (a, b, root) => {
    const container = element('div', undefined, 'editors'); root.append(container);
    pane(b, 'right', container, [unifiedMergeView({ original: a.text, mergeControls: false, syntaxHighlightDeletions: false })]);
    container.querySelector('.pane').prepend(title(a, 'left'));
    if (!b.error) views.at(-1).original = a;
  }],
  ['merge', (a, b, root) => {
    const container = element('div', undefined, 'merge-layout'); root.append(container);
    const sources = element('div', undefined, 'merge-sources'); container.append(sources);
    const base = comparison?.base?.entries[0];
    if (base) pane(documentFor(base, 'base', ''), 'base', sources);
    pane(a, 'left', sources); pane(b, 'right', sources);
    const result = resultDocument ?? (b.writable ? b : a.writable ? a : null);
    const output = element('div', undefined, 'merge-result'); container.append(output);
    if (result) { pane(result, 'result', output); active = result; }
    else output.append(element('p', 'Use --base and --output to create a writable three-way merge result.'));
  }],
]);
function renderEditors() {
  destroyViews(); $('#content').replaceChildren();
  if (!selected) return;
  if (selected.left?.lazy || selected.right?.lazy) {
    safely(() => selectFile(selected.path));
    $('#content').append(element('p', 'Loading selected file…', 'loading-file'));
    return;
  }
  if (!selected.left || !selected.right) {
    const side = selected.left ? 'left' : 'right';
    const container = element('div', undefined, 'editors'); $('#content').append(container);
    pane(documentFor(selected[side], side, selected.path), side, container);
    syncDocuments(); return;
  }
  const a = documentFor(selected.left, 'left', selected.path); const b = documentFor(selected.right, 'right', selected.path);
  if (!active || ![a, b, resultDocument].includes(active)) active = resultDocument ?? (b.writable ? b : a);
  (layouts.get(preferences.layout) ?? layouts.get('side-by-side'))(a, b, $('#content'));
  navigation = new Navigation(views, $('#overview'), diffResults);
  syncDocuments();
}
function syncDocuments() {
  if (syncing) return;
  syncing = true;
  try {
    for (const { doc, view, original } of views) {
      if (view.state.doc.toString() !== doc.text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc.text }, annotations: fromModel.of(true), selection: { anchor: Math.min(doc.selection.anchor, doc.text.length), head: Math.min(doc.selection.head, doc.text.length) } });
      if (original && getOriginalDoc(view.state).toString() !== original.text) {
        const length = getOriginalDoc(view.state).length;
        view.dispatch({ effects: originalDocChangeEffect(view.state, ChangeSet.of({ from: 0, to: length, insert: original.text }, length)) });
      }
    }
    for (const node of document.querySelectorAll('.pane-title[data-document]')) {
      const doc = documents.get(node.dataset.document); if (!doc) continue;
      node.querySelector('.state-label')?.remove();
      const state = element('span', doc.dirty ? 'UNSAVED' : '', 'state-label unsaved'); node.append(state);
      const circle = node.querySelector('.base-dirty');
      if (circle) { const dirty = doc.text !== node.baseText; circle.textContent = dirty ? '●' : ''; circle.setAttribute('aria-label', dirty ? 'Modified from base commit' : 'Matches base commit'); circle.title = circle.getAttribute('aria-label'); }
      node.querySelector('.review-button')?.remove();
      if (doc.pending.length) node.append(button('Review external change', () => openReview(doc), 'review-button contention'));
    }
    renderDocuments(); renderChanges(); updateStatus();
    navigation?.refresh();
    host.dirty([...documents.values()].some(doc => doc.writable && (doc.dirty || doc.pending.length)));
  } finally { syncing = false; }
}
function stashWorkspace() {
  const record = workspaces.get(workspaceId); if (!record) return;
  for (const { doc, view } of views) selection(doc, view);
  Object.assign(record, { comparison, selectedPath: selected?.path, activeId: active?.id, resultId: resultDocument?.id, layout: preferences.layout,
    positions: new Map(views.map(({ doc }) => [doc.id, { ...doc.selection }])), sources: { ...sourceState }, inventories: { ...inventories }, fileScroll: $('#file-region').scrollTop, filter: $('#filter').value, fileView: $('#file-view').value, expanded: [...expandedDirectories] });
}
function showEmptyWorkspace() {
  const empty = element('div', undefined, 'empty'); const icon = element('img'); icon.src = '../assets/branding/diffgusting-icon.png'; icon.alt = '';
  empty.append(icon, element('h1', 'Every change has a story.'), element('p', 'Choose two files or folders to compare, edit, and merge.'));
  $('#content').replaceChildren(empty);
}
function comparisonDocumentIds(result, id) {
  const ids = new Set();
  for (const row of result?.rows ?? []) for (const side of ['left', 'right']) {
    const entry = row[side]; if (entry) ids.add(entry.documentId ?? entry.absolute ?? `${id}:${side}:${row.path}`);
  }
  for (const entry of result?.base?.entries ?? []) ids.add(entry.documentId ?? entry.absolute ?? `${id}:base:`);
  if (result?.output) ids.add(result.output.path);
  return ids;
}
function releaseUnowned(ids) {
  for (const id of ids) if (![...workspaces.values()].some(record => record.documents.has(id))) documents.delete(id);
}
function acceptWorkspace(next, list = openComparisons, groups = comparisonGroups) {
  openComparisons = list;
  comparisonGroups = groups;
  if (next?.id === workspaceId) {
    const record = workspaces.get(workspaceId); if (record) { record.key = next.key; record.label = next.label; record.type = next.type; }
    if (next.comparison) acceptComparison(next.comparison);
    renderSourceControls();
    renderDocuments(); return;
  }
  stashWorkspace(); workspaceChanging = true; destroyViews();
  const abandoned = new Set();
  for (const [id, record] of workspaces) if (id !== next?.id && !list.some(item => item.id === id)) {
    for (const document of record.documents) abandoned.add(document);
    workspaces.delete(id);
  }
  if ($('#history-dialog').open && !historyPicker?.selecting) $('#history-dialog').close();
  workspaceId = next?.id ?? null; selected = null; active = null; resultDocument = null; comparison = null;
  selectingEntry++; fileListing = []; fileAnchor = null; inventories.left = inventories.right = null;
  if (!next) {
    releaseUnowned(abandoned); sourceState.left = sourceState.right = null;
    for (const side of ['left', 'right']) { $(`#${side}-source`).value = ''; $(`#${side}-source`).dataset.committed = ''; }
    showEmptyWorkspace(); renderFiles(); renderDocuments(); renderSourceControls(); workspaceChanging = false; return;
  }
  let record = workspaces.get(next.id);
  if (!record) { record = { documents: new Set(), aliases: {}, layout: next.comparison?.base ? 'merge' : preferences.layout }; workspaces.set(next.id, record); }
  const nextIds = comparisonDocumentIds(next.comparison, next.id);
  for (const id of abandoned) if (nextIds.has(id)) record.documents.add(id);
  releaseUnowned(abandoned);
  Object.assign(record, { key: next.key, label: next.label, type: next.type });
  Object.assign(inventories, record.inventories);
  $('#filter').value = record.filter ?? ''; $('#file-view').value = record.fileView ?? 'list';
  expandedDirectories.clear(); for (const item of record.expanded ?? ['']) expandedDirectories.add(item);
  Object.assign(sourceState, next.sources);
  for (const side of ['left', 'right']) {
    const descriptor = sourceState[side]?.descriptor;
    const input = $('#' + side + '-source');
    input.value = descriptor?.kind === 'git' ? `${descriptor.repo}/${descriptor.path ?? ''}` : descriptor?.path ?? '';
    input.dataset.committed = input.value;
  }
  preferences.layout = record.layout; $('#layout').value = record.layout;
  for (const [id, position] of record.positions ?? []) if (documents.has(id)) documents.get(id).selection = { ...position };
  comparison = next.comparison ?? record.comparison;
  if (comparison) {
    selected = comparison.rows.find(row => row.path === record.selectedPath) ?? comparison.rows.find(row => row.status !== 'equal') ?? comparison.rows[0];
    resultDocument = documents.get(record.resultId) ?? null;
    if (!resultDocument && comparison.output) {
      resultDocument = documentFor({ ...comparison.output.state, absolute: comparison.output.path, writable: true }, 'result', '');
      if (comparison.output.state.missing && !resultDocument.past.length) resultDocument.replace(comparison.base?.entries[0]?.text ?? '', 'initialize merge result');
    }
    active = documents.get(record.activeId) ?? resultDocument;
    renderEditors(); renderFiles();
  } else { const lone = loneComparison(); if (lone) acceptComparison(lone); else showEmptyWorkspace(); }
  workspaceChanging = false; renderDocuments(); renderSourceControls(); renderFiles();
  $('#file-region').scrollTop = record.fileScroll ?? 0; renderFiles();
}
function renderSourceControls() {
  const record = workspaces.get(workspaceId); const creating = !record?.key;
  document.body.classList.toggle('creating', creating);
  $('#creation-title').hidden = !creating;
  $('#comparison-type').hidden = !creating;
  $('#open-comparison').hidden = !creating;
  $('#link-locations').hidden = false;
  for (const radio of document.querySelectorAll('[name="comparison-type"]')) radio.checked = radio.value === (record?.type ?? 'file');
  for (const side of ['left', 'right']) {
    const source = sourceState[side]; const revision = source?.tree?.revision;
    if (!source || source.status === 'empty') $(`#${side}-progress`).hidden = true;
    $(`#${side}-error`).textContent = source?.error ?? '';
    $(`#${side}-source`).readOnly = false;
    $(`#choose-${side}`).hidden = false;
    const control = $(`#${side}-version`);
    control.hidden = !source?.repository; control.disabled = source?.status !== 'ready';
    control.setAttribute('role', 'combobox'); control.setAttribute('aria-haspopup', 'dialog'); control.setAttribute('aria-controls', 'history-dialog');
    control.setAttribute('aria-expanded', String(historyPicker?.side === side));
    const alias = record?.aliases?.[`${side}:${revision?.id}`];
    control.textContent = revision?.working ? 'Working tree' : (revision?.labels?.includes(alias) ? alias : revision?.labels?.[0]) ?? revision?.id?.slice(0, 12) ?? 'No commits';
    control.title = revision?.id ?? 'Repository has no commits';
  }
  $('#open-comparison').disabled = !['left', 'right'].every(side => sourceState[side]?.status === 'ready' && comparison?.generations?.[side] === sourceState[side]?.generation);
}
function renderDocuments() {
  const nav = $('#documents'); nav.replaceChildren();
  const newEntry = button('New…', () => call('comparisonNew'), `new-comparison${openComparisons.some(item => item.id === workspaceId) ? '' : ' selected'}`);
  nav.append(newEntry);
  const groups = comparisonGroups.length ? comparisonGroups : openComparisons.map(item => ({ key: item.id, current: item.id, members: [item] }));
  for (const group of groups) {
    const item = group.members.find(member => member.id === group.current) ?? group.members[0];
    if (!item) continue;
    const container = element('section', undefined, 'comparison-group');
    const row = element('div', undefined, 'comparison-item'); row.dataset.comparison = item.id;
    const label = item.label.split(' ↔ ').map(side => { const [file, ...revision] = side.split(' · '); return [file.split(/[\\/]/).at(-1), ...revision].join(' · '); }).join(' ↔ ');
    const choose = button(label, () => call('comparisonActivate', item.id), item.id === workspaceId ? 'selected' : '');
    choose.title = item.label; row.append(choose);
      const close = button('×', () => closeComparison(item.id), 'close-comparison'); close.setAttribute('aria-label', 'Close comparison'); row.append(close); container.append(row);
    nav.append(container);
  }
  const group = comparisonGroups.find(item => item.members.some(member => member.id === workspaceId));
  $('#comparison-back').disabled = !group?.canBack; $('#comparison-forward').disabled = !group?.canForward;
}
async function closeComparison(id = workspaceId) {
  const record = workspaces.get(id); if (!record) return;
  const final = [...record.documents].filter(key => ![...workspaces].some(([other, value]) => other !== id && value.documents.has(key))).map(key => documents.get(key)).filter(Boolean);
  if (final.some(doc => doc.dirty || doc.pending.length)) {
    const choice = await askClose(); if (choice === 'cancel') return;
    if (choice === 'save') { for (const doc of final) if (doc.writable && (doc.dirty || doc.pending.length)) await save(doc); if (final.some(doc => doc.dirty || doc.pending.length)) return; }
  }
  await call('comparisonClose', id);
  workspaces.delete(id);
  for (const doc of final) documents.delete(doc.id);
  syncDocuments();
}
async function protectDraft() {
  const record = workspaces.get(workspaceId);
  if (!record || record.key) return true;
  const final = [...record.documents].filter(id => ![...workspaces].some(([other, value]) => other !== workspaceId && value.documents.has(id))).map(id => documents.get(id)).filter(Boolean);
  if (!final.some(doc => doc.dirty || doc.pending.length)) return true;
  const choice = await askClose(); if (choice === 'cancel') return false;
  if (choice === 'save') {
    for (const doc of final) if (doc.writable && (doc.dirty || doc.pending.length)) await save(doc);
    if (final.some(doc => doc.dirty || doc.pending.length)) return false;
  }
  if (choice === 'discard') for (const doc of final) { record.documents.delete(doc.id); documents.delete(doc.id); }
  return true;
}
function updateStatus() {
  $('#status').textContent = active ? `${active.dirty ? 'Unsaved' : 'Saved'} · ${active.past.length} undo steps · ${(active.bytes / 1024).toFixed(1)} KiB history${active.historyTruncated ? ' · OLDEST HISTORY EVICTED' : ''}${active.pending.length ? ` · ${active.pending.length} external version(s) need review` : ''}` : 'Ready';
  $('#save').disabled = !active?.writable; $('#undo').disabled = !active?.past.length; $('#redo').disabled = !active?.future.length;
}
function scheduleFiles() {
  fileRenderFrame ??= requestAnimationFrame(() => { fileRenderFrame = null; renderFiles(); });
}
function renderFiles() {
  if (fileRenderFrame !== null) { cancelAnimationFrame(fileRenderFrame); fileRenderFrame = null; }
  const focusedPath = $('#files').contains(document.activeElement) ? document.activeElement.dataset.path : null;
  $('#files').replaceChildren();
  const rows = comparison?.rows ?? [...new Map(Object.values(inventories).flatMap(inventory => inventory?.entries ?? []).filter(entry => entry.kind !== 'directory').map(entry => [entry.path, { path: entry.path, status: 'pending' }])).values()];
  const discovered = Object.values(inventories).reduce((count, inventory) => count + (inventory?.entries?.filter(entry => entry.kind !== 'directory').length ?? 0), 0);
  const incomplete = Object.values(inventories).some(inventory => inventory && !inventory.complete);
  const canceled = Object.values(inventories).some(inventory => inventory?.canceled);
  const failed = Object.values(sourceState).some(source => source?.status === 'error');
  $('#inventory-progress').textContent = comparison ? `${rows.length} compared` : discovered ? `${discovered} discovered${canceled ? ' · canceled' : failed ? ' · incomplete' : incomplete ? ' · checking…' : ' · ready'}` : canceled ? 'canceled' : failed ? 'incomplete' : '';
  const filter = $('#filter').value.toLowerCase();
  const listing = $('#file-view').value === 'tree' ? treeRows(rows, filter) : rows.filter(row => row.path.toLowerCase().includes(filter));
  const rowHeight = 34;
  const viewport = $('#file-region');
  $('#files').style.height = `${listing.length * rowHeight}px`;
  if (fileAnchor && !workspaceChanging) {
    const index = listing.findIndex(row => row.path === fileAnchor.path);
    if (index >= 0) viewport.scrollTop = index * rowHeight + fileAnchor.offset;
  }
  fileListing = listing;
  const start = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - 12);
  const end = Math.min(listing.length, start + Math.max(60, Math.ceil(viewport.clientHeight / rowHeight) + 24));
  $('#files').style.position = 'relative';
  for (const [index, row] of listing.slice(start, end).entries()) {
    const node = row.directory ? button(`${expandedDirectories.has(row.path) ? '▾' : '▸'} ${row.name}`, () => { if (expandedDirectories.has(row.path)) expandedDirectories.delete(row.path); else expandedDirectories.add(row.path); renderFiles(); }, 'directory') : comparison ? button(row.path || 'Selected file', () => selectFile(row.path), selected?.path === row.path ? 'selected' : '') : button(row.path || 'Selected file', () => {}, 'pending');
    node.dataset.path = row.path;
    node.onkeydown = event => {
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (!step && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? listing.length - 1 : Math.max(0, Math.min(listing.length - 1, start + index + step));
      fileAnchor = null; viewport.scrollTop = target * rowHeight; renderFiles();
      [...$('#files').children].find(child => child.dataset.path === listing[target]?.path)?.focus();
    };
    if (row.directory) { node.setAttribute('aria-expanded', String(expandedDirectories.has(row.path))); node.setAttribute('aria-level', String(row.depth + 1)); }
    else if ($('#file-view').value === 'tree') node.setAttribute('aria-level', String(row.depth + 1));
    if (row.depth) node.style.paddingInlineStart = `${0.7 + row.depth * 1.1}rem`;
    if (!comparison) { node.setAttribute('aria-disabled', 'true'); node.setAttribute('aria-label', `${row.path || 'Selected file'} pending comparison`); }
    node.append(element('span', row.status, 'badge'));
    node.style.position = 'absolute'; node.style.top = `${(start + index) * rowHeight}px`; node.style.left = '0'; node.style.right = '0';
    $('#files').append(node);
    if (row.path === focusedPath) node.focus({ preventScroll: true });
  }
}
async function selectFile(pathname) {
  const token = ++selectingEntry; const owner = workspaceId;
  const row = await call('selectedEntry', pathname);
  if (token !== selectingEntry || owner !== workspaceId) return;
  selected = row; renderEditors(); renderFiles();
}
function treeRows(rows, filter) {
  const nodes = new Map([['', { path: '', name: '.', directory: true, depth: 0 }]]);
  for (const row of rows) {
    const parts = row.path.split('/');
    for (let index = 1; index < parts.length; index++) {
      const path = parts.slice(0, index).join('/');
      if (!nodes.has(path)) nodes.set(path, { path, name: parts[index - 1], directory: true, depth: index });
    }
    nodes.set(row.path, { ...row, name: parts.at(-1) || 'Selected file', depth: parts.length - 1 });
  }
  const matched = new Set([...nodes.values()].filter(node => !node.directory && node.path.toLowerCase().includes(filter)).map(node => node.path));
  for (const path of [...matched]) for (let parent = path; parent.includes('/');) { parent = parent.slice(0, parent.lastIndexOf('/')); matched.add(parent); }
  return [...nodes.values()].filter(node => node.path && (!filter || matched.has(node.path))).sort((a, b) => a.path.localeCompare(b.path)).filter(node => {
    if (!node.path.includes('/')) return true;
    const parent = node.path.slice(0, node.path.lastIndexOf('/'));
    return filter || parent.split('/').every((_, index, parts) => expandedDirectories.has(parts.slice(0, index + 1).join('/')));
  });
}
function loneComparison() {
  const ready = ['left', 'right'].filter(side => sourceState[side]?.status === 'ready');
  if (ready.length !== 1) return null;
  const side = ready[0]; const tree = sourceState[side].tree;
  const blank = { source: { kind: 'none' }, entries: [], directory: tree.directory };
  const result = { left: side === 'left' ? tree : blank, right: side === 'right' ? tree : blank, layers: [], rows: [] };
  for (const entry of tree.entries) result.rows.push({ path: entry.path, [side]: entry, status: 'loaded' });
  return result;
}
function acceptSource(side, source) {
  if (historyPicker?.side === side && historyPicker.generation !== source.generation && !historyPicker.selecting) $('#history-dialog').close();
  sourceState[side] = source;
  if (source.status === 'loading' && source.progress?.progress === 0) inventories[side] = null;
  const ring = $(`#${side}-progress`);
  const progress = source.progress?.progress;
  ring.hidden = source.status !== 'loading' && progress !== 100;
  if (progress !== undefined) { ring.style.setProperty('--progress', progress); ring.setAttribute('aria-valuenow', String(progress)); ring.setAttribute('aria-valuetext', `${source.progress.phase}, ${progress}% estimated`); }
  if (source.status === 'ready') setTimeout(() => { ring.hidden = true; }, 150);
  if (source.status === 'error') notice(`${side} · ${source.error}`);
  else if (source.status === 'ready') notice();
  // A retained comparison remains visible while refresh builds its replacement inventory.
  if (workspaces.get(workspaceId)?.key) { renderSourceControls(); return; }
  $('#open-comparison').disabled = !['left', 'right'].every(name => sourceState[name]?.status === 'ready')
    || sourceState.left.tree?.directory !== sourceState.right.tree?.directory;
  const lone = loneComparison();
  if (lone) { comparison = lone; selected = lone.rows[0] ?? null; renderEditors(); renderFiles(); renderChanges(); }
  else if (source.status !== 'ready') { comparison = null; selected = null; destroyViews(); showEmptyWorkspace(); renderFiles(); }
  renderSourceControls();
}
function acceptComparison(next, reset = false) {
  const previous = comparison;
  const labelsChanged = previous && ['left', 'right'].some(side => JSON.stringify(previous[side].revision) !== JSON.stringify(next[side].revision));
  const sourcesChanged = !previous || ['left', 'right'].some(side => JSON.stringify(previous[side].source) !== JSON.stringify(next[side].source));
  comparison = next;
  const record = workspaces.get(workspaceId);
  if (record?.key) {
    const ids = comparisonDocumentIds(next, workspaceId); const released = [];
    for (const id of record.extraDocuments ?? []) ids.add(id);
    for (const id of record.documents) if (!ids.has(id)) { record.documents.delete(id); released.push(id); }
    releaseUnowned(released);
  }
  if (reset) {
    destroyViews(); active = null; resultDocument = null;
    selected = next.rows.find(row => row.status !== 'equal') ?? next.rows[0];
    if (next.output) {
      resultDocument = documentFor({ ...next.output.state, absolute: next.output.path, writable: true }, 'result', '');
      if (next.output.state.missing) resultDocument.replace(next.base?.entries[0]?.text ?? '', 'initialize merge result');
    }
    renderEditors();
  } else {
    for (const side of ['left', 'right']) for (const entry of next[side].entries) {
      const doc = documents.get(entry.documentId ?? entry.absolute ?? `${workspaceId ?? 'draft'}:${side}:${entry.path}`);
      if (doc && !doc.writable && typeof entry.text === 'string') { doc.observe(entry); doc.error = entry.error; }
    }
    selected = next.rows.find(row => row.path === selected?.path) ?? next.rows[0];
    if (sourcesChanged || labelsChanged) renderEditors();
    else for (const { view } of views) view.dispatch({});
  }
  renderFiles(); renderChanges();
  renderSourceControls();
}
function transfer(from, to, range = null) {
  if (!to?.writable) throw new Error('Choose a writable destination');
  if (range) to.replace(to.text.slice(0, range.from) + from.text.slice(range.sourceFrom, range.sourceTo) + to.text.slice(range.to), 'accept hunk');
  else to.replace(from.text, 'copy whole file');
  active = to; syncDocuments();
}
function selectPosition(doc, position) {
  const target = views.find(entry => entry.doc === doc);
  if (target) { const pos = Math.min(position, doc.text.length); target.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) }); navigation?.selection(target.view, true); target.view.focus(); }
}
function renderChanges() {
  const list = $('#change-list'); list.replaceChildren();
  if (!selected) return;
  if (!selected.left || !selected.right) return;
  const a = documentFor(selected.left, 'left', selected.path); const b = documentFor(selected.right, 'right', selected.path);
  const entries = currentHunks(a, b);
  const committedPair = comparison.left.source.kind === 'git' && comparison.right.source.kind === 'git' && !comparison.layers.length;
  entries.forEach((entry, index) => {
    const row = element('div', undefined, 'change-row');
    row.append(button(`${committedPair ? 'Committed' : 'Difference'} ${index + 1}`, () => selectPosition(b, entry.fromB), committedPair ? 'committed' : ''));
    row.append(element('span', `− ${a.text.slice(entry.fromA, entry.toA)}  + ${b.text.slice(entry.fromB, entry.toB)}`, 'change-text'));
    if (a.writable) row.append(button('← Accept', () => transfer(b, a, { from: entry.fromA, to: entry.toA, sourceFrom: entry.fromB, sourceTo: entry.toB })));
    if (b.writable) row.append(button('Accept →', () => transfer(a, b, { from: entry.fromB, to: entry.toB, sourceFrom: entry.fromA, sourceTo: entry.toA })));
    list.append(row);
  });
  for (const layer of comparison.layers) for (const entry of layer.entries) {
    const repoPath = selected[layer.side]?.repoPath ?? selected.path;
    if (entry.path !== repoPath) continue;
    const row = element('div', undefined, `change-row ${layer.category}`);
    row.append(button(`${layer.side} · ${layer.category}${entry.untracked ? ' · untracked' : ''}`, () => inspectVersions(layer, entry), layer.category));
    row.append(element('span', `${entry.path} · ${layer.repo}`, 'change-text')); list.append(row);
  }
  for (const doc of new Set([a, b, resultDocument].filter(Boolean))) {
    if (doc.dirty) list.append(element('div', `Unsaved buffer · ${doc.label}`, 'change-row unsaved'));
    if (doc.pending.length) list.append(button('Review external change', () => openReview(doc), 'contention'));
  }
  if (resultDocument && comparison.base) {
    for (const [side, source] of [['left', a], ['right', b]]) {
      const base = comparison.base.entries[0]?.text ?? '';
      const changes = hunks(base, source.text);
      changes.forEach((entry, i) => {
        const row = element('div', undefined, 'change-row');
        row.append(element('span', `Merge ${side} change ${i + 1}`, 'change-text'));
        row.append(button('Use this version', () => {
          // Map base anchors through the current result; overlapping choices replace the mapped region.
          const mapped = mapRange(base, resultDocument.text, entry.fromA, entry.toA);
          transfer(source, resultDocument, { ...mapped, sourceFrom: entry.fromB, sourceTo: entry.toB });
        })); list.append(row);
      });
    }
  }
}
function hunks(before, after) {
  return Chunk.build(Text.of(before.split('\n')), Text.of(after.split('\n'))).map(chunk => ({ fromA: chunk.fromA, toA: chunk.endA, fromB: chunk.fromB, toB: chunk.endB }));
}
function currentHunks(a, b) {
  if (selected.hunks && a.text === selected.left?.text && b.text === selected.right?.text) return selected.hunks;
  return diffResults.get(a, b).chunks.map(chunk => ({ fromA: chunk.fromA, toA: chunk.endA, fromB: chunk.fromB, toB: chunk.endB }));
}
function mapRange(before, after, from, to) {
  const changes = diff(before, after);
  function map(pos, end) {
    let delta = 0;
    for (const change of changes) {
      if (pos < change.fromA) break;
      if (pos <= change.toA) return end ? change.toB : change.fromB;
      delta = change.toB - change.toA;
    }
    return pos + delta;
  }
  return { from: map(from, false), to: map(to, true) };
}
async function save(doc = active) {
  if (!doc?.writable) throw new Error('This source is read-only. Save a merge result to a writable file.');
  if (doc.pending.length) { openReview(doc); return; }
  const state = await call('read', doc.path);
  if (state.fingerprint !== doc.disk.fingerprint) { doc.observe(state); if (doc.pending.length) { openReview(doc); return; } }
  doc.closeHistoryGroup(); const text = doc.text;
  try {
    const saved = await call('save', { path: doc.path, text, fingerprint: doc.disk.fingerprint, format: doc.format });
    doc.reviewArchive.push({ baseline: saved.before, versions: [] });
    doc.saved(saved); doc.format = saved.format; notice();
  } catch (error) { if (error.external) { doc.observe(error.external); openReview(doc); } else throw error; }
}
async function saveAs(doc = active) {
  if (!doc) return;
  const chosen = await call('saveAs', { path: doc.path });
  if (!chosen) return;
  const target = documentFor({ ...chosen.state, absolute: chosen.path, writable: true }, 'result', '');
  const record = workspaces.get(workspaceId);
  if (record) { record.extraDocuments ??= new Set(); record.extraDocuments.add(target.id); }
  target.replace(doc.text, 'save as'); active = target;
  await save(target); syncDocuments();
}
function plainEditor(text, writable, parent, label, existingDraft = null) {
  const pane = element('section', undefined, 'pane'); pane.append(element('h3', label)); parent.append(pane);
  const draft = existingDraft ?? new Document(`review:${label}`, text, { ...preferences, writable });
  draft.transient = true;
  const view = new EditorView({ parent: pane, state: EditorState.create({ doc: draft.text, extensions: extensions(draft) }) });
  const unsubscribe = draft.subscribe(() => queueMicrotask(() => {
    if (view.state.doc.toString() !== draft.text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: draft.text }, annotations: fromModel.of(true) });
  }));
  const destroy = view.destroy.bind(view);
  view.destroy = () => { unsubscribe(); destroy(); };
  return view;
}
function destroyReview() { clearInterval(review?.poll); for (const view of review?.views ?? []) view.destroy(); review = null; $('#review-editors').replaceChildren(); }
function refreshReviewVersions(message = null) {
  if (!review?.doc || !$('#review').open) return;
  const selector = $('#review-version'); const selectedVersion = selector.value;
  selector.replaceChildren();
  review.doc.pending.forEach((version, index) => {
    const option = element('option', `Version ${index + 1}${version.text === null ? ' · deleted/unavailable' : ''}`); option.value = String(index); selector.append(option);
  });
  selector.value = selectedVersion || String(review.doc.pending.length - 1);
  if (message) $('#review-message').textContent = message;
}
function openReview(doc) {
  destroyReview();
  review = { doc, views: [], fingerprint: doc.pending.at(-1)?.fingerprint, draft: new Document(`review:${doc.id}`, doc.text, preferences) };
  $('#review-message').textContent = `${doc.label} changed outside the editor. Every external edit requires your review.`;
  const selector = $('#review-version');
  selector.onchange = () => renderReviewVersion(Number(selector.value));
  renderReviewVersion(doc.pending.length - 1);
  $('#review').showModal(); refreshReviewVersions();
  review.poll = setInterval(() => safely(async () => {
    const state = await call('read', doc.path); const latest = doc.pending.at(-1) ?? doc.disk;
    if (state.fingerprint === latest.fingerprint && state.error === latest.error) return;
    doc.observe(state);
    refreshReviewVersions('A newer external version arrived. Your current review and edited result are preserved; select the latest disk version before resolving.');
  }), 250);
}
function renderReviewVersion(index) {
  for (const view of review.views) view.destroy(); review.views = []; $('#review-editors').replaceChildren();
  const version = review.doc.pending[index]; if (!version) return;
  review.fingerprint = version.fingerprint;
  review.views.push(plainEditor(review.doc.baseline.text ?? '', false, $('#review-editors'), 'Last synchronized'));
  review.views.push(plainEditor(version.text ?? '', false, $('#review-editors'), version.error ?? (version.text === null ? 'Deleted on disk' : 'Disk')));
  review.merged = plainEditor(review.doc.text, true, $('#review-editors'), 'Your buffer / editable result', review.draft); review.views.push(review.merged);
}
function resolveReview(choice) {
  // The selector is authoritative at click time; a native select change can
  // race a renderer event that repopulates its options.
  const selectedVersion = review.doc.pending[Number($('#review-version').value)];
  review.doc.resolve(selectedVersion?.fingerprint ?? review.fingerprint, choice, review.merged.state.doc.toString());
  if (review.doc.writable) active = review.doc;
  $('#review').close(); destroyReview(); syncDocuments();
}
function inspectVersions(layer, entry) {
  destroyReview(); review = { views: [] };
  $('#review-message').textContent = `${layer.side} · ${layer.repo} · ${layer.category} · ${entry.path}`;
  $('#review-version').replaceChildren();
  review.views.push(plainEditor(entry.before, false, $('#review-editors'), 'Before'));
  review.views.push(plainEditor(entry.after, false, $('#review-editors'), 'After'));
  for (const id of ['accept-disk', 'keep-local', 'accept-merge']) $(`#${id}`).disabled = true;
  $('#review').showModal();
}
function askClose() { $('#close-dialog').showModal(); return new Promise(resolve => { closeAction = resolve; }); }
for (const [id, choice] of [['close-cancel', 'cancel'], ['close-discard', 'discard'], ['close-save', 'save']]) $(`#${id}`).onclick = () => { $('#close-dialog').close(); closeAction?.(choice); };
$('#close-dialog').addEventListener('cancel', () => closeAction?.('cancel'));
$('#review-cancel').onclick = () => { $('#review').close(); destroyReview(); };
$('#review').addEventListener('close', () => { for (const id of ['accept-disk', 'keep-local', 'accept-merge']) $(`#${id}`).disabled = false; });
$('#accept-disk').onclick = () => safely(() => resolveReview('disk'));
$('#keep-local').onclick = () => safely(() => resolveReview('local'));
$('#accept-merge').onclick = () => safely(() => resolveReview('merge'));

const commands = { save: () => save(), 'save-as': () => saveAs(), undo: () => active && runHistory(active, 'undo'), redo: () => active && runHistory(active, 'redo'), 'new-comparison': () => call('comparisonNew') };
for (const [id, action] of Object.entries(commands)) {
  const control = $(`#${id}`);
  if (control) control.onclick = () => safely(action);
}
function openAbout() {
  aboutReturnFocus = document.activeElement;
  $('#about-title').textContent = application.name;
  $('#about-version').textContent = `Version ${application.version}`;
  $('#about-description').textContent = application.description;
  $('#about-logo').src = application.logo;
  $('#about-repository').href = application.repository;
  $('#about-support').href = application.support;
  $('#about-dialog').showModal();
  $('#about-close').focus();
}
for (const [id, link] of [['about-repository', 'repository'], ['about-support', 'support']]) $(`#${id}`).onclick = event => { event.preventDefault(); safely(() => call('aboutLink', link)); };
$('#about-close').onclick = () => $('#about-dialog').close();
$('#about-dialog').addEventListener('close', () => aboutReturnFocus?.focus());
commands.about = openAbout;
commands['close-comparison'] = () => closeComparison();
$('#layout').onchange = () => safely(async () => { applyAppearance(await call('preferences', { layout: $('#layout').value })); renderEditors(); });
$('#theme').onchange = () => safely(async () => { applyAppearance(await call('preferences', { theme: $('#theme').value })); });
$('#settings').onclick = () => { $('#history-budget').value = String(preferences.historyBytes / 1024 / 1024); $('#preferences-dialog').showModal(); };
$('#preferences-cancel').onclick = () => $('#preferences-dialog').close();
$('#preferences-save').onclick = () => safely(async () => {
  const bytes = Number($('#history-budget').value) * 1024 * 1024;
  for (const doc of documents.values()) if ([...doc.past, ...doc.future].some(entry => entry.bytes > bytes)) throw new Error('The requested budget cannot retain an existing transition');
  applyAppearance(await call('preferences', { historyBytes: bytes }));
  for (const doc of documents.values()) doc.setHistoryBudget(bytes);
  $('#preferences-dialog').close();
});
$('#filter').oninput = () => { fileAnchor = null; $('#file-region').scrollTop = 0; renderFiles(); };
$('#file-view').onchange = () => { fileAnchor = null; $('#file-region').scrollTop = 0; renderFiles(); };
$('#file-region').onscroll = () => { const top = $('#file-region').scrollTop; const row = fileListing[Math.floor(top / 34)]; fileAnchor = row ? { path: row.path, offset: top % 34 } : null; renderFiles(); };
$('#refresh').onclick = () => safely(() => call('refresh'));
async function protectReplacement() {
  if (comparison?.left && comparison?.right) return true;
  return protectDraft();
}
async function loadSource(side, value) {
  const owner = workspaceId; const opened = Boolean(workspaces.get(owner)?.key);
  if (!value || !await protectReplacement()) return;
  if (!opened) await call('comparisonType', document.querySelector('input[name="comparison-type"]:checked').value);
  try { await call('sourceLoad', side, { kind: 'file', path: value }); }
  catch (error) {
    if (opened && owner === workspaceId) {
      const descriptor = sourceState[side]?.descriptor; const input = $(`#${side}-source`);
      input.value = descriptor?.kind === 'git' ? `${descriptor.repo}/${descriptor.path ?? ''}` : descriptor?.path ?? '';
      input.dataset.committed = input.value;
    }
    throw error;
  }
  notice();
}
for (const side of ['left', 'right']) $(`#choose-${side}`).onclick = () => safely(async () => {
  const defaultPath = browse.linked ? browse.latest : browse.locations[side];
  const folder = document.querySelector('input[name="comparison-type"]:checked').value === 'folder';
  const file = await call('choose', { directory: folder, defaultPath });
  if (!file) return;
  $(`#${side}-source`).value = file;
  const location = folder ? file : file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1) || file;
  browse.locations[side] = location; browse.latest = location;
  if (browse.linked) browse.locations.left = browse.locations.right = location;
  await loadSource(side, file);
});
$('#link-locations').onclick = () => {
  browse.linked = !browse.linked;
  if (browse.linked) browse.locations.left = browse.locations.right = browse.latest;
  $('#link-locations').setAttribute('aria-pressed', String(browse.linked));
  $('#link-locations').textContent = browse.linked ? 'Linked locations' : 'Independent locations';
};
for (const side of ['left', 'right']) {
  const input = $(`#${side}-source`);
  input.dataset.committed = input.value;
  input.onchange = () => {
    if (input.value === input.dataset.committed) return;
    input.dataset.committed = input.value;
    safely(() => loadSource(side, input.value));
  };
  input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); input.dataset.committed = input.value; safely(() => loadSource(side, input.value)); } };
}
$('#sources').onsubmit = event => event.preventDefault();
$('#open-comparison').onclick = () => safely(() => call('comparisonSubmit'));
for (const input of document.querySelectorAll('input[name="comparison-type"]')) input.onchange = () => safely(async () => { if (await protectDraft()) acceptWorkspace(await call('comparisonType', input.value)); else renderSourceControls(); });
$('#comparison-back').onclick = () => safely(() => call('comparisonBack'));
$('#comparison-forward').onclick = () => safely(() => call('comparisonForward'));
$('#toggle-comparisons').onclick = () => {
  const region = $('#comparison-region');
  const collapsed = region.classList.toggle('collapsed');
  $('#toggle-comparisons').setAttribute('aria-expanded', String(!collapsed));
};
async function showHistory(side, generation) {
  const owner = workspaceId;
  const opened = await call('historyOpen', side, generation);
  if (owner !== workspaceId || generation !== sourceState[side]?.generation) { await call('historyClose', opened.id); return; }
  historyPicker = { side, generation, owner, id: opened.id, cursor: null, loading: false, lanes: [] };
  $('#history-reference').replaceChildren(new Option('Choose a reference…', ''));
  for (const reference of opened.references ?? []) {
    const option = new Option(reference.label, reference.label); option.dataset.commit = reference.id; option.title = reference.id;
    $('#history-reference').append(option);
  }
  const revision = sourceState[side]?.tree?.revision;
  $('#history-alias-label').hidden = !revision?.labels?.length;
  $('#history-alias').replaceChildren(...(revision?.labels ?? []).map(label => new Option(label, label)));
  $('#history-alias').value = workspaces.get(owner)?.aliases?.[`${side}:${revision?.id}`] ?? revision?.labels?.[0] ?? '';
  $('#history-alias').title = revision?.id ?? '';
  $('#history-alias').setAttribute('aria-label', `${side} revision display name`);
  renderSourceControls();
  $('#history-list').replaceChildren(); $('#history-state').textContent = `History for ${opened.repository.repo}`;
  $('#history-dialog').showModal(); await nextHistoryPage();
}
async function chooseRevision(ref, label) {
  const picker = historyPicker;
  if (!picker || picker.selecting) return;
  picker.selecting = true;
  try {
    await call('sourceCommit', picker.side, picker.generation, ref, picker.owner);
    const record = workspaces.get(workspaceId);
    if (label && record) record.aliases[`${picker.side}:${ref}`] = label;
    renderSourceControls();
  } finally { if (historyPicker === picker) $('#history-dialog').close(); }
}
$('#history-reference').onchange = () => {
  const option = $('#history-reference').selectedOptions[0];
  if (option?.dataset.commit) safely(() => chooseRevision(option.dataset.commit, option.value));
};
$('#history-alias').onchange = () => {
  const picker = historyPicker; const record = workspaces.get(workspaceId);
  if (!picker || picker.owner !== workspaceId || !record) return;
  record.aliases[`${picker.side}:${sourceState[picker.side].tree.revision.id}`] = $('#history-alias').value;
  renderEditors(); renderSourceControls();
};
async function nextHistoryPage() {
  if (!historyPicker || historyPicker.loading || historyPicker.end) return;
  const currentPicker = historyPicker;
  currentPicker.loading = true;
  try {
    const page = await call('historyPage', historyPicker.id, historyPicker.cursor);
    if (historyPicker !== currentPicker) return;
    for (const commit of page.commits) {
      const lane = historyPicker.lanes.indexOf(commit.id);
      const laneIndex = lane < 0 ? historyPicker.lanes.push(commit.id) - 1 : lane;
      historyPicker.lanes.splice(laneIndex, 1, ...commit.parents);
      const row = button('', () => chooseRevision(commit.id));
      row.className = 'history-row'; row.title = commit.message;
      row.append(element('span', `${'│ '.repeat(laneIndex)}●`, 'history-graph'), element('span', commit.subject, 'history-subject'), element('span', commit.refs.join(' · '), 'history-refs'), element('span', `${commit.author} · ${commit.timestamp}`, 'history-meta'), element('code', commit.id, 'history-hash'));
      $('#history-list').append(row);
    }
    while ($('#history-list').childElementCount > 200) $('#history-list').firstElementChild.remove();
    historyPicker.cursor = page.cursor; historyPicker.end = page.end; $('#history-more').disabled = page.end;
    if (page.end && !page.commits.length) $('#history-state').textContent = 'No commits are available for this repository.';
  } finally { currentPicker.loading = false; }
}
$('#history-more').onclick = () => safely(nextHistoryPage);
$('#history-list').onscroll = () => {
  const list = $('#history-list');
  if (list.scrollTop + list.clientHeight >= list.scrollHeight - 40) safely(nextHistoryPage);
};
$('#history-close').onclick = () => $('#history-dialog').close();
$('#history-working').onclick = () => safely(async () => {
  const picker = historyPicker; const source = picker && sourceState[picker.side];
  if (!picker || !source?.repository) return;
  picker.selecting = true;
  try { await call('sourceWorking', picker.side, picker.generation, picker.owner); }
  finally { if (historyPicker === picker) $('#history-dialog').close(); }
});
$('#history-dialog').addEventListener('close', () => {
  const picker = historyPicker; historyPicker = null;
  renderSourceControls();
  if (picker) safely(() => call('historyClose', picker.id));
});
$('#copy-left').onclick = () => safely(() => transfer(documentFor(selected.right, 'right', selected.path), documentFor(selected.left, 'left', selected.path)));
$('#copy-right').onclick = () => safely(() => transfer(documentFor(selected.left, 'left', selected.path), documentFor(selected.right, 'right', selected.path)));
for (const [id, direction] of [['previous', -1], ['next', 1]]) $(`#${id}`).onclick = () => navigation?.next(direction);
for (const side of ['left', 'right']) {
  const control = $(`#${side}-version`);
  control.onclick = () => safely(() => showHistory(side, sourceState[side]?.generation));
  control.onkeydown = event => { if (event.key === 'ArrowDown') { event.preventDefault(); control.click(); } };
}
host.onEvent(event => safely(async () => {
  if (!preferences) return;
  if (event.type === 'workspace') { acceptWorkspace(event.workspace, event.comparisons, event.groups); return; }
  if (event.type === 'recent-open') { await call('recentOpen', event.key); return; }
  if (event.workspaceId && event.workspaceId !== workspaceId && event.type !== 'disk') return;
  if (event.side && event.generation !== undefined && event.type !== 'source' && event.generation !== sourceState[event.side]?.generation) return;
  if (event.type === 'comparison') acceptComparison(event.result);
  else if (event.type === 'source-labels') {
    if (sourceState[event.side]?.generation !== event.generation) return;
    if (sourceState[event.side].tree?.revision) sourceState[event.side].tree.revision.labels = event.labels;
    if (comparison?.[event.side]?.revision) comparison[event.side].revision.labels = event.labels;
    for (const node of document.querySelectorAll('.pane-title')) {
      const doc = documents.get(node.dataset.document);
      if (doc) node.replaceWith(title(doc, node.dataset.sourceSide));
    }
    syncDocuments(); renderSourceControls();
  }
  else if (event.type === 'source') acceptSource(event.side, event.source);
  else if (event.type === 'source-inventory') {
    const entries = event.inventory.offset === 0 ? [] : inventories[event.side]?.entries ?? [];
    if (event.inventory.offset !== entries.length) return;
    entries.push(...event.inventory.entries);
    inventories[event.side] = { ...event.inventory, entries };
    scheduleFiles();
  }
  else if (event.type === 'source-progress') { acceptSource(event.side, { ...sourceState[event.side], status: 'loading', progress: event.progress }); notice(`${event.side} · ${event.progress.phase} · ${event.progress.progress}% estimated`); }
  else if (event.type === 'source-repository') {
    sourceState[event.side] = { ...sourceState[event.side], repository: event.repository, generation: event.generation };
    renderSourceControls();
  }
  else if (event.type === 'source-repository-unavailable') notice(`Commit selection unavailable: ${event.error}`);
  else if (event.type === 'comparison-error') notice(event.error);
  else if (event.type === 'appearance') applyAppearance(event);
  else if (event.type === 'disk') {
    const normalizePath = value => String(value ?? '').replaceAll('\\', '/');
    const doc = documents.get(event.path) ?? [...documents.values()].find(candidate => normalizePath(candidate.path) === normalizePath(event.path));
    if (doc) {
      doc.observe(event.state);
      if (review?.doc === doc && $('#review').open) {
        refreshReviewVersions('A newer external version arrived. Your current review and edited result are preserved; select the latest disk version before resolving.');
      }
    }
  }
  else if (event.type === 'error') notice(event.message);
  else if (event.type === 'command') await commands[event.command]?.();
  else if (event.type === 'close-request') {
    if (![...documents.values()].some(doc => doc.dirty || doc.pending.length)) { host.closeApproved(); return; }
    const choice = await askClose();
    if (choice === 'cancel') return;
    if (choice === 'save') { for (const doc of documents.values()) if (doc.writable && (doc.dirty || doc.pending.length)) await save(doc); if ([...documents.values()].some(doc => doc.writable && (doc.dirty || doc.pending.length))) return; }
    host.closeApproved();
  }
}));
await safely(async () => {
  const bootstrap = await call('bootstrap'); applyAppearance(bootstrap); application = bootstrap.application;
  if (bootstrap.comparison?.base) preferences.layout = 'merge';
  $('#layout').value = preferences.layout;
  if (bootstrap.workspace) acceptWorkspace(bootstrap.workspace, bootstrap.comparisons, bootstrap.groups);
  else if (bootstrap.comparison) acceptComparison(bootstrap.comparison, true);
  if (host.sourceState) Object.assign(sourceState, await call('sourceState'));
  for (const node of document.querySelectorAll('#sources input, #sources button:not(#open-comparison)')) node.disabled = false;
  $('#open-comparison').disabled = !['left', 'right'].every(side => sourceState[side]?.status === 'ready');
  document.documentElement.dataset.ready = 'true';
  renderSourceControls();
});
