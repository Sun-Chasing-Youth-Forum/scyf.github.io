import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decode } from '../core/content.mjs';
const root = new URL('../../', import.meta.url);
const records = [], files = {};
for (const kind of ['events', 'news', 'training', 'about']) {
  const dir = new URL(`src/content/${kind}/`, root);
  for (const file of (await readdir(dir)).filter(f => /\.mdx?$/.test(f))) {
    const source = await readFile(new URL(file, dir), 'utf8');
    const path = `src/content/${kind}/${file}`;
    records.push(decode(path, source));
    files[path] = createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex');
  }
}
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
await writeFile(new URL('../ui/sample.json', import.meta.url), JSON.stringify({ repository: 'scyf-pmo/scyf-pmo.github.io', sha, tree: '', source: 'sample', fetchedAt: new Date().toISOString(), records, files }, null, 2));
await copyFile(new URL('public/images/logo-light-badge.svg', root), new URL('../ui/logo.svg', import.meta.url));
console.log(`Prepared ${records.length} public records for offline exploration.`);
