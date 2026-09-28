import http from 'node:http';
import { readFile } from 'node:fs/promises';
const allowed = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/logo.svg': 'logo.svg', '/sample.json': 'sample.json' };
const types = { html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', json: 'application/json; charset=utf-8' };
http.createServer(async (req, res) => {
  const file = allowed[new URL(req.url, 'http://127.0.0.1').pathname];
  if (req.method !== 'GET' || !file) { res.writeHead(404).end(); return; }
  try { const body = await readFile(new URL(`../ui/${file}`, import.meta.url)); res.writeHead(200, { 'Content-Type': types[file.split('.').pop()], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); } catch { res.writeHead(404).end(); }
}).listen(4322, '127.0.0.1', () => console.log('Preview (offline only): http://127.0.0.1:4322/'));
