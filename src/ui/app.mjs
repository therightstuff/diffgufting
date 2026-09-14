import { EditorState, Annotation, ChangeSet, Text, RangeSet } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, gutter, GutterMarker } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { MergeView, unifiedMergeView, diff, Chunk, originalDocChangeEffect, getOriginalDoc } from '@codemirror/merge';
import { Document } from '../core/document.mjs';
import { layerRanges } from '../core/change-layers.mjs';

const $ = selector => document.querySelector(selector);
const host = window.diffgusting;
const fromModel = Annotation.define();
const documents = new Map();
const views = [];
let comparison = null; let selected = null; let active = null; let resultDocument = null;
let preferences; let mergeView; let syncing = false; let review; let closeAction; let changeIndex = -1;

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
  const id = entry.absolute ?? `${side}:${key}`;
  let doc = documents.get(id);
  if (!doc) {
    doc = new Document(id, entry.text ?? '', { ...preferences, fingerprint: entry.fingerprint, writable: entry.writable ?? false });
    doc.path = entry.absolute; doc.format = entry.format; doc.error = entry.error; doc.label = entry.absolute ?? `${side}: ${key || 'snapshot'}`;
    if (entry.missing) doc.disk = { ...entry, text: null };
    documents.set(id, doc);
    doc.subscribe(() => queueMicrotask(syncDocuments));
  }
  return doc;
}
function selection(doc, view) {
  doc.selection = { ...view.state.selection.main, anchor: view.state.selection.main.anchor, head: view.state.selection.main.head, scrollTop: view.scrollDOM.scrollTop };
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
    if (!source || (source.absolute ?? `${side}:${selected.path}`) !== doc.id) continue;
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
    keymap.of([{ key: 'Mod-z', run: () => doc.undo() }, { key: 'Mod-Shift-z', run: () => doc.redo() }, { key: 'Mod-y', run: () => doc.redo() }, { key: 'Mod-s', run: () => { safely(() => save(doc)); return true; } }, ...searchKeymap, ...defaultKeymap]),
    EditorView.domEventHandlers({ focus: () => { if (!doc.transient) { active = doc; updateStatus(); } } }),
    EditorState.transactionFilter.of(transaction => {
      if (!transaction.docChanged || transaction.annotation(fromModel)) return transaction;
      try { doc.replace(transaction.newDoc.toString(), 'edit'); return transaction; }
      catch (error) { notice(error.message); return []; }
    }),
    EditorView.updateListener.of(update => { if (update.selectionSet) selection(doc, update.view); }),
    ...extra];
}
function mountEditor(doc, mount, extra = []) {
  const view = new EditorView({ parent: mount, state: EditorState.create({ doc: doc.text, selection: { anchor: Math.min(doc.selection.anchor, doc.text.length), head: Math.min(doc.selection.head, doc.text.length) }, extensions: extensions(doc, extra) }) });
  view.scrollDOM.scrollTop = doc.selection.scrollTop;
  views.push({ doc, view });
  return view;
}
function title(doc, side) {
  const node = element('div', undefined, 'pane-title'); node.dataset.document = doc.id;
  node.append(element('strong', side), element('span', doc.label, 'name'));
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
    }
  }],
  ['unified', (a, b, root) => {
    const container = element('div', undefined, 'editors'); root.append(container);
    pane(b, 'right', container, [unifiedMergeView({ original: a.text, mergeControls: false, syntaxHighlightDeletions: false })]);
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
  const a = documentFor(selected.left, 'left', selected.path); const b = documentFor(selected.right, 'right', selected.path);
  if (!active || ![a, b, resultDocument].includes(active)) active = resultDocument ?? (b.writable ? b : a);
  (layouts.get(preferences.layout) ?? layouts.get('side-by-side'))(a, b, $('#content'));
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
      node.querySelector('.review-button')?.remove();
      if (doc.pending.length) node.append(button('Review external change', () => openReview(doc), 'review-button contention'));
    }
    renderDocuments(); renderChanges(); updateStatus();
    host.dirty([...documents.values()].some(doc => doc.writable && (doc.dirty || doc.pending.length)));
  } finally { syncing = false; }
}
function renderDocuments() {
  const nav = $('#documents'); nav.replaceChildren();
  for (const doc of documents.values()) {
    const row = element('div');
    row.append(button(`${doc.dirty ? '● ' : ''}${doc.label.split(/[\\/]/).at(-1)}${doc.pending.length ? ' · REVIEW' : ''}`, () => {
      active = doc;
      const row = comparison?.rows.find(row => row.left?.absolute === doc.id || row.right?.absolute === doc.id);
      if (row) { selected = row; renderEditors(); }
      else {
        selected = { path: doc.label, left: { text: doc.disk.text ?? '', fingerprint: doc.disk.fingerprint, writable: false }, right: { absolute: doc.path, text: doc.text, fingerprint: doc.disk.fingerprint, writable: doc.writable } };
        if (comparison?.output?.path === doc.path) resultDocument = doc;
        renderEditors();
      }
      if (doc.pending.length) openReview(doc);
    }));
    row.append(button('Close document', () => closeDocument(doc))); nav.append(row);
  }
}
async function closeDocument(doc) {
  if (doc.dirty || doc.pending.length) {
    const choice = await askClose();
    if (choice === 'cancel') return;
    if (choice === 'save') { await save(doc); if (doc.dirty || doc.pending.length) return; }
  }
  destroyViews(); documents.delete(doc.id); selected = null; active = null; resultDocument = null;
  $('#content').replaceChildren(element('p', 'Select a file to reopen it.')); syncDocuments();
}
function updateStatus() {
  $('#status').textContent = active ? `${active.dirty ? 'Unsaved' : 'Saved'} · ${active.past.length} undo steps · ${(active.bytes / 1024).toFixed(1)} KiB history${active.historyTruncated ? ' · OLDEST HISTORY EVICTED' : ''}${active.pending.length ? ` · ${active.pending.length} external version(s) need review` : ''}` : 'Ready';
  $('#save').disabled = !active?.writable; $('#undo').disabled = !active?.past.length; $('#redo').disabled = !active?.future.length;
}
function renderFiles() {
  $('#files').replaceChildren();
  if (!comparison) return;
  const filter = $('#filter').value.toLowerCase();
  for (const row of comparison.rows) {
    if (!row.path.toLowerCase().includes(filter)) continue;
    const node = button(row.path || 'File comparison', () => { selected = row; renderEditors(); renderFiles(); }, selected?.path === row.path ? 'selected' : '');
    node.append(element('span', row.status, 'badge')); $('#files').append(node);
  }
}
function acceptComparison(next, reset = false) {
  comparison = next;
  if (reset) {
    destroyViews(); documents.clear(); active = null; resultDocument = null;
    selected = next.rows.find(row => row.status !== 'equal') ?? next.rows[0];
    if (next.output) {
      resultDocument = documentFor({ ...next.output.state, absolute: next.output.path, writable: true }, 'result', '');
      if (next.output.state.missing) resultDocument.replace(next.base?.entries[0]?.text ?? '', 'initialize merge result');
    }
    renderEditors();
  } else {
    for (const side of ['left', 'right']) for (const entry of next[side].entries) {
      const doc = documents.get(entry.absolute ?? `${side}:${entry.path}`);
      if (doc && !doc.writable && entry.text !== null) { doc.observe(entry); doc.error = entry.error; }
    }
    if (selected) selected = next.rows.find(row => row.path === selected.path) ?? selected;
    for (const { view } of views) view.dispatch({});
  }
  renderFiles(); renderChanges();
}
function transfer(from, to, range = null) {
  if (!to?.writable) throw new Error('Choose a writable destination');
  if (range) to.replace(to.text.slice(0, range.from) + from.text.slice(range.sourceFrom, range.sourceTo) + to.text.slice(range.to), 'accept hunk');
  else to.replace(from.text, 'copy whole file');
  active = to; syncDocuments();
}
function selectPosition(doc, position) {
  const target = views.find(entry => entry.doc === doc);
  if (target) { const pos = Math.min(position, doc.text.length); target.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) }); target.view.focus(); }
}
function renderChanges() {
  const list = $('#change-list'); list.replaceChildren();
  if (!selected) return;
  const a = documentFor(selected.left, 'left', selected.path); const b = documentFor(selected.right, 'right', selected.path);
  const entries = selected.hunks && a.text === selected.left?.text && b.text === selected.right?.text ? selected.hunks : hunks(a.text, b.text);
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
  const text = doc.text;
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
function destroyReview() { for (const view of review?.views ?? []) view.destroy(); review = null; $('#review-editors').replaceChildren(); }
function openReview(doc) {
  destroyReview();
  review = { doc, views: [], fingerprint: doc.pending.at(-1)?.fingerprint, draft: new Document(`review:${doc.id}`, doc.text, preferences) };
  $('#review-message').textContent = `${doc.label} changed outside the editor. Every external edit requires your review.`;
  const selector = $('#review-version'); selector.replaceChildren();
  doc.pending.forEach((version, index) => { const option = element('option', `Version ${index + 1}${version.text === null ? ' · deleted/unavailable' : ''}`); option.value = String(index); selector.append(option); });
  selector.value = String(doc.pending.length - 1);
  selector.onchange = () => renderReviewVersion(Number(selector.value));
  renderReviewVersion(doc.pending.length - 1);
  $('#review').showModal();
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
  review.doc.resolve(review.fingerprint, choice, review.merged.state.doc.toString());
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

const commands = { save: () => save(), 'save-as': () => saveAs(), undo: () => active?.undo(), redo: () => active?.redo() };
for (const [id, action] of Object.entries(commands)) $(`#${id}`).onclick = () => safely(action);
$('#layout').onchange = () => safely(async () => { preferences = await call('preferences', { layout: $('#layout').value }); renderEditors(); });
$('#theme').onchange = () => safely(async () => { preferences = await call('preferences', { theme: $('#theme').value }); document.documentElement.dataset.theme = preferences.theme; });
$('#settings').onclick = () => { $('#history-budget').value = String(preferences.historyBytes / 1024 / 1024); $('#preferences-dialog').showModal(); };
$('#preferences-cancel').onclick = () => $('#preferences-dialog').close();
$('#preferences-save').onclick = () => safely(async () => {
  const bytes = Number($('#history-budget').value) * 1024 * 1024;
  for (const doc of documents.values()) if ([...doc.past, ...doc.future].some(entry => entry.bytes > bytes)) throw new Error('The requested budget cannot retain an existing transition');
  preferences = await call('preferences', { historyBytes: bytes });
  for (const doc of documents.values()) doc.setHistoryBudget(bytes);
  $('#preferences-dialog').close();
});
$('#filter').oninput = renderFiles;
$('#refresh').onclick = () => safely(() => call('refresh'));
for (const side of ['left', 'right']) $(`#choose-${side}`).onclick = () => safely(async () => { const file = await call('choose', $('#directories').checked); if (file) $(`#${side}-source`).value = file; });
$('#sources').onsubmit = event => { event.preventDefault(); safely(async () => {
  if ([...documents.values()].some(doc => doc.dirty || doc.pending.length)) {
    const choice = await askClose(); if (choice === 'cancel') return;
    if (choice === 'save') { for (const doc of documents.values()) if (doc.dirty && doc.writable) await save(doc); if ([...documents.values()].some(doc => doc.dirty || doc.pending.length)) return; }
  }
  const result = await call('open', { left: { kind: 'file', path: $('#left-source').value }, right: { kind: 'file', path: $('#right-source').value } });
  acceptComparison(result, true); notice();
}); };
$('#copy-left').onclick = () => safely(() => transfer(documentFor(selected.right, 'right', selected.path), documentFor(selected.left, 'left', selected.path)));
$('#copy-right').onclick = () => safely(() => transfer(documentFor(selected.left, 'left', selected.path), documentFor(selected.right, 'right', selected.path)));
for (const [id, direction] of [['previous', -1], ['next', 1]]) $(`#${id}`).onclick = () => {
  if (!selected) return;
  const a = documentFor(selected.left, 'left', selected.path); const b = documentFor(selected.right, 'right', selected.path); const changes = diff(a.text, b.text);
  if (changes.length) { changeIndex = (changeIndex + direction + changes.length) % changes.length; selectPosition(b, changes[changeIndex].fromB); }
};
host.onEvent(event => safely(async () => {
  if (event.type === 'comparison' && comparison) acceptComparison(event.result);
  else if (event.type === 'disk') {
    const doc = documents.get(event.path);
    if (doc) {
      doc.observe(event.state);
      if (review?.doc === doc && $('#review').open) {
        const selector = $('#review-version');
        for (let i = selector.options.length; i < doc.pending.length; i++) {
          const option = element('option', `Version ${i + 1}${doc.pending[i].text === null ? ' · deleted/unavailable' : ''}`); option.value = String(i); selector.append(option);
        }
        $('#review-message').textContent = 'A newer external version arrived. Your current review and edited result are preserved; select the latest disk version before resolving.';
      }
    }
  }
  else if (event.type === 'error') notice(event.message);
  else if (event.type === 'command') await commands[event.command]?.();
  else if (event.type === 'close-request') {
    const choice = await askClose();
    if (choice === 'cancel') return;
    if (choice === 'save') { for (const doc of documents.values()) if (doc.writable && (doc.dirty || doc.pending.length)) await save(doc); if ([...documents.values()].some(doc => doc.writable && (doc.dirty || doc.pending.length))) return; }
    host.closeApproved();
  }
}));
await safely(async () => {
  const bootstrap = await call('bootstrap'); preferences = bootstrap.preferences;
  document.documentElement.dataset.theme = preferences.theme; $('#theme').value = preferences.theme;
  if (bootstrap.comparison?.base) preferences.layout = 'merge';
  $('#layout').value = preferences.layout;
  if (bootstrap.comparison) acceptComparison(bootstrap.comparison, true);
});
