const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const diagnostics = process.argv.includes('--diagnostics');
if (diagnostics) app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'scyf-manager-check-')));
let bootObserved = false, syncObserved = false;
let window, backend, flow, model, state, config, user = null, busy = false, authExpires = null, remembering = false;
const uiFile = path.join(__dirname, '../ui/index.html');
const dataFile = name => path.join(app.getPath('userData'), name);
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function atomic(file, content) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(`${file}.tmp`, content, { mode: 0o600 }); await fs.rename(`${file}.tmp`, file); }
const persist = () => atomic(dataFile('drafts.json'), JSON.stringify(state));
async function auth(token, remember, expiresAt = null) {
  if (typeof token !== 'string' || token.length < 15 || token.length > 1000 || /\s/.test(token)) throw new Error('请输入有效的个人 GitHub 令牌。');
  backend.token = token;
  try { user = await backend.identity(); } catch (error) { backend.token = ''; user = null; throw error; }
  authExpires = expiresAt;
  remembering = Boolean(remember);
  if (remember) {
    if (!safeStorage.isEncryptionAvailable()) { remembering = false; await fs.rm(dataFile('auth.bin'), { force: true }); }
    else await atomic(dataFile('auth.bin'), safeStorage.encryptString(JSON.stringify({ token, expiresAt })));
  } else await fs.rm(dataFile('auth.bin'), { force: true });
  return { user, remembered: remembering };
}
async function handle(method, data = {}) {
  if (method === 'bootstrap') return { config: { ...config, clientId: (await readJson(dataFile('settings.json'), {})).clientId || config.clientId }, state, user, secureStorage: safeStorage.isEncryptionAvailable(), desktop: true };
  if (method === 'open') {
    const u = new URL(data.url);
    if (u.protocol !== 'https:' || !['github.com', 'scyf-pmo.github.io', 'docs.github.com'].includes(u.hostname) || u.username || u.password) throw new Error('此链接不在允许打开的网站列表中。');
    await shell.openExternal(u.href); return true;
  }
  if (method === 'login') return auth(data.token?.trim(), data.remember);
  if (method === 'logout') { backend.token = ''; user = null; authExpires = null; flow.pending = null; await fs.rm(dataFile('auth.bin'), { force: true }); return true; }
  if (method === 'startDevice') {
    const result = await flow.start(data.clientId?.trim());
    await atomic(dataFile('settings.json'), JSON.stringify({ clientId: data.clientId.trim() }));
    remembering = Boolean(data.remember); return result;
  }
  if (method === 'pollDevice') { const result = await flow.poll(); return result.waiting ? result : auth(result.token, remembering, result.expiresAt); }
  if (method === 'cancelDevice') { flow.pending = null; return true; }
  if (method === 'sync') {
    if (busy) throw new Error('正在发布，请稍后再同步。');
    const latest = await backend.snapshot();
    const conflicts = state.changes.filter(c => {
      const old = state.snapshot.records.find(r => r.path === c.path);
      const current = latest.records.find(r => r.path === c.path);
      return model.contentPath(c.path) ? old?.source !== current?.source : Boolean(latest.files[c.path]);
    });
    if (conflicts.length) throw new Error(`以下草稿的对应内容已被其他人修改：${conflicts.map(c => c.label || c.path.split('/').pop()).join('、')}。请先导出草稿，清空草稿后同步，再根据导出内容重新编辑。`);
    state.snapshot = latest; await persist(); return state;
  }
  if (method === 'edit') {
    const existing = state.snapshot.records.find(r => r.path === data.path);
    if (data.create && existing) throw new Error('该日期或名称已存在，请编辑原内容。');
    if (!model.contentPath(data.path)) throw new Error('内容名称无效。');
    const record = existing || model.decode(data.path, '---\n{}\n---\n');
    const content = model.encode(record, data.data, data.body ?? record.body);
    const updated = model.decode(data.path, content);
    const errors = model.validate(updated);
    if (errors.length) throw new Error(errors.join('；'));
    return { record: updated, change: { path: data.path, content, label: data.data.title || `第 ${data.data.issue} 期活动` } };
  }
  if (method === 'saveDrafts') {
    if (busy) throw new Error('正在发布，请稍后保存。');
    if (!Array.isArray(data.changes) || JSON.stringify(data.changes).length > 32 * 1024 * 1024) throw new Error('草稿过大。');
    state.changes = data.changes; await persist(); return true;
  }
  if (method === 'discardDrafts') { if (busy) throw new Error('正在发布，请稍后操作。'); state.changes = []; await persist(); return true; }
  if (method === 'exportDrafts') {
    const { filePath } = await dialog.showSaveDialog(window, { title: '导出本地草稿备份', defaultPath: '逐日论坛草稿.json', filters: [{ name: '草稿备份', extensions: ['json'] }] });
    if (filePath) await fs.writeFile(filePath, JSON.stringify({ repository: config.repository, exportedAt: new Date().toISOString(), base: state.snapshot.sha, changes: state.changes }, null, 2), { mode: 0o600 });
    return Boolean(filePath);
  }
  if (method === 'upload') {
    const { filePaths, canceled } = await dialog.showOpenDialog(window, { title: '选择允许公开的附件（不上传内部论坛手册）', properties: ['openFile'], filters: [{ name: '公开资料', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'zip', 'txt', 'ipynb', 'py'] }] });
    if (canceled) return null;
    const file = filePaths[0], stat = await fs.stat(file);
    if (!stat.size || stat.size > 5 * 1024 * 1024) throw new Error('附件大小应为 1 字节至 5 MB。');
    const ext = path.extname(file).toLowerCase();
    const name = path.basename(file, ext).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'resource';
    const dest = `public/${['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'images' : 'documents'}/${name}-${Date.now()}${ext}`;
    if (!model.assetPath(dest) || /手册|内部|账号|密码|handbook|secret|internal/i.test(path.basename(file))) throw new Error('不支持在此上传内部手册或敏感文件。请只选择已确认适合公开的资料。');
    return { path: dest, base64: (await fs.readFile(file)).toString('base64'), label: path.basename(file), size: stat.size };
  }
  if (method === 'publish') {
    if (busy) throw new Error('正在发布，请勿重复点击。');
    if (!data.confirmed) throw new Error('请确认已检查本次公开内容。');
    if (authExpires && Date.now() >= authExpires) { backend.token = ''; user = null; throw new Error('登录已到期，请重新登录。'); }
    busy = true;
    try {
      const result = await backend.publish(state.snapshot, state.changes, data.message);
      state.lastPublish = { ...result, at: new Date().toISOString() };
      state.changes = [];
      // Persist successful submission before the optional refresh; refresh failure must not look like publication failure.
      await persist();
      try { state.snapshot = await backend.snapshot(); await persist(); } catch { result.refreshPending = true; }
      return { ...result, state };
    } finally { busy = false; }
  }
  if (method === 'deployment') return backend.deployment(data.sha);
  throw new Error('未知操作。');
}
app.whenReady().then(async () => {
  config = await readJson(path.join(__dirname, '../app-config.json'), null);
  model = await import('../core/content.mjs');
  const { GitHub, DeviceFlow } = await import('../core/github.mjs');
  // Chromium's network stack follows the user's OS proxy and certificate configuration.
  const fetcher = async (url, options) => {
    const response = await net.fetch(url, options);
    if (diagnostics) console.log('network:', new URL(url).hostname, response.status);
    return response;
  };
  backend = new GitHub(config, { fetcher }); flow = new DeviceFlow(config, fetcher);
  const sample = await readJson(path.join(__dirname, '../ui/sample.json'), null);
  state = await readJson(dataFile('drafts.json'), { snapshot: sample, changes: [], lastPublish: null });
  if (state.snapshot?.repository !== config.repository || !Array.isArray(state.changes)) state = { snapshot: sample, changes: [], lastPublish: null };
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const saved = JSON.parse(safeStorage.decryptString(await fs.readFile(dataFile('auth.bin'))));
      if (!saved.expiresAt || saved.expiresAt > Date.now()) await auth(saved.token, true, saved.expiresAt);
      else await fs.rm(dataFile('auth.bin'), { force: true });
    }
  } catch { backend.token = ''; user = null; }
  window = new BrowserWindow({ show: !diagnostics, width: 1440, height: 960, minWidth: 960, minHeight: 700, backgroundColor: '#f5f6f2', title: '逐日青年论坛 · 网站管理器', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, navigateOnDragDrop: false } });
  if (diagnostics) window.webContents.on('console-message', (_event, ...args) => console.log('renderer:', ...args));
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type: 'question', buttons: ['继续编辑', '放弃未保存表单并退出'], defaultId: 0, cancelId: 0, message: busy ? '正在发布，请等待操作完成。' : '当前表单尚未保存，是否退出？', detail: '已经保存的本地草稿不会丢失。' });
    if (!busy && choice === 1) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ipcMain.handle('manager', async (event, request) => {
    if (diagnostics) console.log('ipc:', request.method, event.senderFrame?.url, pathToFileURL(uiFile).href);
    if (event.sender !== window.webContents || event.senderFrame?.routingId !== window.webContents.mainFrame.routingId || event.senderFrame?.processId !== window.webContents.mainFrame.processId || event.senderFrame?.url !== pathToFileURL(uiFile).href) return { ok: false, error: '无效的请求来源。' };
    try {
      const value = await handle(request.method, request.data);
      if (request.method === 'bootstrap') bootObserved = true;
      if (request.method === 'sync') syncObserved = true;
      return { ok: true, value };
    }
    catch (error) {
      if (diagnostics) console.log('operation-error:', request.method, error.code, error.message);
      if (error.code === 'AUTH') { backend.token = ''; user = null; await fs.rm(dataFile('auth.bin'), { force: true }); }
      return { ok: false, error: error.message || '操作失败，草稿已保留。', code: error.code };
    }
  });
  await window.loadFile(uiFile);
  if (diagnostics) setTimeout(() => { console.log(JSON.stringify({ bootstrap: bootObserved, synced: syncObserved, source: state.snapshot.source, records: state.snapshot.records.length })); app.exit(bootObserved && syncObserved ? 0 : 1); }, 45000);
}).catch(error => { dialog.showErrorBox('启动失败', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
