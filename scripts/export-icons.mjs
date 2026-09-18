#!/usr/bin/env node
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const destination = 'assets/branding/icons';
try {
  await mkdir(destination, { recursive: true });
  const images = new Map();
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    const png = await sharp('assets/branding/diffgufting-icon.png').resize(size, size, { kernel: 'nearest' }).png().toBuffer();
    images.set(size, png); await writeFile(`${destination}/icon-${size}.png`, png);
    console.log(`Exported ${size}px PNG`);
  }
  const sizes = [16, 32, 48, 256];
  const header = Buffer.alloc(6 + sizes.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16; header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(images.get(size).length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += images.get(size).length;
  });
  await writeFile(`${destination}/diffgufting.ico`, Buffer.concat([header, ...sizes.map(size => images.get(size))]));
  const chunks = [];
  for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
    const head = Buffer.alloc(8); head.write(type); head.writeUInt32BE(images.get(size).length + 8, 4); chunks.push(head, images.get(size));
  }
  const icns = Buffer.alloc(8); icns.write('icns'); icns.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  await writeFile(`${destination}/diffgufting.icns`, Buffer.concat([icns, ...chunks]));
  console.log('Exported Windows ICO and macOS ICNS');
} catch (error) { console.error(`Icon export failed: ${error.message}`); process.exitCode = 1; }
