# 逐日青年论坛官网

逐日青年论坛（Sun-Chasing Youth Forum）官方网站。项目使用 Astro 生成纯静态页面，通过 GitHub Actions 自动部署到 GitHub Pages，不需要数据库、自建服务器或付费运行环境。

## 技术方案

- Astro 静态站点生成器；
- Markdown / MDX 内容集合，内容与页面代码分离；
- GitHub Pages 免费托管；
- GitHub Actions 在 `main` 分支更新后自动检查、构建和部署；
- GitHub Discussions 作为长期讨论区；
- giscus 在每期活动详情页映射对应讨论；
- 当前仓库 `Sun-Chasing-Youth-Forum/scyf.github.io` 使用项目 Pages 地址 `https://sun-chasing-youth-forum.github.io/scyf.github.io/`。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

完整检查：

```bash
npm run check
npm run build
npm run test:content
```

## 添加一期新活动

复制 `src/content/events/2026-09-30.md`，按活动日期命名，例如 `src/content/events/2027-01-20.md`。只修改文件顶部字段和正文，不需要改页面组件。同一天有多场报告时可使用 `sessions` 列表，现有历史活动中包含示例。

```yaml
---
issue: 19
date: 2027-01-20
time: "09:30–12:00"
host: "主持人姓名"
speaker: "报告人姓名"          # 未确定时删除本行
affiliation: "报告人单位"      # 未确定时删除本行
title: "报告题目"              # 未确定时删除本行
summary: "报告摘要"            # 未确定时删除本行
reportType: "工作进展"
location: "紫金山天文台 3 号楼 402 会议室"
meetingUrl: "https://..."       # 未确定或不公开时删除本行
status: "已公布"                # 待定 / 已公布 / 已结束
materials:
  - label: "报告幻灯片"
    url: "/documents/2027-01-20-slides.pdf"
---

正文可填写活动说明、会后纪要或问答摘要。
```

首页在每次构建时按当前日期自动寻找日期不早于今天、且状态不是“已结束”的最早活动。没有符合条件的活动时显示“新一期活动正在筹备”。往期页面只归档状态为“已结束”的活动，并自动按年份分组。

## 更新通知

在 `src/content/news/` 新增 Markdown 文件。必填字段为 `title`、`date`、`summary`；首页自动显示日期最新的三条。

## 同步论坛日程

在线手册是论坛正式日程的权威数据源。为避免泄露手册中的账号、密码、会议口令和内部信息，网站不公开手册本身，也不在公开仓库保存带访问令牌的手册地址。

在已配置的维护工作区中，对 Codex 发送简短指令：

> 同步论坛手册

Codex 会读取本机私有同步源，对比 `src/content/events/`，仅更新发生变化的活动内容，保留网站特有的图片、标签、推荐阅读、外部资源、录像和补充说明；完成检查后提交并推送。详细约定见 `AGENTS.md`。

新电脑或全新克隆中若没有本机私有同步源，只需在首次同步时把在线手册地址提供给 Codex。不要将地址写入公开仓库。

## 上传公开 PDF 或附件

仅将确认适合公开的培训资料或报告附件放入 `public/documents/`，文件名建议使用英文、数字和连字符；再在活动 `materials` 或培训 `resources` 中使用 `/documents/文件名` 登记。严禁上传论坛内部手册、账号、密码、会议口令、私密联系方式或内部系统信息。

## 添加培训资料

在 `src/content/training/` 新增 Markdown 或 MDX。可用分类为：`ASO-S`、`HXI`、`SDO`、`Solar Orbiter / STIX`、`SSWIDL`、`Python / SunPy`、`数据分析教程`。正文写教程，`resources` 可登记 PDF、外部链接、示例代码或下载文件。

## 部署到 GitHub Pages

1. 当前仓库名为 `scyf.github.io`，归属于 `Sun-Chasing-Youth-Forum` Organization；
2. 将本项目推送到仓库的 `main` 分支；
3. 进入仓库 **Settings → Pages → Build and deployment**，将 Source 设为 **GitHub Actions**；
4. 推送后查看 **Actions → Deploy Astro site to GitHub Pages**。成功后 Pages 地址会出现在部署任务中。

正式网站地址为 `https://sun-chasing-youth-forum.github.io/scyf.github.io/`。GitHub Pages 的根地址由账号或 Organization 名称决定；仅将仓库改名为 `scyf.github.io` 不会获得 `https://scyf.github.io/`。若要根地址，需要该网站归属于名为 `scyf` 的账号，或绑定自己拥有的独立域名。

绑定自定义域名时，在仓库 Pages 设置中填写域名，并创建 `public/CNAME`（内容只写域名）。同时新增 Actions Variable `SITE_URL`，值为完整地址，例如 `https://forum.example.org`。

## 启用 GitHub Discussions

1. 进入 **Settings → General → Features**，勾选 **Discussions**；
2. 为降低广告和无关内容，只保留以下四类：

- `论坛公告`：Announcement，仅维护人员可新建；
- `活动讨论`：Announcement，供 giscus 自动建帖，外部用户不能自行开帖；
- `科学问题与数据分析`：Question and answer；
- `建议、培训与合作`：Question and answer 或开放讨论。

3. 评论者必须登录 GitHub。发现广告时，隐藏或删除内容并向 GitHub 举报；讨论失控时及时锁定。仓库的 `giscus.json` 将嵌入来源限制为正式网站，避免其他网站借用本仓库评论区。

## 配置 giscus

当前正式仓库已经启用 Discussions，并已安装 giscus GitHub App。若以后迁移仓库，可按以下步骤重新配置：

1. 确保新仓库公开、Discussions 已启用，并为该仓库安装 giscus GitHub App；
2. 打开 [giscus 配置页](https://giscus.app/zh-CN)，选择仓库、`pathname` 映射和“活动讨论”分类；
3. 在仓库 **Settings → Secrets and variables → Actions → Variables** 新增：

   - `GISCUS_REPO_ID`
   - `GISCUS_CATEGORY`（建议填 `活动讨论`）
   - `GISCUS_CATEGORY_ID`
   - `CONTACT_EMAIL`（可选）

`PUBLIC_GITHUB_REPOSITORY` 会由 GitHub Actions 自动填写。giscus 参数未配置时，活动详情页会显示友好的待配置提示，不影响网站其他功能。

## 目录结构

```text
.
├─ .github/workflows/deploy.yml     # 自动构建与 Pages 部署
├─ public/
│  ├─ documents/                    # 仅限适合公开的培训和报告附件
│  └─ images/                       # 公共图片
├─ scripts/verify-build.mjs         # 路由、排序、日期与子路径校验
├─ src/
│  ├─ components/                   # 通用界面组件
│  ├─ config/                       # 论坛与 giscus 集中配置
│  ├─ content/
│  │  ├─ events/                    # 每期活动
│  │  ├─ news/                      # 通知
│  │  ├─ training/                  # 培训教程
│  │  └─ about/                     # 论坛介绍与组织信息
│  ├─ layouts/                      # 页面布局
│  ├─ pages/                        # 路由页面
│  ├─ styles/                       # 全站样式
│  └─ utils/                        # 日期、排序和路径工具
├─ astro.config.mjs
└─ package.json
```

## 许可证

代码采用 [MIT License](LICENSE)。论坛发布的报告、文档、图片和其他内容可由组织方另行声明授权方式。
