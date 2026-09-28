# 逐日青年论坛网站管理器 · 0.1.1

供历任网站维护者使用的中文桌面工具，支持 Windows x64、macOS Apple Silicon（arm64）及 Intel（x64）。管理的网站为 <https://scyf-pmo.github.io/>，仓库为 `scyf-pmo/scyf-pmo.github.io`。

## 维护者快速开始

1. 获取对应系统的压缩包，完整解压。Windows 打开 `SCYF Website Manager.exe`；Mac 打开 `SCYF Website Manager.app`。不需要安装 Git、Node.js 或克隆网站。
2. 首次可以直接查看内置的公开内容快照。右上角显示“离线体验”时，编辑只会保存在本机；不会改动正式网站。
3. 进入“设置与账号”，点击“通过浏览器登录”。论坛 Client ID 已内置，无需填写。在浏览器输入**本次**登录码并授权，看到 All set 后返回管理器，等待账号自动显示；不要重复发起授权。个人细粒度令牌仍可作为备用方式。
4. 点击“读取最新内容”，确认显示“已读取 GitHub”。找到活动、公告、培训或论坛介绍，点击“编辑”。
5. 填写表单，点击“保存草稿”。同一期的多个报告可分别填写时间、报告人、单位、题目和完整摘要。尚未确定的信息可留空，单个分场报告的必填内容可写“待定”。
6. 点击底部“预览与发布”，逐项比较修改前后，勾选确认公开内容，再点击“确认发布”。发布前会再次检查权限、必填字段、活动期数和远端版本。
7. 到“发布记录”检查部署状态。看到“部署成功”后，再打开正式网站查看结果。提交成功不等于部署成功。

### 新增、复制、删除与附件

- 新增：进入相应栏目点击“新建”。新活动默认期数为现有最大期数加 1，日期为最近一期之后两周，请按实际安排修改。
- 复制：打开一期活动，点击下方“复制为新一期”。会保留报告内容、更新期数和建议日期，并把状态改为“待定”，请逐项核对。
- 删除：编辑页点击“删除这项内容”，确认后加入删除草稿；发布后才从网站移除。发布前可在预览中撤销。
- 附件：在“公开附件”选择文件。支持 PDF、PNG、JPG、WebP、ZIP、TXT、IPYNB、PY，单个最多 5 MB、单次发布总计最多 20 MB。然后在活动或培训的“相关公开资料”中选择附件链接，填写显示名称。只上传明确允许公开的资料。
- 内部论坛手册、账号、密码和内部登录信息不能上传。程序不会读取、抓取或公开在线内部手册。
- 已有记录修改日期时保留原文件名和活动网址，以保持 giscus 评论对应关系。
- 原文中的网站扩展字段和未改动的报告数据会保留；初版不提供页面布局编辑。

### 草稿与多人协作

草稿在保存后写入本机，重启后仍保留。未点击“保存草稿”的表单仍可能丢失，退出时会提示。离线浏览器预览和桌面版草稿互不相通。

读取最新内容时，如果草稿涉及的文件没有被其他人修改，草稿会自动保留在新的仓库版本上；如果同一条内容已变化，会停止同步并说明冲突。可以先“导出草稿备份”，再清空草稿、读取最新内容并按照备份重新填写。备份为可阅读的 JSON 文件，初版尚无自动导入功能。

发布采用单个 GitHub commit，一次原子更新所有内容。发布前发现任何远端更新，都会停止；检查后再次发生并发更新，GitHub 的非强制更新也会拒绝覆盖。草稿不会因为网络失败而自动删除。

## Organization Owner 首次配置

### 权限

在 `scyf-pmo` Organization 中建立 `Website-Maintainers` 团队，对网站仓库授予 **Write** 权限。每位维护者使用自己的 GitHub 账号；离任后移出团队。不共享账号、PAT、SSH 私钥或 deploy key。

### 最快试用：个人细粒度令牌

维护者在 GitHub 的 **Settings → Developer settings → Personal access tokens → Fine-grained tokens** 新建个人令牌：

- Resource owner：`scyf-pmo`；需先加入 Organization，并拥有网站仓库权限。
- Repository access：仅 `scyf-pmo.github.io`。
- Repository permissions：**Contents → Read and write**；**Actions → Read-only**；Metadata 随 GitHub 要求授予只读。
- 按组织政策设置有效期；如果状态为 Pending，先由 Organization Owner 批准。

将令牌填入桌面程序的“个人细粒度令牌登录”，验证后输入框立即清空。勾选记住登录时使用 Electron safeStorage，由 Windows DPAPI / macOS Keychain 保护；无法安全加密时仅在进程内保存。退出登录会删除本机凭据，不会撤销 GitHub 端令牌；离任时应在 GitHub 撤销本人令牌并移除团队权限。

不要把令牌提交到仓库、发送给其他维护者或写进 `app-config.json`。

### 长期使用：GitHub App 浏览器授权

