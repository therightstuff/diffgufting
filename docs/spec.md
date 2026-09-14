# Architecture

Diffgusting separates document state from presentation. Shared models live in `src/core/`, host filesystem and Git adapters in `src/host/`, the Electron bridge in `src/desktop/`, and the portable renderer in `src/ui/`. The CLI belongs in `bin/` and build/distribution entry points in `scripts/`.

The shared document model owns buffers, disk baselines, observed external versions, and bounded in-memory undo/redo. All content replacements pass through its journal. Themes and layouts consume shared documents rather than owning independent copies. Repository objects and index snapshots are read-only; merge results are ordinary files.

The generated PNG masters in `assets/branding/` own the visual identity. Their source reference and generation prompts remain alongside them; platform exports derive from the icon master.

## Host contract

The isolated preload exposes only bootstrap, open, read, save, save-as destination selection, source selection, refresh, preferences, dirty-state notification, and close approval. Requests return `{ok, value}` or `{ok: false, error, external?}`. Save requests include a path, text, expected fingerprint, and encoding/newline format. The host authorizes writes only to documents opened by that comparison or through the native save dialog. Events carry comparison results, observed disk versions, monitoring errors, menu commands, or close requests.

Source descriptors are `{kind: 'file', path}` or `{kind: 'git', repo, ref, path}`. Comparison results contain left/right trees, optional base/output, relative-path rows, and independently labeled Git layers. File entries carry content, fingerprint, editability, format, and an explicit unavailable state. Comparisons run in cancellable worker threads; generation checks discard obsolete results.

## Observation and history

The host watches source directories and also reconciles periodically and on focus. It fingerprints file contents, suppresses verified self-save events, and serializes writes per document. The renderer's shared document registry prevents duplicate independent buffers for the same canonical path. All persistent document edits use a delta journal; pending review snapshots remain separate from evictable undo entries.

Defaults are registered in `src/core/settings.mjs`: 100 MiB history, 2-second reconciliation, 100-millisecond watch debounce, 30-second operation timeout, and 32 MiB editable file limit. Preferences contain configuration only, never document history. The portable UI depends on the host contract rather than Node or Electron APIs.
