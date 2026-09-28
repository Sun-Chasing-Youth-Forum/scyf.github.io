import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GitHub, GitHubError, DeviceFlow } from '../core/github.mjs';
import { encode } from '../core/content.mjs';
const config = { repository: 'scyf-pmo/scyf-pmo.github.io', branch: 'main', repositoryId: '1365262554' };
const fixture = { ...JSON.parse(await readFile(new URL('../ui/sample.json', import.meta.url), 'utf8')), source: 'remote', tree: 'tree-old' };
const event = fixture.records.find(r => r.kind === 'events');
const changes = [{ path: event.path, content: encode(event, { ...event.data, host: '测试维护者' }) }];
class MockHub extends GitHub {
  constructor() { super(config); this.token = 'test-not-real'; this.calls = []; this.write = true; this.remote = fixture.sha; this.race = false; }
  async identity() { return { login: 'test', canPublish: this.write }; }
  async head() { return this.remote; }
  async request(path, method, body) {
    this.calls.push({ path, method, body });
    if (path.endsWith('/git/trees')) return { sha: 'tree-new' };
    if (path.endsWith('/git/commits')) return { sha: 'a'.repeat(40) };
    if (path.endsWith('/git/refs/heads/main')) {
      assert.equal(body.force, false);
      if (this.race) throw new GitHubError('有其他维护者更新', 'CONFLICT');
      this.remote = body.sha; return {};
    }
    throw new Error('Unexpected call ' + path);
  }
}
test('publishes all changes as one commit with exact parent and non-force ref update', async () => {
  const hub = new MockHub(); const result = await hub.publish(fixture, changes, '更新活动');
  assert.equal(result.sha, 'a'.repeat(40)); assert.equal(hub.calls.length, 3);
  assert.deepEqual(hub.calls[1].body.parents, [fixture.sha]); assert.equal(hub.calls[0].body.base_tree, fixture.tree);
});
test('permission denial, logged-out or offline state cannot publish', async () => {
  const hub = new MockHub(); hub.write = false;
  await assert.rejects(() => hub.publish(fixture, changes), /写权限/); assert.equal(hub.calls.length, 0);
  hub.token = ''; await assert.rejects(() => hub.publish(fixture, changes), /登录/);
  hub.token = 'test'; await assert.rejects(() => hub.publish({ ...fixture, source: 'sample' }, changes), /离线/);
});
test('remote change is detected before any mutation', async () => {
  const hub = new MockHub(); hub.remote = 'another-commit';
  await assert.rejects(() => hub.publish(fixture, changes), e => e.code === 'CONFLICT');
  assert.equal(hub.calls.length, 0);
});
test('a race after the version check never forces the ref or retries writes', async () => {
  const hub = new MockHub(); hub.race = true;
  await assert.rejects(() => hub.publish(fixture, changes), e => e.code === 'CONFLICT');
  assert.equal(hub.calls.length, 3); assert.equal(hub.remote, fixture.sha);
});
for (const [status, code] of [[401, 'AUTH'], [403, 'PERMISSION'], [429, 'RATE'], [422, 'CONFLICT']]) {
  test(`HTTP ${status} becomes an actionable error without exposing credentials`, async () => {
    const hub = new GitHub(config, { fetcher: async () => new Response('{}', { status }) }); hub.token = 'secret-test-value';
    await assert.rejects(() => hub.request('/user'), e => e.code === code && !e.message.includes(hub.token));
  });
}
test('network failure keeps authentication out of error messages', async () => {
  const hub = new GitHub(config, { fetcher: async () => { throw new Error('simulated transport failure'); } });
  await assert.rejects(() => hub.request('/user'), /网络|连接/);
});
test('deployment lookup selects the exact commit and never reports an older success', async () => {
  const hub = new GitHub(config); hub.request = async () => ({ workflow_runs: [{ head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success' }] });
  assert.equal((await hub.deployment('a'.repeat(40))).state, 'pending');
});
test('device login respects interval, slow_down, and returns token only after authorization', async () => {
  let now = 0; const requests = []; const queue = [
    { device_code: 'private-device-code', user_code: 'ABCD-EFGH', expires_in: 900, interval: 5 },
    { error: 'slow_down' }, { error: 'authorization_pending' }, { access_token: 'test-token', expires_in: 28800 }
  ];
  const flow = new DeviceFlow(config, async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return new Response(JSON.stringify(queue.shift())); }, () => now);
  const start = await flow.start('Iv1.public-client-id'); assert.equal(start.userCode, 'ABCD-EFGH'); assert.equal(start.device_code, undefined);
  await flow.poll(); assert.equal(requests.length, 1);
  now = 5000; await flow.poll(); now = 10000; await flow.poll(); assert.equal(requests.length, 2);
  now = 15000; await flow.poll(); now = 25000; const result = await flow.poll();
  assert.equal(result.token, 'test-token'); assert.equal(requests.at(-1).body.repository_id, config.repositoryId);
  assert.ok(requests.every(r => !('client_secret' in r.body)));
});
test('expired device code stops polling', async () => {
  let now = 0; const flow = new DeviceFlow(config, async () => new Response(JSON.stringify({ device_code: 'd', user_code: 'u', expires_in: 1, interval: 5 })), () => now);
  await flow.start('Iv1.client-id'); now = 2000; await assert.rejects(() => flow.poll(), /过期/);
});
