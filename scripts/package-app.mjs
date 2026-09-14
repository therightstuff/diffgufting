#!/usr/bin/env node
import { packager } from '@electron/packager';
import { mkdir, writeFile, chmod, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const run = promisify(execFile);
try {
  const platform = process.argv[2] ?? process.platform;
  const arch = process.argv[3] ?? process.arch;
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Usage: npm run package -- [darwin|win32|linux] [arm64|x64]');
  await mkdir('release', { recursive: true });
  console.log(`Packaging ${platform}-${arch}`);
  const icon = platform === 'darwin' ? 'assets/branding/icons/diffgusting.icns' : platform === 'win32' ? 'assets/branding/icons/diffgusting.ico' : 'assets/branding/icons/icon-256.png';
  const bundles = await packager({ dir: '.', out: 'release', name: 'Diffgusting', executableName: 'diffgusting-app', appBundleId: 'app.diffgusting.desktop', appCategoryType: 'public.app-category.developer-tools', platform, arch, icon, asar: false, overwrite: true, prune: true, ignore: [/^\/release/, /^\/test-results/, /^\/tests/, /^\/openspec/, /^\/\.agents/, /^\/\.git(?:\/|$)/, /^\/inspiration/, /^\/scripts/], osxSign: false, osxNotarize: false });
  for (const bundle of bundles) {
    if (platform === 'win32') {
      await writeFile(path.join(bundle, 'diffgusting.cmd'), '@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0diffgusting-app.exe" "%~dp0resources\\app\\bin\\diffgusting.mjs" %*\r\nexit /b %errorlevel%\r\n');
    } else {
      const binary = platform === 'darwin' ? 'Diffgusting.app/Contents/MacOS/diffgusting-app' : 'diffgusting-app';
      const cli = platform === 'darwin' ? 'Diffgusting.app/Contents/Resources/app/bin/diffgusting.mjs' : 'resources/app/bin/diffgusting.mjs';
      const launcher = path.join(bundle, 'diffgusting');
      await writeFile(launcher, `#!/bin/sh\nlocation=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nELECTRON_RUN_AS_NODE=1 exec "$location/${binary}" "$location/${cli}" "$@"\n`);
      await chmod(launcher, 0o755);
      if (platform === 'linux') {
        const installer = path.join(bundle, 'install-desktop.sh');
        await writeFile(installer, '#!/bin/sh\nset -eu\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\ndata_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}\nmkdir -p "$data_dir/applications" "$data_dir/icons/hicolor/256x256/apps"\ncp "$app_dir/resources/app/assets/branding/icons/icon-256.png" "$data_dir/icons/hicolor/256x256/apps/diffgusting.png"\ncat > "$data_dir/applications/diffgusting.desktop" <<EOF\n[Desktop Entry]\nType=Application\nName=Diffgusting\nExec="$app_dir/diffgusting-app"\nIcon=diffgusting\nTerminal=false\nCategories=Development;\nEOF\nprintf "%s\\n" "Installed desktop entry for $app_dir"\n');
        await chmod(installer, 0o755);
      }
    }
    const archive = path.resolve(`${bundle}.zip`);
    await unlink(archive).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await run('zip', ['-q', '-r', '-y', archive, path.basename(bundle)], { cwd: path.dirname(bundle), maxBuffer: 1024 * 1024 });
    console.log(`Created ${archive}`);
  }
} catch (error) { console.error(`Packaging failed: ${error.message}`); process.exitCode = 1; }
