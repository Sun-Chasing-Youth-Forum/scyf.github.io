# 逐日青年论坛官网

逐日青年论坛（Sun-Chasing Youth Forum）官方网站。项目使用 Astro 生成纯静态页面，通过 GitHub Actions 自动部署到 GitHub Pages，不需要数据库、自建服务器或付费运行环境。

## 技术方案

- Astro 静态站点生成器；
- Markdown / MDX 内容集合，内容与页面代码分离；
- GitHub Pages 免费托管；
- GitHub Actions 在 `main` 分支更新后自动检查、构建和部署；
- GitHub Discussions 作为长期讨论区；
- giscus 在每期活动详情页映射对应讨论；
- 自动适配 `组织名.github.io` 根路径和普通项目仓库子路径。

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

## 上传论坛手册或 PDF

1. 将 PDF 放到 `public/documents/`，文件名建议使用英文、数字和连字符；
2. 打开 `src/content/manuals/forum-handbook.md`；
3. 在 `files` 中增加：

```yaml
files:
  - label: "逐日青年论坛手册 2026 版"
    url: "/documents/forum-handbook-2026.pdf"
    size: "1.2 MB"
```

活动附件和培训资料也使用相同的 `/documents/文件名` 写法。页面会自动添加 GitHub Pages 子路径，不能把仓库名称硬编码进 URL。

## 添加培训资料

在 `src/content/training/` 新增 Markdown 或 MDX。可用分类为：`ASO-S`、`HXI`、`SDO`、`Solar Orbiter / STIX`、`SSWIDL`、`Python / SunPy`、`数据分析教程`。正文写教程，`resources` 可登记 PDF、外部链接、示例代码或下载文件。

## 部署到 GitHub Pages

1. 在论坛专用 Organization 中创建公开仓库，推荐名称 `solar-youth-forum`；如希望使用组织根地址，则仓库名必须是 `<organization-name>.github.io`；
2. 将本项目推送到仓库的 `main` 分支；
3. 进入仓库 **Settings → Pages → Build and deployment**，将 Source 设为 **GitHub Actions**；
4. 推送后查看 **Actions → Deploy Astro site to GitHub Pages**。成功后 Pages 地址会出现在部署任务中。

普通项目仓库的地址为 `https://<organization-name>.github.io/solar-youth-forum/`；组织主页仓库地址为 `https://<organization-name>.github.io/`。

绑定自定义域名时，在仓库 Pages 设置中填写域名，并创建 `public/CNAME`（内容只写域名）。同时新增 Actions Variable `SITE_URL`，值为完整地址，例如 `https://forum.example.org`。

## 启用 GitHub Discussions

1. 进入 **Settings → General → Features**，勾选 **Discussions**；
2. 在 Discussions 中创建或整理以下分类：论坛公告、报告主题建议、太阳物理科学讨论、数据需求、数据分析与软件、培训需求、合作交流、论坛意见与建议；
3. 另建一个供活动评论使用的分类，推荐名称为“活动讨论”，格式选择“开放式讨论”。

## 配置 giscus

1. 确保仓库公开、Discussions 已启用，并为仓库安装 giscus GitHub App；
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
│  ├─ documents/                    # PDF、附件与下载资料
│  └─ images/                       # 公共图片
├─ scripts/verify-build.mjs         # 路由、排序、日期与子路径校验
├─ src/
│  ├─ components/                   # 通用界面组件
│  ├─ config/                       # 论坛与 giscus 集中配置
│  ├─ content/
│  │  ├─ events/                    # 每期活动
│  │  ├─ news/                      # 通知
│  │  ├─ training/                  # 培训教程
│  │  ├─ manuals/                   # 手册索引
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
