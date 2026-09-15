import { Annotation } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { diff } from '@codemirror/merge';
import { mapPosition } from '../core/navigation.mjs';

export const fromNavigation = Annotation.define();

export class Navigation {
  constructor(entries, overview) {
    this.entries = entries; this.overview = overview; this.expected = new WeakMap(); this.cache = new Map(); this.cleanup = [];
    for (const { view } of entries) {
      const listener = () => {
        const expected = this.expected.get(view);
        if (expected && Math.abs(view.scrollDOM.scrollTop - expected.top) < 2 && Math.abs(view.scrollDOM.scrollLeft - expected.left) < 2) return;
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.scroll(view));
      };
      view.scrollDOM.addEventListener('scroll', listener);
      this.cleanup.push(() => view.scrollDOM.removeEventListener('scroll', listener));
    }
    overview.onclick = event => {
      if (!this.ranges.length) return;
      const rect = overview.getBoundingClientRect(); this.jumpFraction((event.clientY - rect.top) / rect.height);
    };
    overview.onkeydown = event => {
      if (!this.ranges.length) return;
      const view = this.entries[0]?.view; if (!view) return;
      const current = view.state.doc.lineAt(view.state.selection.main.head).number;
      const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key];
      if (step || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.jumpFraction(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (current - 1 + step) / Math.max(1, view.state.doc.lines - 1));
      }
    };
    this.refresh();
  }
  changes(before, after) {
    let cache = this.cache.get(before);
    if (!cache) this.cache.set(before, cache = new Map());
    if (!cache.has(after)) cache.set(after, diff(before, after));
    return cache.get(after);
  }
  map(source, target, position) {
    const a = source.state.doc.toString(); const b = target.state.doc.toString();
    return mapPosition(a, b, position, this.changes(a, b));
  }
  selection(view, center = false) {
    if (this.busy || !this.entries.some(entry => entry.view === view)) return;
    this.busy = true;
    try {
      for (const { view: target } of this.entries) {
        const head = this.map(view, target, view.state.selection.main.head);
        if (target !== view) target.dispatch({ selection: { anchor: head }, annotations: fromNavigation.of(true), ...(center ? { effects: EditorView.scrollIntoView(head, { y: 'center' }) } : {}) });
        else if (center) target.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }), annotations: fromNavigation.of(true) });
      }
      this.pointer(view);
    } finally { this.busy = false; }
  }
  scroll(view) {
    if (this.destroyed || this.busy) return;
    const source = view.scrollDOM;
    const middle = source.scrollTop + source.clientHeight / 2;
    const block = view.lineBlockAtHeight(Math.max(0, middle - view.documentTop + source.getBoundingClientRect().top - source.scrollTop));
    for (const { view: target } of this.entries) {
      if (target === view) continue;
      const position = this.map(view, target, block.from);
      const targetBlock = target.lineBlockAt(position);
      const scroller = target.scrollDOM;
      const top = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, targetBlock.top + targetBlock.height / 2 - scroller.clientHeight / 2));
      const left = Math.max(0, Math.min(source.scrollLeft, scroller.scrollWidth - scroller.clientWidth));
      this.expected.set(target, { top, left });
      scroller.scrollTop = top; scroller.scrollLeft = left;
    }
    this.pointer(view);
  }
  refresh() {
    this.cache.clear(); this.ranges = []; this.overview.replaceChildren();
    const canonical = this.entries[0]?.view;
    if (!canonical) return;
    const before = canonical.state.doc.toString();
    const others = this.entries.slice(1).map(entry => entry.view.state.doc.toString());
    if (this.entries[0].original) others.push(this.entries[0].original.text);
    for (const after of others) for (const change of this.changes(before, after)) this.ranges.push({ from: change.fromA, to: change.toA });
    this.ranges.sort((a, b) => a.from - b.from);
    for (const range of this.ranges) {
      const marker = document.createElement('span'); marker.className = 'overview-change';
      const start = canonical.state.doc.lineAt(range.from).number - 1;
      const end = canonical.state.doc.lineAt(range.to).number;
      marker.style.top = `${100 * start / canonical.state.doc.lines}%`;
      marker.style.height = `${Math.max(0.5, 100 * (end - start) / canonical.state.doc.lines)}%`;
      this.overview.append(marker);
    }
    this.overview.tabIndex = this.ranges.length ? 0 : -1;
    this.overview.setAttribute('aria-disabled', String(!this.ranges.length));
    if (this.ranges.length) { this.indicator = document.createElement('span'); this.indicator.className = 'overview-location'; this.overview.append(this.indicator); this.pointer(canonical); }
    else { this.indicator = null; this.overview.setAttribute('aria-label', 'Change overview: no changes'); }
  }
  pointer(view) {
    if (!this.indicator) return;
    const canonical = this.entries[0].view;
    const scroller = view.scrollDOM;
    const block = view.lineBlockAtHeight(Math.max(0, scroller.scrollTop));
    const line = canonical.state.doc.lineAt(this.map(view, canonical, block.from)).number;
    const visible = Math.max(1, scroller.clientHeight / view.defaultLineHeight);
    this.indicator.style.top = `${100 * (line - 1) / canonical.state.doc.lines}%`;
    this.indicator.style.height = `${Math.min(100, 100 * visible / canonical.state.doc.lines)}%`;
    this.overview.setAttribute('aria-label', `Change overview: line ${line} of ${canonical.state.doc.lines}`);
  }
  jumpFraction(fraction) {
    const view = this.entries[0]?.view; if (!view) return;
    const line = Math.max(1, Math.min(view.state.doc.lines, Math.round(Math.max(0, Math.min(1, fraction)) * (view.state.doc.lines - 1)) + 1));
    view.dispatch({ selection: { anchor: view.state.doc.line(line).from }, annotations: fromNavigation.of(true) });
    this.selection(view, true);
  }
  next(direction) {
    const view = this.entries[0]?.view; if (!view || !this.ranges.length) return;
    const position = view.state.selection.main.head;
    const range = direction > 0 ? this.ranges.find(range => range.from > position) ?? this.ranges[0] : [...this.ranges].reverse().find(range => range.from < position) ?? this.ranges.at(-1);
    view.dispatch({ selection: { anchor: range.from }, annotations: fromNavigation.of(true) }); this.selection(view, true);
  }
  destroy() { this.destroyed = true; cancelAnimationFrame(this.frame); for (const cleanup of this.cleanup) cleanup(); this.overview.onclick = null; this.overview.onkeydown = null; }
}
