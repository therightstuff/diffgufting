# Setup

Development requires Node.js 24 or newer and npm. Git is required for repository comparisons and Git integration tests; filesystem comparisons do not require Git.

Install pinned dependencies with `npm ci`, build with `npm run build`, and launch with `npm start`. See [usage](usage.md) for file, folder, and Git examples.

## Build a distribution

Run `npm run icons`, `npm run build`, and then `npm run package -- darwin arm64` to assemble a native app directory and ZIP in `release/`. The packaging script also accepts `darwin x64`, `win32 x64`, and `linux x64`. Cross-platform packaging does not replace testing on those operating systems. The packaging host requires a `zip` executable. The selected packager edits Windows executable resources directly and does not require Wine.

Extract the ZIP into its final location and run its `diffgusting` launcher (`diffgusting.cmd` on Windows), or open the native application. On Linux, `./install-desktop.sh` registers the application and icon for the current user; run it again after moving the extracted directory. The installer respects `XDG_DATA_HOME`. Packages are unsigned development distributions.

## Platform targets

Target Windows 11 x64, macOS 13 or newer on Apple Silicon and Intel, and Ubuntu 24.04 x64 with a graphical desktop. These are application test targets, not a claim that platform validation has already passed. Distribution uses native Electron application directories in ZIP archives. Signing and notarization require release credentials and are not performed by a local development build.

## Dependency decisions

CodeMirror's state transactions, accessible editor view, search commands, and merge package cover the editor surface without a UI framework. A shared document journal will own undo instead of enabling a second editor-native history. Monaco was considered but supplies a broader IDE surface than required. A custom text editor would duplicate mature editing and selection behavior.

The CodeMirror merge package also supplies the text diff engine, avoiding a separate diff dependency. Electron supplies the desktop runtime; esbuild bundles the renderer; Electron Packager assembles native distributions; Sharp exports pixel-preserving icons; Playwright exercises the actual desktop renderer. Packaging and test packages are development dependencies.

References: [CodeMirror API](https://codemirror.net/docs/ref/), [Electron 44 platform changes](https://www.electronjs.org/blog/electron-44-0).
