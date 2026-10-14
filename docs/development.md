# 开发指南

给要改代码、构建或发版的人看。只想使用这个 app，看 [README](../README.md) 就够了。

## 命令速查

日常只需要记两个：桌面开发用 `pnpm tauri:dev`，测试用 `pnpm test:unit`。其余命令偶尔才用。

| 场景 | 命令 | 说明 |
|---|---|---|
| 日常开发 | `pnpm tauri:dev` | Tauri 2 正式桌面壳，端口 1420 |
| | `pnpm electron:dev` | 旧 Electron 回退壳；本地 AI 代理没跑会自动拉起 |
| | `pnpm dev` | 只开网页版，没有文件系统能力，改纯 UI 时更轻 |
| 测试 | `pnpm test:unit` | 单元测试跑一遍就退出 |
| | `pnpm test` | 单元测试监听模式，改代码自动重跑 |
| | `pnpm test:e2e` / `test:e2e:ui` | 端到端测试 / 带图形界面调试 |
| 打包发版 | `pnpm tauri:build:mac` | 打当前 Mac 架构的 Tauri `.app` 和 `.dmg` |
| | `pnpm tauri:build:mac:universal` | 打 Apple Silicon + Intel 通用 `.app` 和 `.dmg` |
| | `pnpm tauri:build:win` | 在 Windows 上构建 Tauri x64 可执行文件，暂不打安装包 |
| | `pnpm tauri:inno:win` | 在 Windows 上用 Inno Setup 把已构建的 exe 制成安装程序 |
| Electron 回退 | `pnpm electron:build` / `electron:build:win` | 只生成旧壳回退包，不进入正式 Release |
| | `pnpm electron:pack` | 只生成旧壳可运行目录，不做安装包 |
| | `pnpm release:tag` | 升版本、打 tag 并推送，先加 `-- --dry-run` 预览 |
| 很少用 | `pnpm build` / `pnpm preview` | 只构建 / 预览网页版，桌面版打包会自动构建 |

## 本地开发

```bash
pnpm install
pnpm dev            # 网页版，打开 http://localhost:3000
pnpm tauri:dev      # 正式桌面壳（Tauri 2）
pnpm electron:dev   # 旧 Electron 回退壳
```

只有维护 Electron 回退壳时才会用到 `better-sqlite3` 原生模块。依赖变更后如旧壳启动报错，可重新编译：

```bash
pnpm --filter @md-render/editor electron:rebuild
```