1. 在 Organization 的 Developer settings 创建 GitHub App，名称建议 `SCYF Website Manager`，Homepage URL 为 `https://scyf-pmo.github.io/`。
2. 启用 **Device Flow**。桌面程序使用设备授权流程，不需要自建回调服务器；不启用 Webhook。
3. Repository permissions 设为 **Contents: Read and write**、**Actions: Read-only**，Metadata 为只读。
4. 安装 App 时只选择网站仓库。App 权限与当前用户的仓库权限取交集，安装 App 不会让无权限的用户获得写权限。
5. App 的公开 **Client ID** 已写入 `manager/app-config.json` 的 `clientId`，维护者直接点击登录。以后更换 App 时修改此文件并重新打包；旧版保存的本机 Client ID 不会覆盖随新版内置的配置。

App 私钥和 Client Secret 不得分发。管理器使用 Device Flow，按 GitHub 的间隔查询授权结果，支持取消、过期、限流和网络恢复。获取访问令牌后，身份验证暂时失败时会复用内存中的令牌重试，不会再次消耗一次性登录码。当前版本在用户访问令牌过期时要求重新授权，不保存刷新令牌，也不会为刷新流程内置 Secret。

### 浏览器显示 All set，但软件没有显示账号

1. 确认运行的是 **0.1.1** 或更新版本，旧窗口全部退出。解压新版到新的文件夹运行，不必删除本机草稿。新版限制同一用户只运行一个实例。
2. 只使用软件**当前显示**的登录码。旧网页的 All set 不代表新发起的登录也已完成。
3. 返回管理器等待。网络暂时中断或 GitHub 限流时会显示等待原因并自动重试，请不要连续点击登录。
4. 如果显示 `unverified_user_email`，先验证 GitHub 账号主要邮箱。若显示登录码过期/失效，关闭旧授权页，点击“重新获取登录码”。
5. 如果已显示 GitHub 用户名但为只读状态，登录本身已经完成。负责人需检查 App 安装是否包含网站仓库，以及该维护者的仓库 Write 权限。
6. 若仍失败，请把软件显示的错误文字提供给负责人。**不要发送访问令牌、设备授权码、auth.bin 或浏览器 Cookie。**

参考：[GitHub App 设备授权](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)、[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。

## 初版状态与限制

- 实现：活动 / 通知 / 培训 / 介绍的表单增删改、复制活动、多报告、完整摘要、链接和公开附件、草稿、差异预览、个人登录、权限检查、冲突保护、一次提交、按此次提交查询 Pages 工作流。
- 已测试：现有公开内容读写、错误输入、字段保留、权限失败、过期登录、限流、网络错误、远端冲突和提交过程中再次发生的竞争；发布流程使用模拟 API 验证，没有向正式网站发布测试活动。
- Markdown / MDX 正文以源文本编辑，右侧为完整文字预览；初版不执行 MDX、不提供富文本编辑器，也不保证与网站最终排版完全相同。发布前做内容校验；Astro 的完整构建由网站原有 Actions 完成。
- 浏览器 `preview` 为本地离线演示，不具有 GitHub 发布能力。真实能力在桌面程序中。
- 初版安装包未进行商业代码签名及 Apple 公证，系统可能显示开发者确认提示。正式广泛分发前可配置 Windows 签名、Apple Developer ID 与公证；不建议关闭系统安全保护。macOS 构建验收与用户实机兼容性测试是不同的步骤。
- 网站仓库必须保持公开，读取正文通过 GitHub 的公开原文服务，并固定到同一个提交；网络需要能够访问 `api.github.com`、`raw.githubusercontent.com` 和 `github.com`。
- 分支保护、组织令牌审批及 GitHub 权限仍然有效，程序不会绕过它们。

## 开发与打包

开发环境需要 Node.js 22。管理器依赖独立于 Astro 网站，不会被网站部署到公网。

```bash
cd manager
npm ci
npm test
npm start
```

界面预览：`npm run preview`，打开 `http://127.0.0.1:4322/`。

Windows：`npm run pack:win`。Mac：在 Mac 上运行 `npm run pack:mac`。初版的 `preview/website-manager` 分支更新管理器代码时会运行 **Build website manager**；工作流合并到默认分支后也可手动运行。该工作流会生成 Windows x64、Mac arm64 和 Mac x64 三个 ZIP，保留 30 天，不会自动创建公开 Release。

`npm run snapshot` 可重新生成随程序附带的公开内容示例。它只读取网站公开内容目录，不读取私有手册或 `.codex-local`。

应用图标源文件为 `ui/app-icon.svg`，以论坛配色设计太阳、运行轨迹和编辑笔。`assets/icon.ico`、`icon.icns`、`icon.png` 分别用于 Windows、Mac 和窗口图标。已生成的资源随仓库提交；普通打包无需额外依赖。重新生成时先安装网站根目录依赖（提供 Sharp），再运行 `npm run icons`。侧栏使用同一套 SVG 线性图标。

```text
manager/
  app-config.json       # 固定仓库、正式网址、公开 Client ID
  core/content.mjs      # 保留字段的 Markdown 读写与校验
  core/github.mjs       # GitHub 登录、读取、原子提交和部署查询
  desktop/              # Electron 窗口、最小 IPC 与安全凭据存储
  ui/                   # 中文界面、公开内容快照和论坛 Logo
  tests/                # 内容和 GitHub 异常场景测试
  scripts/              # 生成示例与本地界面预览
  release/              # 本机安装包，不进入 Git
```

管理器模型对应 `src/content.config.ts` 的现有 schema；网站新增必填字段或更改枚举时，应一起更新 `core/content.mjs`、表单和兼容性测试。
