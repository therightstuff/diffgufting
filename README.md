# Diffgufting

![Diffgufting human-face logo](assets/branding/diffgufting-logo.png)

A desktop comparison and merge editor for files, folders, and Git snapshots. Start a New comparison, choose File or Folder and each source independently, and see it in Open Comparisons as soon as a source is selected. Changing a ready pair preserves it in the group’s Back/Forward history, even before explicit submission. Path and revision changes stay in one group slot with Back/Forward history; New preserves the current comparison and any loaded, unsubmitted work without a close prompt. Diffgufting keeps staged and unstaged changes visible together, groups ordinary typing into practical undo steps, follows Light, Dark, or Device appearance preferences, requires review when another program changes a file you are editing, and provides an About dialog with project and author-support links.

The application uses Node.js, Electron, and CodeMirror. Install with `npm ci`, build with `npm run build`, then open the source chooser with `npm start`.

See [setup and packaging](docs/setup.md), [CLI and editor usage](docs/usage.md), [architecture](docs/spec.md), and [testing](docs/testing.md). Change specifications and implementation checklists live in [OpenSpec](openspec/changes/).
