# Diffgusting

![Diffgusting human-face logo](assets/branding/diffgusting-logo.png)

A desktop comparison and merge editor for files, folders, and Git snapshots. Choose either source independently to browse or edit it, then Diffgusting compares compatible ready pairs automatically. It keeps staged and unstaged changes visible together, groups ordinary typing into practical undo steps, follows Light, Dark, or Device appearance preferences, and requires review when another program changes a file you are editing.

The application uses Node.js, Electron, and CodeMirror. Install with `npm ci`, build with `npm run build`, then open the source chooser with `npm start`.

See [setup and packaging](docs/setup.md), [CLI and editor usage](docs/usage.md), [architecture](docs/spec.md), and [testing](docs/testing.md). The active implementation checklist is in [OpenSpec](openspec/changes/independent-source-selection/tasks.md).
