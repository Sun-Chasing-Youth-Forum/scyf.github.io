import { contentPath, assetPath, decode, prepareChanges } from './content.mjs';

export class GitHubError extends Error {
  constructor(message, code = 'NETWORK') { super(message); this.code = code; }
}
export class GitHub {
  constructor(config, { fetcher = fetch } = {}) { this.config = config; this.fetcher = fetcher; this.token = ''; }
  async request(path, method = 'GET', body) {
    let response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, {
        method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SCYF-Website-Manager', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000), redirect: 'error'
      });
    } catch { throw new GitHubError('连接 GitHub 失败或超时。草稿已保留，请检查网络后重试。'); }
    if (response.status === 401) throw new GitHubError('登录已失效，请重新登录 GitHub。', 'AUTH');
    if (response.status === 403 || response.status === 429) {
      if (response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429) throw new GitHubError('GitHub 请求过于频繁，请稍后重试或登录个人账号。', 'RATE');
      throw new GitHubError('GitHub 拒绝该操作。请确认账号具有仓库 Write 权限、令牌 Contents 写权限及组织批准。', 'PERMISSION');
    }
    if (response.status === 404) throw new GitHubError('找不到仓库或无权访问，请检查账号权限。', 'PERMISSION');
    if (response.status === 409 || response.status === 422) throw new GitHubError('GitHub 未接受更新：可能有其他维护者同时发布，或主分支有保护规则。请同步最新内容后重试。', 'CONFLICT');
    if (!response.ok) throw new GitHubError(`GitHub 暂时不可用（${response.status}），草稿已保留。`);
    return response.status === 204 ? null : response.json();
  }
  get base() { return `/repos/${this.config.repository}`; }
  async identity() {
    if (!this.token) return null;
    // A valid personal login and permission to this particular repository are separate states.
    const user = await this.request('/user');
    let repo, permissionMessage = '';
    try { repo = await this.request(this.base); }
    catch (error) {
      if (error.code !== 'PERMISSION') throw error;
      permissionMessage = 'GitHub 登录成功，但当前 App 或账号无权访问网站仓库。请确认 App 已安装到网站仓库，并由负责人授予账号 Write 权限。';
    }
    return { login: user.login, name: user.name || user.login, canPublish: Boolean(repo?.permissions?.push), permissionMessage };
  }
  async head() { return (await this.request(`${this.base}/git/ref/heads/${this.config.branch}`)).object.sha; }
  async snapshot() {
    const sha = await this.head();
    const commit = await this.request(`${this.base}/git/commits/${sha}`);
    const tree = await this.request(`${this.base}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new GitHubError('仓库内容过多，无法完整读取，请联系管理员。');
    const files = Object.fromEntries(tree.tree.filter(f => f.type === 'blob' && (contentPath(f.path) || assetPath(f.path))).map(f => [f.path, f.sha]));
    const paths = Object.keys(files).filter(contentPath);
    const records = [];
    // Public content is read at the exact immutable commit, without sending credentials to another host.
    for (let i = 0; i < paths.length; i += 5) {
      const batch = await Promise.all(paths.slice(i, i + 5).map(async path => {
        let response;
        try { response = await this.fetcher(`https://raw.githubusercontent.com/${this.config.repository}/${sha}/${path}`, { signal: AbortSignal.timeout(25000), redirect: 'error' }); }
        catch { throw new GitHubError('读取网站内容失败，现有草稿已保留，请稍后重试。'); }
        if (!response.ok) throw new GitHubError('无法读取完整的网站内容，请稍后重试。');
        const source = await response.text();
        if (Buffer.byteLength(source) > 512 * 1024) throw new GitHubError('内容过大，暂不支持在管理器中编辑。');
        return decode(path, source);
      }));
      records.push(...batch);
    }
    return { sha, tree: commit.tree.sha, repository: this.config.repository, records, files, fetchedAt: new Date().toISOString(), source: 'remote' };
  }
  async publish(snapshot, changes, message) {
    if (!this.token) throw new GitHubError('请先登录个人 GitHub 账号。', 'AUTH');
    if (snapshot.source !== 'remote' || snapshot.repository !== this.config.repository) throw new GitHubError('请先读取 GitHub 最新内容。离线体验内容不能直接发布。', 'CONFLICT');
    const items = prepareChanges(snapshot, changes);
    const user = await this.identity();
    if (!user.canPublish) throw new GitHubError('该账号没有仓库写权限，请联系论坛负责人。', 'PERMISSION');
    const head = await this.head();
    if (head !== snapshot.sha) throw new GitHubError('另一位维护者已更新网站。此次没有发布任何改动，请同步最新内容；有冲突的草稿会保留。', 'CONFLICT');
    const entries = [];
    for (const item of items) {
      if (item.base64) {
        const blob = await this.request(`${this.base}/git/blobs`, 'POST', { content: item.base64, encoding: 'base64' });
        const { base64, ...rest } = item;
        entries.push({ ...rest, sha: blob.sha });
      } else entries.push(item);
    }
    const tree = await this.request(`${this.base}/git/trees`, 'POST', { base_tree: snapshot.tree, tree: entries });
    const commit = await this.request(`${this.base}/git/commits`, 'POST', { message: String(message || `更新论坛网站内容（${items.length} 项）`).slice(0, 200), tree: tree.sha, parents: [head] });
    try { await this.request(`${this.base}/git/refs/heads/${this.config.branch}`, 'PATCH', { sha: commit.sha, force: false }); }
    catch (error) {
      if (error.code === 'NETWORK') {
        try { if (await this.head() === commit.sha) return { sha: commit.sha, url: `https://github.com/${this.config.repository}/commit/${commit.sha}` }; } catch { /* Keep the original uncertainty. */ }
        throw new GitHubError('发布结果暂时无法确认，请查看发布记录或刷新 GitHub，避免重复提交。草稿已保留。');
      }
      throw error;
    }
    return { sha: commit.sha, url: `https://github.com/${this.config.repository}/commit/${commit.sha}` };
  }
  async deployment(sha) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('版本标识无效。');
    const result = await this.request(`${this.base}/actions/workflows/deploy.yml/runs?head_sha=${sha}&per_page=5`);
    const run = result.workflow_runs.find(r => r.head_sha === sha);
    return run ? { state: run.status, conclusion: run.conclusion, url: run.html_url, name: run.name } : { state: 'pending', conclusion: null };
  }
}

