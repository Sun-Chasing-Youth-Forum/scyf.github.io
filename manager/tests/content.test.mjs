import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decode, encode, validate, prepareChanges, contentPath, assetPath, publicLink } from '../core/content.mjs';
const fixture = JSON.parse(await readFile(new URL('../ui/sample.json', import.meta.url), 'utf8'));
const event = fixture.records.find(r => r.path.endsWith('2026-09-16.md'));

test('all existing public content round-trips without rewriting and validates', () => {
  assert.ok(fixture.records.length >= 20);
  for (const record of fixture.records) { assert.equal(encode(record, record.data, record.body), record.source); assert.deepEqual(validate(record), [], record.path); }
});
test('editing an event preserves full multi-speaker abstracts and extension fields', () => {
  const custom = decode(event.path, event.source.replace('issue: 10', 'issue: 10\ntags: [MHD, science]\nrecording: https://example.org/recording # preserve me'));
  const data = structuredClone(custom.data); data.host = '新主持人'; data.sessions[0].summary += '\n\n新增完整段落，保留 m⁻² 和周期 <100 s。';
  const output = encode(custom, data, custom.body);
  const next = decode(custom.path, output);
  assert.equal(next.data.host, '新主持人');
  assert.equal(next.data.sessions[0].summary, data.sessions[0].summary);
  assert.equal(next.data.sessions[1].summary, custom.data.sessions[1].summary);
  assert.deepEqual(next.data.tags, ['MHD', 'science']);
  assert.match(output, /# preserve me/);
  assert.equal(next.body, custom.body);
});
test('new events use block front matter compatible with the website build checks', () => {
  const empty = decode('src/content/events/2027-02-01.md', '---\n{}\n---\n');
  const source = encode(empty, { issue: 19, date: '2027-02-01', time: '09:30–12:00', host: '待定', location: '待定', status: '待定', materials: [] });
  assert.match(source, /^issue: 19$/m); assert.match(source, /^date: 2027-02-01$/m);
  assert.deepEqual(validate(decode(empty.path, source)), []);
});
test('rejects invalid dates, required fields, and unsafe links', () => {
  const r = structuredClone(event); r.data.date = '2026-02-30'; r.data.issue = 0; r.data.host = ''; r.data.materials = [{ label: 'x', url: 'javascript:alert(1)' }];
  assert.ok(validate(r).length >= 4);
  assert.equal(publicLink('/documents/slides.pdf'), true);
  assert.equal(publicLink('/documents/../secret.pdf'), false);
  assert.equal(publicLink('https://user:password@example.org'), false);
});
test('YAML aliases and duplicate keys are rejected; body and CRLF preserved', () => {
  assert.throws(() => decode(event.path, '---\nissue: 1\nissue: 2\n---\n'));
  const crlf = event.source.replace(/\r?\n/g, '\r\n');
  const r = decode(event.path, crlf); assert.equal(encode(r, r.data, r.body), crlf);
});
test('restricted write scope protects workflow, source, private documents and traversal', () => {
  for (const p of ['.github/workflows/deploy.yml', 'src/pages/index.astro', 'src/content/events/../../x.md', 'public/documents/internal-handbook.pdf', 'public/documents/x.html', 'public/images/x.svg']) {
    assert.equal(contentPath(p) || assetPath(p), false, p);
    assert.throws(() => prepareChanges(fixture, [{ path: p, content: 'x' }]));
  }
});
test('one transaction supports text updates, attachments and deletion', () => {
  const data = { ...event.data, host: '测试维护者' };
  const items = prepareChanges(fixture, [
    { path: event.path, content: encode(event, data) },
    { path: 'public/documents/slides-2026.pdf', base64: Buffer.from('%PDF-1.4\n').toString('base64') },
    { path: fixture.records.find(r => r.kind === 'news').path, deleted: true }
  ]);
  assert.equal(items.length, 3); assert.equal(items[2].sha, null);
});
test('rejects stale asset overwrite, duplicate paths and duplicate event issues', () => {
  assert.throws(() => prepareChanges(fixture, [{ path: event.path, deleted: true }, { path: event.path, deleted: true }]));
  assert.throws(() => prepareChanges(fixture, [{ path: 'src/content/events/new-event.md', content: event.source }]));
  assert.throws(() => prepareChanges({ ...fixture, files: { ...fixture.files, 'public/documents/slides.pdf': 'abc' } }, [{ path: 'public/documents/slides.pdf', base64: 'YQ==' }]));
});
test('unknown fields cannot be silently removed by publishing', () => {
  const r = decode(event.path, event.source.replace('issue: 10', 'issue: 10\nrecording: https://example.org/recording'));
  const snap = { ...fixture, records: fixture.records.map(old => old.path === r.path ? r : old) };
  assert.throws(() => prepareChanges(snap, [{ path: event.path, content: event.source }]), /扩展字段/);
});
test('empty changes and excessive attachments are rejected', () => {
  assert.throws(() => prepareChanges(fixture, [{ path: event.path, content: event.source }]), /没有实际/);
  assert.throws(() => prepareChanges(fixture, [{ path: 'public/documents/big.pdf', base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }]), /5 MB/);
});
