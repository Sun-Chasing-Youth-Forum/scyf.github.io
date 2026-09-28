import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const dist = join(root, 'dist');
const eventSource = join(root, 'src', 'content', 'events');

const eventIds = readdirSync(eventSource).filter((name) => /\.mdx?$/.test(name)).map((name) => name.replace(/\.mdx?$/, ''));
const trainingSource = join(root, 'src', 'content', 'training');
const trainingIds = readdirSync(trainingSource).filter((name) => /\.mdx?$/.test(name)).map((name) => name.replace(/\.mdx?$/, ''));
const expectedRoutes = [
  'index.html', 'events/index.html', 'archive/index.html',
  'training/index.html', 'discussion/index.html', 'about/index.html', '404.html',
  ...eventIds.map((id) => `events/${id}/index.html`),
  ...trainingIds.map((id) => `training/${id}/index.html`)
];
for (const route of expectedRoutes) assert.ok(existsSync(join(dist, route)), `缺少构建路由：${route}`);

const parseEvent = (filename) => {
  const source = readFileSync(join(eventSource, filename), 'utf8');
  const field = (name) => source.match(new RegExp(`^${name}:\\s*(?:"([^"]*)"|([^\\n]+))`, 'm'))?.slice(1).find(Boolean)?.trim();
  return { issue: Number(field('issue')), date: new Date(`${field('date')}T00:00:00+08:00`), status: field('status'), title: field('title') || '' };
};
const events = readdirSync(eventSource).filter((name) => /\.mdx?$/.test(name)).map(parseEvent);
const selectNext = (items, now) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return [...items].sort((a, b) => a.date - b.date).find((event) => event.status !== '已结束' && event.date.getTime() >= today);
};

assert.equal(selectNext([
  { date: new Date('2026-01-01'), status: '已结束' }
], new Date('2026-09-10')), undefined, '无未来活动时应返回 fallback');
assert.equal(selectNext([
  { issue: 3, date: new Date('2026-10-02'), status: '待定' },
  { issue: 2, date: new Date('2026-09-18'), status: '已公布' }
], new Date('2026-09-10'))?.issue, 2, '下一期活动应按日期而非文件顺序选择');

const home = readFileSync(join(dist, 'index.html'), 'utf8');
assert.ok(!home.includes('论坛手册'), '首页不应保留论坛手册公开入口');
const currentNext = selectNext(events, new Date());
assert.ok(currentNext ? home.includes(`第</span><strong>${String(currentNext.issue).padStart(2, '0')}`) : home.includes('新一期活动正在筹备'), '首页下一期活动与当前日期不一致');

const [owner = '', base = ''] = (process.env.GITHUB_REPOSITORY || '').split('/');
const isOrganizationSite = base.toLowerCase() === `${owner.toLowerCase()}.github.io`;
if (base && !isOrganizationSite) {
  assert.ok(home.includes(`/${base}/_astro/`), '项目 Pages 构建的静态资源未包含仓库子路径');
  assert.ok(home.includes(`href="/${base}/events/"`), '项目 Pages 的内部链接未包含仓库子路径');
} else if (isOrganizationSite) {
  assert.ok(home.includes('href="/_astro/'), 'Organization Pages 的静态资源应使用根路径');
  assert.ok(home.includes('href="/events/"'), 'Organization Pages 的内部链接应使用根路径');
  assert.ok(!home.includes(`href="/${base}/`) && !home.includes(`src="/${base}/`), 'Organization Pages 不应包含仓库名称子路径');
}

const generatedHtml = expectedRoutes
  .filter((route) => route.endsWith('.html'))
  .map((route) => readFileSync(join(dist, route), 'utf8'))
  .join('\n');
assert.ok(!generatedHtml.includes('sun-chasing-youth-forum-handbook'), '构建结果不应引用论坛手册 PDF');

console.log(`Verified ${expectedRoutes.length} routes, event ordering, next-event selection, fallback behavior, and base-path links.`);
