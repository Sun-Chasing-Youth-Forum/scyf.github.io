/* The renderer never receives saved credentials or performs authenticated network calls. */
const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const labels = { events: '活动日程', news: '通知公告', training: '培训资料', about: '关于论坛', overview: '网站概览', assets: '公开附件', history: '发布记录', settings: '设置与账号', issue: '期数', date: '日期', time: '时间', host: '主持人', speaker: '报告人', affiliation: '报告人单位', title: '标题', summary: '摘要', reportType: '报告类型', location: '地点', meetingUrl: '线上会议链接', meetingNumber: '腾讯会议号', status: '状态', sessions: '邀请报告', materials: '相关资料', resources: '资源链接', pinned: '首页置顶', tags: '标签', category: '培训分类', order: '排序', body: '正文', type: '报告类型' };
const reportTypes = ['工作进展', '研究动态', '研究动态与工作进展', '技能交流', '报告演练', '课程讲习', '工作会议', '其他'];
const categories = ['ASO-S', 'HXI', 'SDO', 'Solar Orbiter / STIX', 'SSWIDL', 'Python / SunPy', '数据分析教程'];
const dateText = value => value ? String(value).replace(/-/g, '.') : '待定';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
const plusDays = (day, number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + number); return d.toISOString().slice(0, 10); };
const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const eventTitle = d => d.title || (d.sessions || []).map(s => s.title).filter(Boolean).join('；') || '报告题目待更新';
const eventSpeaker = d => d.speaker || (d.sessions || []).map(s => s.speaker).filter(Boolean).join('、') || '报告人待定';
const titleOf = r => r.kind === 'events' ? `第 ${r.data.issue} 期 · ${eventTitle(r.data)}` : r.data.title || '未命名内容';
function badge(status, draft = false) { return `<span class="badge ${draft ? 'draft' : status === '已公布' ? 'announced' : status === '待定' ? 'pending' : ''}">${esc(draft ? '草稿' : status)}</span>`; }
let state, user, config, desktop = false, current = 'overview', selected = null, isNew = false, dirty = false, working = false, search = '', filter = '', timer, deviceTimer, selectedTab = 'all';
let secureStorage = false;
async function demoBridge() {
  const snapshot = await (await fetch('sample.json')).json();
  let saved;
  try { saved = JSON.parse(localStorage.getItem('scyf-preview-drafts')); } catch { /* First visit. */ }
  let demo = { snapshot, changes: saved || [], lastPublish: null };
  const unavailable = async () => { throw new Error('浏览器中是离线界面预览。请打开桌面版连接 GitHub 和发布。'); };
  return {
    bootstrap: async () => ({ state: demo, user: null, desktop: false, config: { repository: snapshot.repository, siteUrl: 'https://scyf-pmo.github.io/', clientId: '' }, secureStorage: false }),
    edit: async ({ path, data, body }) => {
      if (path.includes('/events/') && (!data.issue || !data.date || !data.host || !data.location || !data.time)) throw new Error('请填写期数、日期、主持人、地点和时间。');
      if (!path.includes('/events/') && !data.title?.trim()) throw new Error('请填写标题。');
      const original = snapshot.records.find(r => r.path === path);
      const content = original && JSON.stringify(data) === JSON.stringify(original.data) && body === original.body ? original.source : `---\n${JSON.stringify(data, null, 2)}\n---\n${body}`;
      const record = { path, kind: path.split('/')[2], data, body, source: content };
      return { record, change: { path, content, label: data.title || `第 ${data.issue} 期活动` } };
    },
    saveDrafts: async ({ changes }) => { localStorage.setItem('scyf-preview-drafts', JSON.stringify(changes)); demo.changes = changes; return true; },
    discardDrafts: async () => { localStorage.removeItem('scyf-preview-drafts'); demo.changes = []; },
    exportDrafts: async () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ repository: config.repository, changes: demo.changes }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = '逐日论坛体验草稿.json'; link.click(); URL.revokeObjectURL(url); return true;
    },
    open: async ({ url }) => { window.open(url, '_blank', 'noopener,noreferrer'); },
    sync: unavailable, login: unavailable, logout: async () => true, startDevice: unavailable, pollDevice: unavailable, cancelDevice: async () => true, publish: unavailable, upload: unavailable, deployment: unavailable
  };
}
let api;
function records(kind) {
  const map = new Map(state.snapshot.records.map(r => [r.path, r]));
  for (const c of state.changes) {
    if (c.deleted) map.delete(c.path);
    else if (c.record) map.set(c.path, c.record);
  }
  return [...map.values()].filter(r => !kind || r.kind === kind);
}
function nextEvent() { return records('events').filter(r => r.data.date >= today() && r.data.status !== '已结束').sort((a, b) => a.data.date.localeCompare(b.data.date))[0]; }
function toast(message, error = false) {
  clearTimeout(timer); const el = $('#toast'); el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  timer = setTimeout(() => { el.hidden = true; }, error ? 14000 : 5000);
}
function navigation() {
  const menu = [['overview', '◫'], ['events', '▦'], ['news', '☷'], ['training', '◇'], ['assets', '↥'], ['about', '◎'], ['history', '◷'], ['settings', '⚙']];
  $('#navigation').innerHTML = menu.map(([key, icon], index) => `${index === 6 ? '<div class="nav-divider"></div>' : ''}<button class="${current === key ? 'active' : ''}" data-nav="${key}" title="${labels[key]}" ${current === key ? 'aria-current="page"' : ''}><span class="nav-icon">${icon}</span><span class="nav-label">${labels[key]}</span></button>`).join('');
  $('#breadcrumb').textContent = `工作台 / ${labels[current]}${selected ? ' / 内容编辑' : ''}`;
  $('#connection').textContent = state.snapshot.source === 'remote' ? '已读取 GitHub' : '离线体验';
  $('#connection').className = `connection${state.snapshot.source === 'remote' ? ' connected' : ''}`;
  $('#account').textContent = user ? `${user.login}${user.canPublish ? '' : ' · 只读'}` : '登录 GitHub';
  $('#draft-count').textContent = state.changes.length;
  $('#save-state').textContent = dirty ? '当前表单尚未保存，请先保存草稿。' : state.changes.length ? `${state.changes.length} 项改动已保存于本机，尚未发布。` : `网站内容源：scyf-pmo.github.io · ${state.snapshot.source === 'remote' ? '读取于 ' + stamp(state.snapshot.fetchedAt) : '内置公开内容快照'}`;
  $('#publish-button').disabled = working;
}
function heading(title, intro, actions = '') { return `<div class="page-heading"><div><p class="eyebrow">SUN-CHASING YOUTH FORUM</p><h1>${esc(title)}</h1><p>${esc(intro)}</p></div><div class="heading-actions">${actions}</div></div>`; }
function overview() {
  const upcoming = nextEvent();
  const events = records('events');
  const upcomingList = events.filter(r => r.data.date >= today()).sort((a, b) => a.data.date.localeCompare(b.data.date)).slice(0, 5);
  return heading('让每一次交流，准时抵达。', '在这里整理论坛内容，把更多时间留给科学与交流。', '<button class="button secondary" data-action="new" data-kind="events">＋ 新建活动</button>') +
  `<div class="hero-grid"><section class="next-card"><div class="next-kicker"><span>NEXT SESSION · 下一期活动</span>${badge(upcoming?.data.status || '筹备中')}</div>${upcoming ? `<div class="next-main"><div class="date-block"><strong>${esc(upcoming.data.date.slice(8))}</strong><span>${esc(upcoming.data.date.slice(0, 7).replace('-', ' / '))}</span></div><div class="next-copy"><p>第 ${esc(upcoming.data.issue)} 期逐日青年论坛</p><h2>${esc(upcoming.data.title || '报告内容待更新')}</h2><p>主持人 ${esc(upcoming.data.host)}　·　${esc(upcoming.data.time)}</p><p>${esc(upcoming.data.location)}</p></div></div><div class="next-bottom"><span>${upcoming.data.speaker ? '报告人 ' + esc(upcoming.data.speaker) : '补充报告信息后，即可预览并发布。'}</span><button class="text-button" data-action="edit" data-path="${esc(upcoming.path)}">编辑本期 →</button></div>` : '<div class="empty">新一期活动正在筹备。<br>点击“新建活动”开始安排。</div>'}</section>
  <section class="check-card"><h2>三步，完成一次更新</h2><ol class="steps"><li><span class="step-num">1</span><span>读取最新内容<br>与其他维护者保持同步</span></li><li><span class="step-num">2</span><span>填写表单，保存本地草稿<br>确认报告、日期与完整摘要</span></li><li><span class="step-num">3</span><span>预览修改，再发布到网站<br>部署完成后即可对外访问</span></li></ol><p class="subtle">${desktop ? '当前草稿仅保存在此电脑，发布后才会同步。' : '当前为浏览器离线预览；桌面版支持真实登录和发布。'}</p></section></div>
  <div class="stats"><div class="stat"><span>活动日程</span><strong>${events.length}<small> 期</small></strong></div><div class="stat"><span>通知公告</span><strong>${records('news').length}</strong></div><div class="stat"><span>培训资料</span><strong>${records('training').length}</strong></div><div class="stat"><span>待发布改动</span><strong>${state.changes.length}</strong></div></div>
  <div class="section-header"><h2>即将到来的活动</h2><button class="text-button" data-nav="events">全部日程 →</button></div>${eventTable(upcomingList)}`;
}
function eventTable(rows) {
  return `<div class="panel table-wrap"><table><thead><tr><th>期数</th><th>活动 / 报告题目</th><th>日期</th><th>主持人</th><th>状态</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td class="issue">第 ${esc(r.data.issue)} 期</td><td class="title-cell">${esc(eventTitle(r.data))}<small>${esc(eventSpeaker(r.data))}</small></td><td>${dateText(r.data.date)}</td><td>${esc(r.data.host)}</td><td>${badge(r.data.status)} ${state.changes.some(c => c.path === r.path) ? badge('', true) : ''}</td><td><button class="text-button" data-action="edit" data-path="${esc(r.path)}">编辑 →</button></td></tr>`).join('')}</tbody></table>${rows.length ? '' : '<div class="empty">暂无符合条件的活动。</div>'}</div>`;
}
function listPage(kind) {
  const names = { events: '维护每一期活动的时间、报告信息和资料。', news: '发布论坛通知，向大家传递最新安排。', training: '整理数据、软件与分析教程。', about: '维护论坛简介、组织方式和公开联系信息。' };
  const filtered = records(kind).filter(r => !search || `${JSON.stringify(r.data)} ${r.body}`.toLowerCase().includes(search.toLowerCase())).filter(r => !filter || (kind === 'events' ? r.data.status : r.data.category) === filter);
  filtered.sort((a, b) => kind === 'events' || kind === 'news' ? String(b.data.date).localeCompare(String(a.data.date)) : (a.data.order || 100) - (b.data.order || 100));
  return heading(labels[kind], names[kind], `<button class="button" data-action="new" data-kind="${kind}">＋ 新建${kind === 'events' ? '活动' : kind === 'news' ? '通知' : kind === 'training' ? '资料' : '介绍'}</button>`) +
    `<div class="toolbar"><input class="search" id="search" aria-label="搜索内容" placeholder="搜索题目、报告人或内容…" value="${esc(search)}">${['events', 'training'].includes(kind) ? `<select id="filter" aria-label="筛选内容"><option value="">${kind === 'events' ? '全部状态' : '全部分类'}</option>${(kind === 'events' ? ['待定', '已公布', '已结束'] : categories).map(v => `<option ${filter === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}<span class="filter-label">${filtered.length} 项内容</span></div>` + (kind === 'events' ? eventTable(filtered) : `<div class="card-grid">${filtered.map(r => `<article class="content-card"><p class="eyebrow">${esc(r.data.category || (kind === 'news' ? dateText(r.data.date) : 'ABOUT THE FORUM'))}</p><h3>${esc(r.data.title)}</h3><p>${esc(r.data.summary || r.body.trim().slice(0, 130))}</p><div class="content-card-footer"><span>${state.changes.some(c => c.path === r.path) ? badge('', true) : '<span class="subtle">已收录</span>'}</span><button class="text-button" data-action="edit" data-path="${esc(r.path)}">编辑内容 →</button></div></article>`).join('')}</div>${filtered.length ? '' : '<div class="empty">暂无内容，点击右上角新建。</div>'}`);
}
function input(key, value, { required = false, type = 'text', full = false, rows = 0, options = null, hint = '', label = labels[key], prefix = '' } = {}) {
  const name = prefix + key;
  return `<label class="field ${full ? 'full' : ''}"><span>${esc(label || key)}${required ? ' <span class="required">*</span>' : ''}</span>${options ? `<select name="${name}">${!required ? '<option value="">暂不填写</option>' : ''}${options.map(v => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>` : rows ? `<textarea name="${name}" rows="${rows}" ${required ? 'required' : ''}>\n${esc(value)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${key === 'issue' ? 'min="1" step="1"' : ''}>`}${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}</label>`;
}
function resourcesField(r) {
  const key = r.kind === 'training' ? 'resources' : 'materials';
  const stagedAssets = state.changes.filter(c => c.base64);
  const options = [...stagedAssets.map(c => c.path.replace(/^public/, '')), ...Object.keys(state.snapshot.files).filter(p => p.startsWith('public/')).map(p => p.replace(/^public/, ''))];
  return `<div class="form-card"><h2>相关公开资料 <button type="button" class="text-button" data-action="add-link">＋ 添加链接</button></h2><p class="subtle">可先在“公开附件”上传文件，再从链接输入框中选择。仅上传适合公开的资料。</p><datalist id="asset-paths">${options.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>${(r.data[key] || []).map((link, index) => `<div class="row-form ${r.kind === 'training' ? 'training' : ''}"><input name="link.${index}.label" aria-label="资料 ${index + 1} 名称" placeholder="资料名称" value="${esc(link.label)}">${r.kind === 'training' ? `<select name="link.${index}.type" aria-label="资料类型">${['PDF', '外部链接', '代码', '下载'].map(v => `<option ${v === link.type ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}<input name="link.${index}.url" list="asset-paths" aria-label="资料 ${index + 1} 链接" placeholder="https:// 或选择已上传资料" value="${esc(link.url)}"><button type="button" class="delete-mini" data-action="remove-link" data-index="${index}" aria-label="移除资料 ${index + 1}">×</button></div>`).join('')}</div>`;
}
function editor() {
  const r = selected, d = r.data;
  let fields = '';
  if (r.kind === 'events') {
    fields = `<div class="form-card"><h2>基本安排 <span class="subtle">带 * 的项目为必填</span></h2><div class="form-grid">${input('issue', d.issue, { required: true, type: 'number' })}${input('status', d.status, { required: true, options: ['待定', '已公布', '已结束'] })}${input('date', d.date, { required: true, type: 'date' })}${input('time', d.time, { required: true })}${input('host', d.host, { required: true })}${input('reportType', d.reportType, { options: reportTypes })}${input('location', d.location, { required: true, full: true })}${input('meetingNumber', d.meetingNumber)}${input('meetingUrl', d.meetingUrl, { type: 'url' })}</div></div>
    <div class="form-card"><h2>活动主题与总览</h2><div class="form-grid">${input('title', d.title, { full: true, hint: '内容尚未确定可留空，网站将显示“待更新”。' })}${input('speaker', d.speaker)}${input('affiliation', d.affiliation)}${input('summary', d.summary, { full: true, rows: 7, label: '活动摘要 / 单场报告摘要', hint: '保留摘要完整内容，支持换行。多场报告请在下面逐一填写。' })}</div></div>
    <div class="form-card"><h2>分场报告 <button type="button" class="text-button" data-action="add-session">＋ 添加报告</button></h2>${(d.sessions || []).length ? '' : '<p class="subtle">同一期有多位报告人时，可以分别填写每个报告的时间、题目和完整摘要。</p>'}${(d.sessions || []).map((s, i) => `<div class="nested-card"><h3>报告 ${i + 1}<button type="button" class="text-button" data-action="remove-session" data-index="${i}">移除</button></h3><div class="form-grid">${input('speaker', s.speaker, { required: true, prefix: `session.${i}.` })}${input('affiliation', s.affiliation, { prefix: `session.${i}.` })}${input('time', s.time, { prefix: `session.${i}.` })}${input('type', s.type, { options: reportTypes, prefix: `session.${i}.` })}${input('title', s.title, { required: true, full: true, prefix: `session.${i}.` })}${input('summary', s.summary, { full: true, rows: 8, prefix: `session.${i}.` })}</div></div>`).join('')}</div>${resourcesField(r)}`;
  } else {
    fields = `<div class="form-card"><h2>内容信息</h2><div class="form-grid">${input('title', d.title, { required: true, full: true })}${r.kind === 'news' ? `${input('date', d.date, { required: true, type: 'date' })}<label class="inline-check"><input type="checkbox" name="pinned" ${d.pinned ? 'checked' : ''}> 置顶标记（展示方式以网站为准）</label>${input('tags', (d.tags || []).join('，'), { full: true, hint: '多个标签用逗号分隔。' })}` : `${r.kind === 'training' ? input('category', d.category, { required: true, options: categories }) : ''}${input('order', d.order ?? 100, { type: 'number', hint: '数字越小，显示越靠前。' })}`}${r.kind !== 'about' ? input('summary', d.summary, { required: true, full: true, rows: 6 }) : ''}</div></div>${r.kind === 'training' ? resourcesField(r) : ''}`;
  }
  return heading(isNew ? `新建${r.kind === 'events' ? '活动' : '内容'}` : `编辑${r.kind === 'events' ? `第 ${d.issue} 期活动` : labels[r.kind]}`, '保存后进入本地草稿；预览并发布后才会更新正式网站。', `<button class="button secondary" data-action="back">返回列表</button><button class="button" data-action="save">保存草稿</button>`) +
    `<div class="editor-grid"><form id="editor-form">${fields}<div class="form-card"><h2>${r.kind === 'events' ? '补充说明' : '正文'}</h2>${input('body', r.body, { rows: 10, label: '正文内容', hint: '支持 Markdown 标题和列表；现有格式会保留。编辑器右侧为文字预览。' })}</div><div class="heading-actions">${r.kind === 'events' ? '<button type="button" class="button secondary" data-action="duplicate">复制为新一期</button>' : ''}${!isNew ? '<button type="button" class="button danger" data-action="delete">删除这项内容</button>' : ''}</div></form><aside class="preview-card"><div class="preview-top"><span>内容预览</span><span>保存前可随时调整</span></div><div id="live-preview" class="preview-body">${preview(r)}</div><div class="preview-note">展示完整文字；正式网站的排版以部署结果为准。</div></aside></div>`;
}
function preview(r) {
  const d = r.data;
  return `${r.kind === 'events' ? `<p class="eyebrow">第 ${esc(d.issue)} 期逐日青年论坛</p>${badge(d.status)}` : '<p class="eyebrow">逐日青年论坛</p>'}<h2>${esc(d.title || '报告题目待更新')}</h2>${r.kind === 'events' ? `<dl><dt>时间</dt><dd>${dateText(d.date)} ${esc(d.time)}</dd><dt>主持人</dt><dd>${esc(d.host || '待定')}</dd><dt>报告人</dt><dd>${esc(d.speaker || '待定')}</dd><dt>单位</dt><dd>${esc(d.affiliation || '待定')}</dd><dt>地点</dt><dd>${esc(d.location)}</dd></dl>` : ''}${d.summary ? `<h3>摘要</h3><p>${esc(d.summary)}</p>` : ''}${(d.sessions || []).map((s, i) => `<h3>报告 ${i + 1} · ${esc(s.title || '待定')}</h3><p>${esc(s.time)}　${esc(s.speaker)} · ${esc(s.affiliation)}</p><p>${esc(s.summary || '摘要待更新')}</p>`).join('')}${r.body.trim() ? `<h3>${r.kind === 'events' ? '补充说明' : '正文'}</h3><p>${esc(r.body.trim())}</p>` : ''}${(d.materials || d.resources || []).length ? `<h3>相关资料</h3>${(d.materials || d.resources).map(l => `<p>↗ ${esc(l.label)}</p>`).join('')}` : ''}`;
}
function readEditor() {
  const form = $('#editor-form'); if (!form || !selected) return selected;
  const record = clone(selected);
  for (const el of form.elements) {
    if (!el.name) continue;
    let value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? undefined : Number(el.value)) : el.value;
    if (el.name === 'body') { if (record.body.replace(/\r\n/g, '\n') !== value) record.body = value; continue; }
    if (el.name === 'tags') value = value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const parts = el.name.split('.');
    if (parts[0] === 'session') { const s = record.data.sessions[Number(parts[1])]; if (value === '') delete s[parts[2]]; else s[parts[2]] = value; }
    else if (parts[0] === 'link') { record.data[record.kind === 'training' ? 'resources' : 'materials'][Number(parts[1])][parts[2]] = value; }
    else if (value === '' || value === undefined) delete record.data[el.name];
    else record.data[el.name] = value;
  }
  return record;
}
function settings() {
  return heading('账号与连接', '每位维护者使用自己的 GitHub 账号；论坛负责人统一管理仓库权限。') +
  `${!desktop ? '<div class="notice">当前是离线界面预览。登录、附件选择和真实发布在桌面版中使用。</div>' : ''}
  <div class="settings-grid"><section class="form-card"><h2>${user ? '当前账号' : '登录 GitHub'}</h2>${user ? `<h3>${esc(user.name)}</h3><p>@${esc(user.login)} · ${user.canPublish ? '已确认仓库 Write 权限；最终发布还取决于令牌权限和分支规则。' : '只读权限。请联系论坛负责人加入维护团队。'}</p><button class="button secondary" data-action="logout">退出登录</button><p class="subtle">退出会移除本机保存的登录凭据，本地内容草稿仍保留。</p>` : `<p>推荐使用论坛 GitHub App 授权。在浏览器确认个人身份后即可返回管理器。</p>${input('clientId', config.clientId, { label: '论坛 GitHub App 的 Client ID', hint: '由论坛负责人首次提供；这是公开标识，不是密码。' })}<label class="inline-check"><input type="checkbox" id="remember-device" ${secureStorage ? 'checked' : ''} ${secureStorage ? '' : 'disabled'}> 安全保存登录（使用系统加密）</label><button class="button" data-action="device-login">通过浏览器登录 ↗</button><details ${config.clientId ? '' : 'open'}><summary>初版可用：个人细粒度令牌登录</summary><p>选择 scyf-pmo 组织和网站仓库，授予 Contents 读写、Actions 只读。若组织要求审批，需先由管理员批准。</p><label class="field">个人访问令牌<input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label><label class="inline-check"><input type="checkbox" id="remember-token" ${secureStorage ? 'checked' : ''} ${secureStorage ? '' : 'disabled'}> 使用系统加密记住登录</label><div class="heading-actions"><button class="button secondary" data-action="token-login">验证并登录</button><button class="text-button" data-action="open-token">前往 GitHub 创建 →</button></div></details>`}</section>
  <section class="form-card"><h2>当前管理的网站</h2><p>逐日青年论坛<br><strong>https://scyf-pmo.github.io/</strong></p><p>内容来源<br><code>${esc(config.repository)}</code></p><p>登录不代表拥有发布权限。请由论坛负责人把维护者加入拥有 Write 权限的团队。</p><div class="notice success">本地草稿 → 预览确认 → 提交 GitHub → 自动部署</div><h2>本机草稿</h2><p>草稿保存在当前电脑，不会随登录自动同步给其他维护者。清空前可导出备份。</p><div class="heading-actions"><button class="button secondary" data-action="export">导出草稿备份</button><button class="text-button" data-action="discard">清空草稿</button></div><p class="subtle">初版的过期登录需要重新授权。程序不保存 App Secret、SSH 私钥或共享令牌。</p></section></div>`;
}
function assets() {
  const existing = Object.keys(state.snapshot.files).filter(p => p.startsWith('public/')).map(path => ({ path, label: path.split('/').pop() }));
  const staged = state.changes.filter(c => c.base64);
  return heading('公开附件', '上传报告幻灯片、培训手册、图片或示例代码，再把链接添加到相应活动或培训资料。', '<button class="button" data-action="upload">＋ 添加公开附件</button>') + `<div class="notice">每个附件最大 5 MB。上传后需要与内容一起发布。请先确认资料适合公开，不上传内部论坛手册、账号或密码。</div><div class="panel">${[...staged, ...existing].map(c => `<div class="attachment"><div><strong>${esc(c.label)}</strong><code>${esc(c.path.replace(/^public/, ''))}</code></div><div>${c.base64 ? `${badge('待发布', true)} <button class="text-button" data-action="undo" data-path="${esc(c.path)}">移出草稿</button>` : '<span class="subtle">已发布</span>'}</div></div>`).join('') || '<div class="empty">尚无公开附件。上传后将显示可选择的资料链接。</div>'}</div>`;
}
function history() {
  const last = state.lastPublish;
  return heading('发布记录', '提交成功与网站部署成功是两个阶段；可以在此核对本机最近一次发布。') + (last ? `<div class="form-card"><p class="eyebrow">LAST PUBLICATION</p><h2>最近一次更新</h2><p>${stamp(last.at)}</p><p class="subtle">版本 ${esc(last.sha.slice(0, 7))}</p><div id="deploy-status" class="notice">已提交 GitHub，点击检查部署状态。</div><div class="heading-actions"><button class="button" data-action="check-deploy">检查部署状态</button><button class="button secondary" data-action="open-commit">查看此次提交 ↗</button><button class="text-button" data-action="website">打开正式网站 →</button></div></div>` : '<div class="panel empty">这台电脑尚未发布过更新。<br>完成首次发布后，这里会显示提交和部署状态。</div>');
}
function render() {
  navigation();
  $('#main').innerHTML = selected ? editor() : current === 'overview' ? overview() : current === 'settings' ? settings() : current === 'assets' ? assets() : current === 'history' ? history() : listPage(current);
}
function confirmLeave() { return !dirty || window.confirm('当前表单尚未保存。确定放弃这部分编辑吗？已保存的草稿仍会保留。'); }
function navigate(page) { if (!confirmLeave()) return; current = page; selected = null; dirty = false; search = ''; filter = ''; render(); window.scrollTo(0, 0); }
function openRecord(path) { if (!confirmLeave()) return; const record = records().find(r => r.path === path); if (!record) return; selected = clone(record); current = record.kind; isNew = false; dirty = false; render(); window.scrollTo(0, 0); }
function newRecord(kind, copy = null) {
  if (!copy && !confirmLeave()) return;
  const allEvents = records('events').sort((a, b) => b.data.date.localeCompare(a.data.date));
  const date = allEvents.length ? plusDays(allEvents[0].data.date < today() ? today() : allEvents[0].data.date, 14) : today();
  const issue = Math.max(0, ...allEvents.map(r => r.data.issue)) + 1;
  let data = kind === 'events' ? { issue, date, time: '09:30–12:00', host: '', location: '紫金山天文台 3 号楼 402 会议室', status: '待定', materials: [], sessions: [] } : kind === 'news' ? { title: '', date: today(), summary: '', tags: [], pinned: false } : kind === 'training' ? { title: '', category: '数据分析教程', summary: '', order: 100, resources: [] } : { title: '', order: 100 };
  if (copy) data = { ...clone(copy.data), issue, date, status: '待定' };
  selected = { kind, path: '', data, body: copy?.body || '\n', source: '---\n{}\n---\n' };
  current = kind; isNew = true; dirty = true; render(); window.scrollTo(0, 0);
}
async function saveEditor() {
  const form = $('#editor-form'); if (!form?.reportValidity()) return false;
  const record = readEditor();
  if (isNew && !record.path) record.path = `src/content/${record.kind}/${record.kind === 'events' ? record.data.date : record.kind + '-' + Date.now()}.md`;
  if (isNew && records().some(r => r.path === record.path)) throw new Error('这个日期已有活动，请编辑原活动或选择不同日期。');
  const result = await api.edit({ ...record, create: isNew });
  const baseline = state.snapshot.records.find(r => r.path === record.path);
  const next = state.changes.filter(c => c.path !== record.path);
  if (baseline?.source !== result.change.content) next.push({ ...result.change, record: result.record });
  await api.saveDrafts({ changes: next }); state.changes = next;
  selected = result.record; isNew = false; dirty = false; render(); toast('草稿已保存。预览并发布后才会更新正式网站。'); return true;
}
function formatValue(value) {
  if (value === undefined || value === '' || value === null) return '未填写';
  if (Array.isArray(value)) return value.length ? value.map((v, i) => typeof v === 'object' ? `${i + 1}. ` + Object.entries(v).map(([k, val]) => `${labels[k] || (k === 'label' ? '名称' : k === 'url' ? '链接' : k)}：${val}`).join('\n') : v).join('\n\n') : '无';
  return typeof value === 'boolean' ? value ? '是' : '否' : String(value);
}
function changePreview(c) {
  const old = state.snapshot.records.find(r => r.path === c.path);
  if (c.base64) return `<div class="change-title">${badge('新增附件')} ${esc(c.label)}</div><p class="subtle">${esc(c.path.replace(/^public/, ''))} · ${(c.size / 1024).toFixed(0)} KB</p>`;
  if (c.deleted) return `<div class="change-title">${badge('删除')} ${esc(old ? titleOf(old) : c.label)}</div><div class="notice error">发布后将从网站移除这项内容。保存在 GitHub 中的历史版本仍可恢复。</div>`;
  const record = c.record;
  const pairs = [...new Set([...Object.keys(old?.data || {}), ...Object.keys(record?.data || {})])].map(k => [k, old?.data[k], record?.data[k]]);
  pairs.push(['body', old?.body, record?.body]);
  return `<div class="change-title">${badge(old ? '修改' : '新增')} ${esc(record ? titleOf(record) : c.label)}</div>${pairs.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b)).map(([key, a, b]) => `<div class="diff"><div class="diff-label">${esc(labels[key] || key)}</div><div class="diff-columns"><div><span class="diff-header">修改前</span>${esc(formatValue(a))}</div><div><span class="diff-header">修改后</span>${esc(formatValue(b))}</div></div></div>`).join('')}`;
}
function showReview() {
  if (dirty) { toast('请先保存当前表单，再预览改动。', true); return; }
  if (!state.changes.length) { toast('还没有待发布改动。可以先编辑一期活动并保存草稿。'); return; }
  const allowed = desktop && user?.canPublish && state.snapshot.source === 'remote';
  $('#modal-content').innerHTML = `<div class="modal-head"><div><p class="eyebrow">REVIEW CHANGES</p><h2>预览 ${state.changes.length} 项改动</h2></div><button class="close" data-action="close-modal" aria-label="关闭预览">×</button></div><div class="modal-body">${allowed ? '<div class="notice success">发布前会再次检查远端版本，确认没有其他维护者的更新被覆盖。</div>' : `<div class="notice">${!desktop ? '这是离线预览，不能发布到正式网站。' : !user ? '请先到“设置与账号”登录 GitHub。草稿已保留。' : !user.canPublish ? '当前账号只有只读权限，请联系论坛负责人。' : '请先读取 GitHub 最新内容。未冲突的草稿会继续保留。'}</div>`}${state.changes.map(c => `<section>${changePreview(c)}<button class="text-button" data-action="undo" data-path="${esc(c.path)}">撤销这项草稿</button></section>`).join('<div class="spacer"></div>')}<div class="spacer"></div><label class="field">本次更新说明<input id="publish-message" maxlength="160" value="${esc(`更新论坛网站内容（${state.changes.length} 项）`)}"></label></div><div class="modal-footer"><label class="check-line"><input type="checkbox" id="confirm-public">已核对内容，确认可以公开发布</label><button class="button" id="confirm-publish" data-action="publish" ${allowed ? '' : 'disabled'} disabled>确认发布 →</button></div>`;
  $('#modal').showModal();
  $('#confirm-public').addEventListener('change', e => { $('#confirm-publish').disabled = !allowed || !e.target.checked || working; });
}
async function checkDeployment() {
  if (!state.lastPublish) return;
  const result = await api.deployment({ sha: state.lastPublish.sha });
  const text = result.state === 'completed' ? result.conclusion === 'success' ? '部署成功，正式网站已更新。' : `部署未成功（${result.conclusion}）。请查看 GitHub Actions 详情；已提交的内容不会自动回滚。` : result.state === 'pending' ? '提交已收到，正在等待自动部署任务出现。' : '正在自动构建和部署，请稍后再次检查。';
  const target = $('#deploy-status'); if (target) { target.textContent = text; target.className = `notice ${result.conclusion === 'success' ? 'success' : result.state === 'completed' ? 'error' : ''}`; }
  else toast(text, result.state === 'completed' && result.conclusion !== 'success');
  return result;
}
async function handleAction(action, el) {
  if (working && !['website', 'close-modal', 'check-deploy'].includes(action)) return;
  if (action === 'website') return api.open({ url: config.siteUrl });
  if (action === 'settings') return navigate('settings');
  if (action === 'edit') return openRecord(el.dataset.path);
  if (action === 'new') return newRecord(el.dataset.kind);
  if (action === 'back') return navigate(current);
  if (action === 'save') return saveEditor();
  if (action === 'review') return showReview();
  if (action === 'close-modal') { if (!working) $('#modal').close(); return; }
  if (action === 'duplicate') { const value = readEditor(); if (dirty && !window.confirm('复制当前填写内容为新一期？原表单中尚未保存的改动不会写入原活动。')) return; return newRecord('events', value); }
  if (action === 'add-session' || action === 'remove-session' || action === 'add-link' || action === 'remove-link') {
    selected = readEditor(); const d = selected.data;
    if (action === 'add-session') (d.sessions ||= []).push({ speaker: '', title: '', summary: '' });
    if (action === 'remove-session') { if (!window.confirm('从草稿中移除这个报告？')) return; d.sessions.splice(Number(el.dataset.index), 1); }
    const key = selected.kind === 'training' ? 'resources' : 'materials';
    if (action === 'add-link') (d[key] ||= []).push({ label: '', url: '', ...(selected.kind === 'training' ? { type: '外部链接' } : {}) });
    if (action === 'remove-link') d[key].splice(Number(el.dataset.index), 1);
    dirty = true; render(); return;
  }
  if (action === 'delete') {
    if (!window.confirm(`将“${titleOf(selected)}”标记为删除？确认发布后才会从网站移除。`)) return;
    const next = state.changes.filter(c => c.path !== selected.path);
    if (state.snapshot.records.some(r => r.path === selected.path)) next.push({ path: selected.path, deleted: true, label: titleOf(selected) });
    await api.saveDrafts({ changes: next }); state.changes = next; dirty = false; selected = null; render(); toast('已加入删除草稿，可在发布前撤销。'); return;
  }
  if (action === 'undo') {
    if (!window.confirm('撤销这一项本地草稿？正式网站不会受影响。')) return;
    const next = state.changes.filter(c => c.path !== el.dataset.path); await api.saveDrafts({ changes: next }); state.changes = next;
    if (selected?.path === el.dataset.path) { selected = null; dirty = false; }
    $('#modal').close(); render(); toast('草稿已撤销。'); return;
  }
  if (action === 'discard') {
    if (!window.confirm('清空本机全部未发布草稿？建议先导出备份。')) return;
    await api.discardDrafts(); state.changes = []; render(); toast('本机草稿已清空。'); return;
  }
  if (action === 'export') { if (await api.exportDrafts()) toast('草稿已导出。'); return; }
  if (action === 'upload') {
    if (!window.confirm('请确认本次选择的是允许公开的资料，不包含内部账号、密码或论坛内部手册。')) return;
    const item = await api.upload(); if (!item) return;
    const next = [...state.changes, item]; await api.saveDrafts({ changes: next }); state.changes = next; render(); toast('附件已加入草稿。请在对应活动或培训中选择其链接。'); return;
  }
  if (action === 'sync') {
    if (!confirmLeave()) return;
    working = true; navigation(); el.disabled = true; const original = el.textContent; el.textContent = '正在读取…';
    try { state = await api.sync(); selected = null; dirty = false; toast('已读取最新内容，未冲突的草稿已保留。'); }
    finally { working = false; el.disabled = false; el.textContent = original; render(); }
    return;
  }
  if (action === 'token-login') {
    const token = $('#token').value; const remember = $('#remember-token').checked; $('#token').value = '';
    el.disabled = true;
    try { const result = await api.login({ token, remember }); user = result.user; render(); toast(user.canPublish ? '登录成功。请读取最新内容后发布。' : '已登录，只读权限。请联系论坛负责人。'); }
    finally { el.disabled = false; }
    return;
  }
  if (action === 'logout') { clearInterval(deviceTimer); await api.logout(); user = null; render(); toast('已退出登录并移除本机凭据。'); return; }
  if (action === 'open-token') return api.open({ url: 'https://github.com/settings/personal-access-tokens/new' });
  if (action === 'device-login') {
    const clientId = $('[name="clientId"]').value; const remember = $('#remember-device').checked; el.disabled = true;
    try {
      const code = await api.startDevice({ clientId, remember }); config.clientId = clientId;
      $('#modal-content').innerHTML = `<div class="modal-head"><h2>在 GitHub 确认登录</h2><button class="close" data-action="cancel-device" aria-label="取消登录">×</button></div><div class="modal-body"><p>在浏览器中输入以下代码，并确认授权给论坛管理器。</p><div class="code-box">${esc(code.userCode)}</div><p class="subtle">请只在 github.com 输入代码。有效期约 ${Math.round(code.expiresIn / 60)} 分钟。</p><button class="button" data-action="open-device">打开 GitHub 授权页 ↗</button><p id="device-status" class="subtle">等待浏览器中的授权…</p></div>`;
      $('#modal').showModal(); await api.open({ url: code.verificationUrl });
      clearInterval(deviceTimer); let polling = false;
      deviceTimer = setInterval(async () => {
        if (polling) return; polling = true;
        try { const result = await api.pollDevice(); if (result.user) { user = result.user; clearInterval(deviceTimer); $('#modal').close(); render(); toast('GitHub 授权成功。'); } }
        catch (error) { clearInterval(deviceTimer); if ($('#device-status')) $('#device-status').textContent = error.message; }
        finally { polling = false; }
      }, 5500);
    } finally { el.disabled = false; }
    return;
  }
  if (action === 'open-device') return api.open({ url: 'https://github.com/login/device' });
  if (action === 'cancel-device') { clearInterval(deviceTimer); await api.cancelDevice(); $('#modal').close(); return; }
  if (action === 'publish') {
    if (!$('#confirm-public').checked) return;
    working = true; el.disabled = true; el.textContent = '正在检查并发布…'; navigation();
    try {
      const result = await api.publish({ confirmed: true, message: $('#publish-message').value });
      state = result.state; selected = null; dirty = false; current = 'history'; $('#modal').close();
      toast('已提交到 GitHub。网站正在自动构建部署。');
    } finally { working = false; render(); el.disabled = false; el.textContent = '确认发布 →'; }
    if (state.lastPublish) await checkDeployment();
    return;
  }
  if (action === 'check-deploy') return checkDeployment();
  if (action === 'open-commit') return api.open({ url: state.lastPublish.url });
}
document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-nav]'); if (nav) { event.preventDefault(); navigate(nav.dataset.nav); return; }
  const el = event.target.closest('[data-action]'); if (!el) return;
  event.preventDefault();
  try { await handleAction(el.dataset.action, el); } catch (error) {
    if (error.code === 'AUTH') { user = null; navigation(); }
    toast(error.message, true);
  }
});
document.addEventListener('submit', event => event.preventDefault());
document.addEventListener('input', event => {
  if (event.target.closest('#editor-form')) { dirty = true; navigation(); $('#live-preview').innerHTML = preview(readEditor()); }
  if (event.target.id === 'search') {
    const pos = event.target.selectionStart; search = event.target.value; $('#main').innerHTML = listPage(current); $('#search').focus(); $('#search').setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', event => { if (event.target.id === 'filter') { filter = event.target.value; $('#main').innerHTML = listPage(current); } });
$('#modal').addEventListener('cancel', event => { if (working) event.preventDefault(); else if (deviceTimer) { clearInterval(deviceTimer); api.cancelDevice().catch(() => {}); } });
window.addEventListener('beforeunload', event => { if (dirty || working) { event.preventDefault(); event.returnValue = ''; } });
(async () => {
  api = window.forumManager || await demoBridge();
  const boot = await api.bootstrap(); ({ state, user, config, desktop, secureStorage } = boot); render();
  if (desktop) {
    try { state = await api.sync(); if (!dirty && !selected) render(); else navigation(); }
    catch { toast('暂未读取远端最新内容，当前显示本机快照。可以继续查看或保存草稿。', true); }
  }
})().catch(error => { $('#main').innerHTML = `<div class="notice error">启动失败：${esc(error.message)}</div>`; });