`pnpm electron:dev` 会自动检查并启动本地 `server/ai-proxy`；`pnpm tauri:dev` 和网页版不会，需要手动启动或配置远程代理。模型配置见 [README](../README.md#让-ai-助手用起来) 和 [server/README.md](../server/README.md)。

### Tauri 正式桌面壳

正式桌面发布已经切到 Tauri 2；Electron 只保留一个稳定发布周期的手动回退链路。开发机先按 [Tauri 官方前置要求](https://v2.tauri.app/start/prerequisites/) 安装当前 stable Rust，然后运行：

```bash
pnpm tauri:dev
pnpm tauri:build:mac
```

Rust、Node.js 和 pnpm 只用于开发与构建；编译后的 Tauri 应用不要求用户安装这些工具。内部 bundle identifier 继续使用 `com.mdrender.app.tauri-preview`，这是已经承载 Tauri 数据和 WebView profile 的稳定身份；产品名和可执行文件已改成 `MD Render`，但 identifier 不再因包含 `preview` 字样而改名，避免用户数据目录再次变化。

当前代码已经接入以下能力：

- 在设置页手动以只读或读写方式选择本地目录。会话 token 不持久化，只保存去路径、去 token 的最新只读快照；重启后需重新授权才能继续写盘。
- 读写 Markdown、新建、改名、删除、显示于系统文件管理器，以及将图片保存到工作区 `assets/`。
- 在 Tauri 私有数据目录中使用 SQLite/FTS，并从设置页显式导入 Electron 旧数据库。
- 通过 Rust 连接已配置的 `ai-proxy`，以及用原生保存对话框导出 MD、HTML 和 DOCX。
- 受控打开 `http` / `https` 外链。

Tauri 不会像 `pnpm electron:dev` 一样自动启动本地 AI 代理。需测试 AI 时，先启动代理：

```bash
cd server/ai-proxy
node server.js
```

然后在应用的 AI 设置中填写 `http://127.0.0.1:8788`。生产环境应使用已加固的 HTTPS 代理。

从 Electron 带入数据时，**先完全退出 Electron**，再从 **设置 → Electron 数据交接** 选择 `knowledge.db` 原文件，或退出后制作的完整副本。不要在 Electron 运行时只复制 `.db`，最新数据可能还在 WAL 中。导入不是合并：它会只读校验源库，把现有 Tauri 库备份为 `knowledge.before-import.<timestamp>.db`，再用 Electron 数据替换。两边都有新内容时先导出 Tauri JSON 备份并另存重要文稿。

PDF、自动更新、本机 Agent、本机 MCP、“数据文件化”和自定义 skill 编辑尚未迁移。对应入口会隐藏，不要用 Electron 回退壳功能可用来推断 Tauri 已等价。完整边界和验收门槛见 [tauri-migration-plan.md](./tauri-migration-plan.md)。

## 构建

```bash
pnpm build                # 网页版 → apps/editor/dist/
pnpm tauri:build:mac              # Tauri macOS 当前架构 .app + .dmg
pnpm tauri:build:mac:universal    # Tauri macOS Universal .app + .dmg
pnpm tauri:build:win              # Tauri Windows x64 exe，在 Windows 上运行
pnpm tauri:inno:win               # 用 Inno Setup 包装上一步的 exe
pnpm electron:build               # Electron macOS 回退包 → apps/editor/release/
pnpm electron:build:win           # Electron Windows 回退包
pnpm electron:pack                # Electron 可运行目录，不做安装包
pnpm preview              # 本地预览网页版构建（默认 http://localhost:4173）
```

### Tauri 打包说明

正式发布由 `.github/workflows/release.yml` 在 `v*` tag 推送后触发，只接受版本号一致且位于 `origin/main` 历史上的提交。macOS 构建 Universal `.app` 和 `.dmg`；Developer ID 和公证 secrets 齐全时执行正式签名、公证与 Gatekeeper 校验，否则使用 ad-hoc 签名并发布文件名带 `-unsigned` 的包。

Windows 先构建 Tauri exe，再用 Inno Setup 6 生成现代化安装程序。应用程序默认进入 `Program Files`，安装包会运行 Microsoft WebView2 Evergreen Bootstrapper。PFX secrets 齐全时，CI 会签名并校验应用、安装包和卸载器；否则发布文件名带 `-unsigned` 的未签名包。两种路径都会执行安装、启动和卸载冒烟检查。

Electron 回退包只能通过 `.github/workflows/ci.yml` 手动构建，不会挂到正式 Release。旧 Electron updater 无法跨框架完成首次升级，当前自定义 Inno 包也未接入 Tauri updater；用户暂时从 Releases 手动安装更新。包体大小、启动速度和内存占用以实际产物与同条件测量为准。

## 测试

```bash
pnpm test:unit     # 单元测试（Vitest）

pnpm dev           # E2E 前先在另一个终端启动 dev
pnpm test:e2e      # 端到端测试（Playwright），默认访问 http://localhost:3000
pnpm test:e2e:ui   # 交互式 Playwright UI
```

## 项目结构

```
md-render/
├── apps/editor/
│   ├── main/            # Electron 回退壳主进程（IPC、SQLite、文件系统）
│   ├── renderer/        # React 界面（Vite）
│   ├── shared/          # 主进程与界面共用的工具
│   ├── resources/       # 随 app 打包的资源（如内置 skill）
│   ├── src-tauri/       # Tauri 2 正式桌面壳（Rust command、权限和打包配置）
│   ├── tests/           # Playwright E2E
│   └── tests-unit/      # Vitest 单元测试
├── packages/
│   ├── markdown-core/   # 自研 Markdown 解析 / 渲染（parser.js、renderer.js）
│   └── blocknote-core/  # 富文本编辑器底层封装
├── server/
│   ├── ai-proxy/        # AI 中转服务（保存模型 Key、解决跨域）
│   └── mcp-bridge/      # Electron 回退壳的外部 MCP 桥
├── scripts/             # 启动、发版辅助脚本
└── docs/                # 产品与架构文档
```

代码约定和各模块入口见 [AGENTS.md](../AGENTS.md)；解析 / 渲染原理见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

## 技术栈

| 层级 | 选型 |
|------|------|
| UI | React 18、Ant Design 5、lucide-react |
| 构建 | Vite 5、pnpm workspace |
| 桌面 | Tauri 2（正式发布）· Electron 33（手动回退） |
| 状态 | Zustand（persist） |
| Markdown 核心 | 自研 parser / renderer（`packages/markdown-core`） |
| 代码高亮 | Shiki |
| 图表 | Mermaid（随应用打包，按需加载） |
| 富文本 | BlockNote |
| AI | Agent 引擎 + 工具注册表（`apps/editor/renderer/src/core/agent/`） |
| 存储 | localStorage（网页版）· SQLite + FTS5（Tauri 正式库与 Electron 旧库隔离） |

## Markdown 支持范围

- 块级：H1–H6 标题、围栏代码块（写语言名启用高亮）、多行引用、有序 / 无序列表（缩进嵌套）、`---` 分割线、GFM 表格
- 行内：粗体、斜体、粗斜体、`~~删除线~~`、行内代码、链接（可带 title）、图片（可带 title）
- 扩展：`[[文档名]]` 双向链接；语言写 `mermaid` 的代码块渲染为图表，主题跟随浅色 / 深色，悬停可全屏

## 微信公众号转换

公众号后台不支持外部 CSS，所以复制出去的 HTML 样式全部内联。转换时还会：

- 把代码块转成公众号兼容的 `<pre><code>`
- 尽量把 HTTP 图片地址升级为 HTTPS
- 去掉自定义 `class` 和 `data-*` 属性

转换逻辑在 `apps/editor/renderer/src/utils/wechatCopy.js`，模板在同目录 `wechatTemplates.js`。

## 发版

版本号维护在根目录 `package.json`：

```bash
# 1. 修改 package.json 里的 version 并提交
pnpm release:tag -- --dry-run   # 2. 预览 tag
pnpm release:tag                # 3. 创建 annotated tag 并推送
```

推送 tag 后 CI 会构建 Tauri 的 macOS Universal `.dmg` 和 Windows x64 Inno 安装包，再发布到 GitHub Releases。有完整凭证时执行签名和对应校验；没有时发布带 `-unsigned` 标记的包。完整检查清单见 [release-process.md](./release-process.md)。

## 部署网页版到 GitHub Pages

每次推送 `main` 都会通过 `.github/workflows/deploy-pages.yml` 自动构建部署，也可以在 Actions 页签手动触发。

不要改回 tag 触发：`github-pages` 环境默认只允许从默认分支部署，tag 触发时 build 能过、deploy 会被保护规则直接拒绝（job 失败且没有日志）。

第一次启用需要在仓库 **Settings → Pages** 把 **Source** 设为 **GitHub Actions**。

CI 会把 Vite 的 `base` 自动设为 `/<仓库名>/`，本地开发仍是 `/`。如果 Pages 上静态资源 404，先检查这一项。

## 其他文档

| 主题 | 文档 |
|------|------|
| 产品主路径与边界 | [PRODUCT.md](../PRODUCT.md) |
| 内容创作路线图 | [content-creation-roadmap.md](./content-creation-roadmap.md) |
| 编辑器设计取向 | [editor-philosophy.md](./editor-philosophy.md) |
| AI 助手验收清单 | [ai-assistant-quality-checklist.md](./ai-assistant-quality-checklist.md) |
| 今日速记类别说明 | [daily-notebook-task-category.md](./daily-notebook-task-category.md) |
| 知识库进度 / 路线 | [knowledge-base-progress.md](./knowledge-base-progress.md) · [knowledge-base-roadmap.md](./knowledge-base-roadmap.md) |
| Tauri 2 迁移 | [tauri-migration-plan.md](./tauri-migration-plan.md) |
