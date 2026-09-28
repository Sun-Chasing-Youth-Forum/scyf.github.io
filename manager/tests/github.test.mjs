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
test('canceling an in-flight device poll cannot return a token', async () => {
  let now = 0, finish;
  const flow = new DeviceFlow(config, async url => url.endsWith('/device/code')
    ? new Response(JSON.stringify({ device_code: 'd', user_code: 'u', expires_in: 900, interval: 5 }))
    : new Promise(resolve => { finish = resolve; }), () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  const pending = flow.poll(); flow.pending = null;
  finish(new Response(JSON.stringify({ access_token: 'must-not-be-returned' })));
  assert.deepEqual(await pending, { waiting: true });
});

const deviceResponse = () => new Response(JSON.stringify({ device_code: 'private-device-code', user_code: 'ABCD-EFGH', expires_in: 900, interval: 5 }));
test('a network failure retains the device flow and retries after backoff', async () => {
  let now = 0, attempt = 0;
  const flow = new DeviceFlow(config, async url => {
    if (url.endsWith('/device/code')) return deviceResponse();
    if (!attempt++) throw new Error('temporary outage');
    return new Response(JSON.stringify({ access_token: 'example-user-token' }));
  }, () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  const retry = await flow.poll(); assert.equal(retry.waiting, true); assert.ok(flow.pending);
  now += retry.retryAfterMs;
  assert.equal((await flow.poll()).token, 'example-user-token');
});
test('OAuth success remains available for profile retries without consuming the device code twice', async () => {
  let now = 0, exchanges = 0;
  const flow = new DeviceFlow(config, async url => {
    if (url.endsWith('/device/code')) return deviceResponse();
    exchanges++; return new Response(JSON.stringify({ access_token: 'example-user-token', expires_in: 28800 }));
  }, () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  const first = await flow.poll(); now += 10000;
  assert.deepEqual(await flow.poll(), first); assert.equal(exchanges, 1);
  flow.cancel(); await assert.rejects(() => flow.poll(), /取消/);
});
test('concurrent polls never exchange the same device code simultaneously', async () => {
  let now = 0, finish, exchanges = 0;
  const flow = new DeviceFlow(config, async url => {
    if (url.endsWith('/device/code')) return deviceResponse();
    exchanges++; return new Promise(resolve => { finish = resolve; });
  }, () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  const first = flow.poll(); now += 10000;
  assert.equal((await flow.poll()).waiting, true); assert.equal(exchanges, 1);
  finish(new Response(JSON.stringify({ access_token: 'example-user-token' })));
  assert.equal((await first).token, 'example-user-token');
});
test('poll spacing starts after a slow response, not at the request start', async () => {
  let now = 0, exchanges = 0;
  const flow = new DeviceFlow(config, async url => {
    if (url.endsWith('/device/code')) return deviceResponse();
    exchanges++; now += 20000; return new Response(JSON.stringify({ error: 'authorization_pending' }));
  }, () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  await flow.poll(); assert.equal(now, 25000);
  await flow.poll(); assert.equal(exchanges, 1);
  now = 30000; await flow.poll(); assert.equal(exchanges, 2);
});
test('rate limiting honors Retry-After without canceling the authorization', async () => {
  let now = 0;
  const flow = new DeviceFlow(config, async url => url.endsWith('/device/code') ? deviceResponse() : new Response('{}', { status: 429, headers: { 'Retry-After': '90' } }), () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  const result = await flow.poll(); assert.equal(result.retryAfterMs, 90000); assert.ok(flow.pending);
});
test('GitHub-provided slow_down interval takes precedence', async () => {
  let now = 0;
  const flow = new DeviceFlow(config, async url => url.endsWith('/device/code') ? deviceResponse() : new Response(JSON.stringify({ error: 'slow_down', interval: 25 })), () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  assert.equal((await flow.poll()).retryAfterMs, 25000);
});
for (const error of ['unverified_user_email', 'incorrect_client_credentials', 'incorrect_device_code', 'bad_verification_code', 'access_denied', 'device_flow_disabled']) {
  test(`authorization error ${error} is actionable and does not expose raw responses`, async () => {
    let now = 0;
    const flow = new DeviceFlow(config, async url => url.endsWith('/device/code') ? deviceResponse() : new Response(JSON.stringify({ error, error_description: 'sensitive-server-detail' })), () => now);
    await flow.start('Iv1.client-id'); now = 5000;
    await assert.rejects(() => flow.poll(), e => e.code === 'DEVICE_AUTH' && e.message.includes(error) && !e.message.includes('sensitive-server-detail'));
    assert.equal(flow.pending, null);
  });
}
test('canceling a pending code request cannot reopen an abandoned login', async () => {
  let finish;
  const flow = new DeviceFlow(config, async () => new Promise(resolve => { finish = resolve; }));
  const start = flow.start('Iv1.client-id'); flow.cancel(); finish(deviceResponse());
  await assert.rejects(() => start, /取消/); assert.equal(flow.pending, null);
});

test('real installation_missing_access response explains installation and never retries with broader scope', async () => {
  let now = 0; const requests = [];
  const flow = new DeviceFlow(config, async (url, options) => {
    requests.push(JSON.parse(options.body));
    if (url.endsWith('/device/code')) return deviceResponse();
    return new Response(JSON.stringify({ error: 'installation_missing_access', error_description: 'Your app does not have access to the given target.', error_uri: 'https://docs.github.com/' }), { status: 200 });
  }, () => now);
  await flow.start('Iv1.client-id'); now = 5000;
  await assert.rejects(() => flow.poll(), error => {
    assert.equal(error.code, 'DEVICE_INSTALLATION');
    assert.match(error.message, /个人账号授权已完成/);
    assert.match(error.message, /scyf-pmo.github.io/);
    assert.match(error.message, /installation_missing_access/);
    assert.doesNotMatch(error.message, /Your app/);
    return true;
  });
  assert.equal(flow.pending, null);
  await assert.rejects(() => flow.poll(), /取消/);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].repository_id, config.repositoryId);
});

test('unknown OAuth errors include only a safe error code, never arbitrary upstream content', () => {
  const flow = new DeviceFlow(config);
  assert.match(flow.error('new_github_error').message, /new_github_error/);
  for (const value of ['github_pat_sensitive123', '<script>alert(1)</script>', 'x'.repeat(65), { secret: 'do-not-display' }]) {
    assert.equal(flow.error(value).message, 'GitHub 未能完成授权，请将此提示提供给论坛负责人。');
  }
});
test('a second start cannot race and invalidate a code already being requested', async () => {
  let finish;
  const flow = new DeviceFlow(config, async () => new Promise(resolve => { finish = resolve; }));
  const start = flow.start('Iv1.client-id');
  await assert.rejects(() => flow.start('Iv1.client-id'), /重复/);
  finish(deviceResponse()); assert.equal((await start).userCode, 'ABCD-EFGH');
});
test('a signed-in user without repository access remains signed in with a clear warning', async () => {
  const hub = new GitHub(config, { fetcher: async url => url.endsWith('/user') ? new Response(JSON.stringify({ login: 'maintainer', name: '维护者' })) : new Response('{}', { status: 404 }) });
  hub.token = 'example-user-token';
  const identity = await hub.identity();
  assert.equal(identity.login, 'maintainer'); assert.equal(identity.canPublish, false);
  assert.match(identity.permissionMessage, /App 已安装/);
});
