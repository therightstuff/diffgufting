#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
try {
  await mkdir('dist', { recursive: true });
  await build({ entryPoints: ['src/ui/app.mjs'], bundle: true, format: 'esm', platform: 'browser', outfile: 'dist/app.js', sourcemap: true });
  await copyFile('src/ui/index.html', 'dist/index.html');
  await copyFile('src/ui/styles.css', 'dist/styles.css');
  console.log('Built desktop renderer in dist/');
} catch (error) { console.error(`Build failed: ${error.message}`); process.exitCode = 1; }