export class DeviceFlow {
  constructor(config, fetcher = fetch, now = () => Date.now()) { this.config = config; this.fetcher = fetcher; this.now = now; this.pending = null; this.generation = 0; this.starting = false; }
  cancel() { this.generation++; this.pending = null; }
  error(name) {
    if (name === 'installation_missing_access') {
      return new GitHubError('个人账号授权已完成，但论坛管理器 App 无权访问网站仓库。请组织负责人将此 App 安装到 scyf-pmo，并仅授权 scyf-pmo.github.io 仓库；完成后重新获取登录码。（installation_missing_access）', 'DEVICE_INSTALLATION');
    }
    const errors = {
      expired_token: '本次登录码已过期，请关闭此窗口后重新登录。',
      token_expired: '本次登录码已过期，请关闭此窗口后重新登录。',
      incorrect_device_code: '本次登录码已失效或已被使用。请关闭旧的授权页，重新获取登录码。',
      bad_verification_code: '本次登录码已失效或已被使用。请关闭旧的授权页，重新获取登录码。',
      access_denied: '此次授权被 GitHub 拒绝。请确认浏览器授权的是当前显示的登录码。',
      incorrect_client_credentials: 'GitHub App 的 Client ID 无效，请联系论坛负责人检查配置。',
      device_flow_disabled: '论坛 GitHub App 尚未启用 Device Flow，请联系论坛负责人开启。',
      unsupported_grant_type: 'GitHub 未接受设备授权请求，请升级管理器。',
      unverified_user_email: '请先在 GitHub 验证个人账号的主要邮箱，再重新登录。'
    };
    // Never surface arbitrary upstream descriptions, which may contain sensitive details.
    const safeCode = typeof name === 'string' && /^[a-z_]{1,64}$/.test(name) ? `（${name}）` : '';
    return new GitHubError(errors[name] ? `${errors[name]}（${name}）` : `GitHub 未能完成授权，请将此提示提供给论坛负责人。${safeCode}`, 'DEVICE_AUTH');
  }
  async post(path, body) {
    let response;
    try { response = await this.fetcher(`https://github.com${path}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error' }); }
    catch { throw new GitHubError('GitHub 登录网络请求失败，请重试。'); }
    if (response.status === 429 || response.status === 403) {
      const error = new GitHubError('GitHub 暂时限制了登录请求，请稍候，程序会自动重试。', 'RATE');
      error.retryAfterMs = Math.min(300000, Math.max(60000, Number(response.headers.get('retry-after') || 0) * 1000));
      throw error;
    }
    if (!response.ok) throw new GitHubError('GitHub 登录服务暂时不可用，请稍候。');
    try {
      const value = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch { throw new GitHubError('未收到完整的 GitHub 授权响应，正在重试。'); }
  }
  async start(clientId) {
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9_.-]{8,100}$/.test(clientId)) throw new Error('请先填写论坛 GitHub App 的公开 Client ID。');
    if (this.starting) throw new Error('正在获取登录码，请勿重复点击。');
    this.cancel(); const generation = this.generation; this.starting = true;
    try {
      const result = await this.post('/login/device/code', { client_id: clientId });
      if (generation !== this.generation) throw new Error('本次登录已取消。');
      if (result.error) throw this.error(result.error);
      if (!result.device_code || !result.user_code || !(Number(result.expires_in) > 0)) throw this.error();
      const interval = Math.max(5, Number(result.interval) || 5) * 1000;
      this.pending = { clientId, code: result.device_code, expires: this.now() + result.expires_in * 1000, interval, next: this.now() + interval, inFlight: false, result: null };
      return { userCode: result.user_code, verificationUrl: 'https://github.com/login/device', expiresIn: result.expires_in, pollAfterMs: interval };
    } finally { this.starting = false; }
  }
  async poll() {
    const p = this.pending;
    if (!p) throw new Error('本次登录已取消，请重新发起登录。');
    // Keep an exchanged token in the main process until profile verification succeeds.
    // Reusing the one-time device code after a temporary /user failure would lose the login.
    if (p.result) return p.result;
    if (this.now() >= p.expires) { this.cancel(); throw this.error('expired_token'); }
    if (p.inFlight || this.now() < p.next) return { waiting: true, retryAfterMs: Math.max(1000, p.next - this.now()) };
    p.inFlight = true;
    try {
      const result = await this.post('/login/oauth/access_token', { client_id: p.clientId, device_code: p.code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', repository_id: this.config.repositoryId });
      if (this.pending !== p) return { waiting: true }; // Canceled login must never restore credentials.
      if (result.error === 'slow_down') p.interval = Math.max(p.interval + 5000, (Number(result.interval) || 0) * 1000);
      p.next = this.now() + p.interval; // Wait after the response, including on slow connections.
      if (['authorization_pending', 'slow_down'].includes(result.error)) return { waiting: true, retryAfterMs: p.interval, message: result.error === 'slow_down' ? 'GitHub 要求降低查询频率，正在继续等待授权…' : '等待浏览器中的授权；完成后此处会自动更新。' };
      if (['server_error', 'temporarily_unavailable'].includes(result.error)) throw new GitHubError('GitHub 登录服务暂时繁忙，正在重试。');
      if (result.error || !result.access_token) { this.cancel(); throw this.error(result.error); }
      p.result = { token: result.access_token, expiresAt: result.expires_in ? this.now() + result.expires_in * 1000 : null };
      return p.result;
    } catch (error) {
      if (this.pending !== p) { if (['DEVICE_AUTH', 'DEVICE_INSTALLATION'].includes(error.code)) throw error; return { waiting: true }; }
      if (!['NETWORK', 'RATE'].includes(error.code)) throw error;
      const delay = Math.max(p.interval, error.retryAfterMs || 10000);
      p.next = this.now() + delay;
      return { waiting: true, retryAfterMs: delay, message: error.message };
    } finally { p.inFlight = false; }
  }
}
