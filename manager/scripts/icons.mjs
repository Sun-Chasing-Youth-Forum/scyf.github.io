// Derived from our editable SVG, not a downloaded or AI-generated bitmap.
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = await readFile(new URL('../ui/app-icon.svg', import.meta.url));
const directory = new URL('../assets/', import.meta.url);
await mkdir(directory, { recursive: true });
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const images = new Map(await Promise.all(sizes.map(async size => [size, await sharp(source).resize(size, size).png().toBuffer()])));
await writeFile(new URL('icon.png', directory), images.get(1024));
const windowsSizes = sizes.filter(size => size <= 256);
const header = Buffer.alloc(6 + windowsSizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(windowsSizes.length, 4);
let offset = header.length;
windowsSizes.forEach((size, index) => {
  const entry = 6 + index * 16, png = images.get(size);
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(new URL('icon.ico', directory), Buffer.concat([header, ...windowsSizes.map(size => images.get(size))]));
const chunks = [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
  const png = images.get(size), chunk = Buffer.alloc(8); chunk.write(type); chunk.writeUInt32BE(png.length + 8, 4); return Buffer.concat([chunk, png]);
});
const macHeader = Buffer.alloc(8); macHeader.write('icns'); macHeader.writeUInt32BE(8 + chunks.reduce((n, chunk) => n + chunk.length, 0), 4);
await writeFile(new URL('icon.icns', directory), Buffer.concat([macHeader, ...chunks]));
console.log('Generated Windows ICO, Mac ICNS and 1024 px PNG from ui/app-icon.svg.');
