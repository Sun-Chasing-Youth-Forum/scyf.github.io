import { readdir, readFile, writeFile } from 'node:fs/promises';
import { effectiveStatus } from '../src/utils/event-state.mjs';

// Touch only the single top-level status line; preserve abstracts, comments and extensions.
export function updateStatus(source, now = new Date()) {
  const front = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front) return source;
  const field = key => front[1].match(new RegExp(`^${key}:[ \\t]*(?:"([^"]*)"|'([^']*)'|([^\\r\\n#]*))`, 'm'))?.slice(1).find(v => v !== undefined)?.trim();
  const data = { date: field('date'), time: field('time'), status: field('status') };
  if (data.status !== '已公布' || effectiveStatus(data, now) !== '已结束') return source;
  const updated = front[0].replace(/^(status:[ \t]*)(["']?)已公布\2(?=[ \t]*(?:#|\r?$))/m, '$1$2已结束$2');
  return updated + source.slice(front[0].length);
}
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const folder = new URL('../src/content/events/', import.meta.url);
  let count = 0;
  for (const name of await readdir(folder)) {
    if (!/\.mdx?$/.test(name)) continue;
    const path = new URL(name, folder), before = await readFile(path, 'utf8'), after = updateStatus(before);
    if (before !== after) { await writeFile(path, after); count++; console.log(`自动归档：${name}`); }
  }
  console.log(`已更新 ${count} 项过期的已公布活动。`);
}
