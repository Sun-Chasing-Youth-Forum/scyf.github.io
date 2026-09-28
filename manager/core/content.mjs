import { parseDocument } from 'yaml';

export const TYPES = ['工作进展', '研究动态', '研究动态与工作进展', '技能交流', '报告演练', '课程讲习', '工作会议', '其他'];
export const CATEGORIES = ['ASO-S', 'HXI', 'SDO', 'Solar Orbiter / STIX', 'SSWIDL', 'Python / SunPy', '数据分析教程'];
export const KNOWN = {
  events: ['issue', 'date', 'time', 'host', 'speaker', 'affiliation', 'title', 'summary', 'reportType', 'location', 'meetingUrl', 'meetingNumber', 'status', 'materials', 'sessions'],
  news: ['title', 'date', 'summary', 'pinned', 'tags'],
  training: ['title', 'category', 'summary', 'order', 'resources'],
  about: ['title', 'order']
};
export function contentPath(path) {
  return typeof path === 'string' && /^src\/content\/(events|news|training|about)\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.mdx?$/.test(path);
}
export function assetPath(path) {
  return typeof path === 'string' && /^public\/(documents|images)\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(pdf|png|jpg|jpeg|webp|zip|txt|ipynb|py)$/.test(path)
    && !/handbook|internal|secret|credential/i.test(path);
}
export function split(source) {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('内容缺少有效的 YAML 信息区，无法编辑。');
  const doc = parseDocument(match[1]);
  if (doc.errors.length) throw new Error(`内容格式有误：${doc.errors[0].message}`);
  const data = doc.toJS({ maxAliasCount: 20 });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('信息区必须是字段列表。');
  return { doc, data, body: match[2] };
}
export function decode(path, source) {
  if (!contentPath(path)) throw new Error('仅支持论坛公开内容目录。');
  const { data, body } = split(source);
  return { path, kind: path.split('/')[2], data, body, source };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function encode(record, data, body = record.body) {
  const { doc } = split(record.source);
  let changed = body !== record.body;
  for (const key of KNOWN[record.kind]) {
    if (equal(data[key], record.data[key])) continue;
    changed = true;
    if (data[key] === undefined || data[key] === '') doc.delete(key);
    else doc.set(key, data[key]);
  }
  if (!changed) return record.source;
  // New records start from an empty YAML map; use block fields as the site's content checks expect.
  if (doc.contents && doc.contents.flow) doc.contents.flow = false;
  return `---\n${doc.toString({ lineWidth: 0 })}---\n${body}`;
}
export function validate(record) {
  const { kind, data: d } = record;
  const errors = [];
  const string = (key, required = false) => {
    if (required && (typeof d[key] !== 'string' || !d[key].trim())) errors.push(`${key} 不能为空`);
    else if (d[key] !== undefined && typeof d[key] !== 'string') errors.push(`${key} 必须为文字`);
  };
  const date = () => { if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date)) || new Date(d.date).toISOString().slice(0, 10) !== d.date) errors.push('日期无效'); };
  const links = (key, training = false) => {
    if (d[key] === undefined) return;
    if (!Array.isArray(d[key])) { errors.push(`${key} 必须是列表`); return; }
    for (const link of d[key]) {
      if (!link || typeof link.label !== 'string' || !link.label.trim() || !publicLink(link.url)) errors.push('资料需要名称及有效的公开链接（https:// 或站内路径）');
      if (training && !['PDF', '外部链接', '代码', '下载'].includes(link?.type)) errors.push('请选择资料类型');
    }
  };
  if (kind === 'events') {
    if (!Number.isInteger(d.issue) || d.issue <= 0) errors.push('期数必须是正整数');
    date();
    for (const k of ['time', 'host', 'location']) string(k, true);
    for (const k of ['speaker', 'affiliation', 'title', 'summary', 'reportType', 'meetingUrl', 'meetingNumber']) string(k);
    if (!['待定', '已公布', '已结束'].includes(d.status)) errors.push('请选择活动状态');
    if (d.reportType && !TYPES.includes(d.reportType)) errors.push('报告类型无效');
    if (d.meetingUrl && !/^https?:\/\//.test(d.meetingUrl)) errors.push('线上会议链接应以 https:// 或 http:// 开头');
    if (d.meetingUrl) { try { new URL(d.meetingUrl); } catch { errors.push('线上会议链接无效'); } }
    if (d.sessions !== undefined && !Array.isArray(d.sessions)) errors.push('报告列表格式无效');
    for (const session of Array.isArray(d.sessions) ? d.sessions : []) {
      if (!session || typeof session.speaker !== 'string' || !session.speaker.trim() || typeof session.title !== 'string' || !session.title.trim()) errors.push('每个报告需要报告人及题目；尚未确定请填“待定”');
      for (const k of ['affiliation', 'time', 'summary']) if (session?.[k] !== undefined && typeof session[k] !== 'string') errors.push(`报告 ${k} 必须为文字`);
      if (session?.type && !TYPES.includes(session.type)) errors.push('单个报告类型无效');
    }
    links('materials');
  } else if (kind === 'news') {
    string('title', true); string('summary', true); date();
    if (d.pinned !== undefined && typeof d.pinned !== 'boolean') errors.push('置顶必须是布尔值');
    if (d.tags !== undefined && (!Array.isArray(d.tags) || d.tags.some(t => typeof t !== 'string'))) errors.push('标签必须是文字列表');
  } else if (kind === 'training') {
    string('title', true); string('summary', true);
    if (!CATEGORIES.includes(d.category)) errors.push('请选择培训分类');
    links('resources', true);
  } else if (kind === 'about') string('title', true);
  else errors.push('未知的内容分类');
  if (['about', 'training'].includes(kind) && d.order !== undefined && (typeof d.order !== 'number' || !Number.isFinite(d.order))) errors.push('排序值必须是数字');
  if (Buffer.byteLength(record.source, 'utf8') > 512 * 1024) errors.push('单篇内容不能超过 512 KB');
  return errors;
}
export function publicLink(value) {
  if (typeof value !== 'string') return false;
  if (/^\/(documents|images)\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) return !value.includes('..');
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function prepareChanges(snapshot, changes) {
  if (!snapshot?.sha || !Array.isArray(changes) || changes.length === 0 || changes.length > 100) throw new Error('请选择 1–100 项改动。');
  const paths = new Set();
  const items = [];
  const finalRecords = new Map(snapshot.records.map(r => [r.path, r]));
  let total = 0;
  for (const change of changes) {
    const { path } = change;
    if (paths.has(path)) throw new Error('同一内容只能提交一次。');
    paths.add(path);
    if (!contentPath(path) && !assetPath(path)) throw new Error('禁止修改网站程序或内部文件。');
    const exists = snapshot.files[path];
    if (change.deleted) {
      if (!contentPath(path) || !exists) throw new Error('只能删除已存在的内容条目。');
      finalRecords.delete(path); items.push({ path, mode: '100644', type: 'blob', sha: null }); continue;
    }
    if (contentPath(path)) {
      if (typeof change.content !== 'string') throw new Error('内容必须是文字。');
      const record = decode(path, change.content);
      const errors = validate(record);
      if (errors.length) throw new Error(`${record.data.title || path}：${errors.join('；')}`);
      const old = snapshot.records.find(r => r.path === path);
      if (old) for (const [key, value] of Object.entries(old.data)) {
        if (!KNOWN[record.kind].includes(key) && !equal(record.data[key], value)) throw new Error(`请保留网站扩展字段：${key}`);
      }
      if (old?.source === change.content) continue;
      finalRecords.set(path, record);
      total += Buffer.byteLength(change.content);
      items.push({ path, mode: '100644', type: 'blob', content: change.content });
    } else {
      if (exists) throw new Error('附件名称已存在，请更换名称以保留旧附件。');
      if (typeof change.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(change.base64)) throw new Error('附件数据无效。');
      const size = Buffer.from(change.base64, 'base64').length;
      if (!size || size > 5 * 1024 * 1024) throw new Error('附件必须为 1 字节至 5 MB。');
      total += size;
      items.push({ path, mode: '100644', type: 'blob', base64: change.base64 });
    }
  }
  const issues = new Set();
  for (const r of finalRecords.values()) if (r.kind === 'events') {
    if (issues.has(r.data.issue)) throw new Error(`第 ${r.data.issue} 期重复，请使用不同的期数。`);
    issues.add(r.data.issue);
  }
  if (!items.length) throw new Error('没有实际发生变化的内容。');
  if (total > 20 * 1024 * 1024) throw new Error('单次发布附件和内容总量不能超过 20 MB。');
  return items;
}
