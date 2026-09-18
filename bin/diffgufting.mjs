#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArguments, usage } from '../src/core/arguments.mjs';
import { defaults } from '../src/core/settings.mjs';

try {
  const argv = process.argv.slice(2);
  const request = argv.length ? parseArguments(argv) : null;
  if (request?.help) { console.log(usage); process.exit(0); }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const packaged = !!process.versions.electron;
  const executable = packaged ? process.execPath : (await import('electron')).default;
  const env = { ...process.env, DIFFGUFTING_CHILD: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, packaged ? argv : [root, ...argv], { detached: !request?.wait, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env });
  let ready = false; let stderr = '';
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-8192); });
  const timer = setTimeout(() => { console.error('Diffgufting did not finish startup. Run npm run build and retry.'); child.kill(); process.exitCode = 1; }, defaults.operationTimeoutMs);
  child.on('error', error => { clearTimeout(timer); console.error(`Cannot start Diffgufting: ${error.message}`); process.exitCode = 1; });
  child.on('message', message => {
    if (message.error) { clearTimeout(timer); console.error(message.error); process.exitCode = 1; return; }
    if (message.ready) {
      ready = true; clearTimeout(timer);
      if (!request?.wait) { child.stderr.destroy(); child.disconnect(); child.unref(); }
    }
  });
  child.on('exit', code => {
    clearTimeout(timer);
    if (!ready) console.error(`Diffgufting failed to start.${stderr ? `\n${stderr}` : ''}`);
    process.exitCode = ready ? (code ?? 1) : 1;
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
