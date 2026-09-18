#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function generateFixture({ root, seed = 1, scale = 30 }) {
  if (typeof root !== 'string' || !root) throw new Error('Fixture root is required');
  if (!Number.isSafeInteger(seed)) throw new Error('Fixture seed must be an integer');
  if (!Number.isSafeInteger(scale) || scale < 1) throw new Error('Fixture scale must be a positive integer');
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  const textCases = [
    { name: 'repeated-lines', before: 'same\nsame\nsame\n', after: 'same\nchanged\nsame\n' },
    { name: 'unicode', before: 'שלום\n', after: 'שלום עולם\n' },
    { name: 'multiline-shift', before: 'a\nb\nc\n', after: 'a\ninserted\nb\nc\n' },
  ];
  await Promise.all([mkdir(left, { recursive: true }), mkdir(right, { recursive: true })]);
  const entries = [];
  for (let index = 0; index < scale; index++) {
    const status = ['equal', 'changed', 'added'][index % 3];
    const relativePath = `group-${Math.floor(index / 10)}/file-${index}.txt`;
    const leftPath = path.join(left, relativePath); const rightPath = path.join(right, relativePath);
    const text = `fixture ${seed}:${index}\n`;
    if (status !== 'added') await mkdir(path.dirname(leftPath), { recursive: true });
    await mkdir(path.dirname(rightPath), { recursive: true });
    if (status !== 'added') await writeFile(leftPath, text);
    await writeFile(rightPath, status === 'changed' ? `${text}changed\n` : text);
    entries.push({ path: relativePath, status });
  }
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ version: 1, seed, scale, entries, textCases }, null, 2));
  return { left, right, manifestPath };
}

export async function generateEditingFixture({ root }) {
  if (typeof root !== 'string' || !root) throw new Error('Fixture root is required');
  const before = 'same\nsame\nשלום\nmultiline\n';
  const after = 'same\nchanged\nשלום עולם\nmultiline\ninserted\n';
  const repository = path.join(root, 'git');
  const gitHistorical = path.join(repository, 'spec.txt');
  const gitSnapshot = path.join(root, 'git-historical.txt');
  const plain = path.join(root, 'plain');
  const plainHistorical = path.join(plain, 'historical.txt');
  const plainWorking = path.join(plain, 'working.txt');
  await mkdir(plain, { recursive: true });
  await mkdir(repository, { recursive: true });
  await writeFile(gitHistorical, before);
  await run('git', ['init', '--quiet'], { cwd: repository });
  await run('git', ['config', 'user.name', 'Diffgusting fixture'], { cwd: repository });
  await run('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: repository });
  await run('git', ['add', 'spec.txt'], { cwd: repository });
  await run('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: repository });
  await writeFile(gitHistorical, after);
  await writeFile(gitSnapshot, before);
  await writeFile(plainHistorical, before);
  await writeFile(plainWorking, after);
  return { git: { repository, historical: gitSnapshot, working: gitHistorical }, plain: { historical: plainHistorical, working: plainWorking } };
}

async function main() {
  const [root, seed = '1', scale = '30'] = process.argv.slice(2);
  const fixture = await generateFixture({ root, seed: Number(seed), scale: Number(scale) });
  console.log(JSON.stringify(fixture));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(error => { console.error(`Fixture generation failed: ${error.message}`); process.exitCode = 1; });
}
