# 开发指南

给要改代码、构建或发版的人看。只想使用这个 app，看 [README](../README.md) 就够了。

## 命令速查

日常只需要记两个：开发用 `pnpm electron:dev`，测试用 `pnpm test:unit`。其余命令偶尔才用。

| 场景 | 命令 | 说明 |
|---|---|---|
| 日常开发 | `pnpm electron:dev` | Electron 正式桌面版，最常用；本地 AI 代理没跑会自动拉起 |
| | `pnpm tauri:dev` | Tauri 2 预览壳；当前只用于迁移开发，端口 1420 |
| | `pnpm dev` | 只开网页版，没有文件系统能力，改纯 UI 时更轻 |
| 测试 | `pnpm test:unit` | 单元测试跑一遍就退出 |
| | `pnpm test` | 单元测试监听模式，改代码自动重跑 |
| | `pnpm test:e2e` / `test:e2e:ui` | 端到端测试 / 带图形界面调试 |
| 打包发版 | `pnpm electron:build` | 打正式安装包（Mac 上默认 Mac 版） |
| | `pnpm electron:build:win` | 打 Windows 安装包 |
| | `pnpm electron:pack` | 只生成可运行的 app 目录，不做安装包，用来快速验证打包 |
| | `pnpm tauri:build:mac` | 打当前 Mac 架构的 Tauri `.app` 和 `.dmg` |
| | `pnpm tauri:build:mac:universal` | 打 Apple Silicon + Intel 通用 `.app` 和 `.dmg` |
| | `pnpm tauri:build:win` | 在 Windows 上构建 Tauri x64 可执行文件，暂不打安装包 |
| | `pnpm tauri:inno:win` | 在 Windows 上用 Inno Setup 把已构建的 exe 制成安装程序 |
| | `pnpm release:tag` | 升版本、打 tag 并推送，先加 `-- --dry-run` 预览 |
| 很少用 | `pnpm build` / `pnpm preview` | 只构建 / 预览网页版，桌面版打包会自动构建 |

## 本地开发

```bash
pnpm install
pnpm dev            # 网页版，打开 http://localhost:3000
pnpm electron:dev   # 桌面版（Electron）
```

依赖变更后，桌面版用到的原生模块（`better-sqlite3`）可能需要重新编译，否则启动会报错：

```bash
pnpm --filter @md-render/editor electron:rebuild
```

`pnpm electron:dev` 会自动检查并启动本地 `server/ai-proxy`（默认 `http://127.0.0.1:8788`，可用 `AI_PROXY_BASE` 指向远程代理）；网页版 `pnpm dev` 不会，需要手动启动。模型配置见 [README](../README.md#想用-ai-助手要先接一个模型) 和 [server/README.md](../server/README.md)。

### Tauri 预览壳

Tauri 迁移仍处在双壳阶段：Electron 是正式版，Tauri 是与它隔离的预览版。开发机先按 [Tauri 官方前置要求](https://v2.tauri.app/start/prerequisites/) 安装当前 stable Rust，然后运行：

```bash
pnpm tauri:dev
pnpm tauri:build:mac
```

Rust、Node.js 和 pnpm 只用于开发与构建；编译后的 Tauri 应用不要求用户安装这些工具。预览版使用独立应用名、bundle identifier 和数据目录，不会覆盖 Electron 正式版。

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

从 Electron 带入数据时，**先完全退出 Electron**，再在 Tauri 设置页选择 `knowledge.db` 原文件，或退出后制作的完整副本。不要在 Electron 运行时只复制 `.db`，最新数据可能还在 WAL 中。导入会只读校验源库、备份 Tauri 现有库，源文件保持不变。

PDF、自动更新、本机 Agent 和本机 MCP 尚未迁移。Tauri 的 PDF 入口会隐藏，不要用 Electron 功能可用来推断 Tauri 已等价。完整边界和验收门槛见 [tauri-migration-plan.md](./tauri-migration-plan.md)。

## 构建

```bash
pnpm build                # 网页版 → apps/editor/dist/
pnpm electron:build       # 桌面版安装包（Mac 上默认 Mac 版）→ apps/editor/release/
pnpm electron:build:win   # Windows 安装包
pnpm electron:pack        # 只生成可运行的 app 目录，不做安装包
pnpm tauri:build:mac              # Tauri macOS 当前架构 .app + .dmg
pnpm tauri:build:mac:universal    # Tauri macOS Universal .app + .dmg
pnpm tauri:build:win              # Tauri Windows x64 exe，在 Windows 上运行
pnpm tauri:inno:win               # 用 Inno Setup 包装上一步的 exe
pnpm preview              # 本地预览网页版构建（默认 http://localhost:4173）
```

### Tauri 打包说明

macOS 手动 CI 构建 Universal `.app` 和 `.dmg`。只有在 Developer ID、Apple 账号和 Team ID 等 secrets 齐全时，工作流才会执行正式签名、公证和 stapling；否则上传名称明确标注的 ad-hoc 预览产物。

Windows 先构建 Tauri exe，再用 Inno Setup 6 生成现代化安装程序。应用程序默认进入 `Program Files`，安装包会运行 Microsoft WebView2 Evergreen Bootstrapper。配置 PFX secrets 时会签名 exe 和卸载器；未配置时产物名会标记 `unsigned`，仍可能触发 SmartScreen。

这套 Tauri 工作流只支持手动触发，不会取代现有 Electron tag 发版。包体大小、启动速度和内存占用必须以实际产物与同条件测量为准。

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
│   ├── main/            # Electron 主进程（IPC、SQLite、文件系统）
│   ├── renderer/        # React 界面（Vite）
│   ├── shared/          # 主进程与界面共用的工具
│   ├── resources/       # 随 app 打包的资源（如内置 skill）
│   ├── src-tauri/       # Tauri 2 预览壳（Rust command、权限和打包配置）
│   ├── tests/           # Playwright E2E
│   └── tests-unit/      # Vitest 单元测试
├── packages/
│   ├── markdown-core/   # 自研 Markdown 解析 / 渲染（parser.js、renderer.js）
│   └── blocknote-core/  # 富文本编辑器底层封装
├── server/
│   ├── ai-proxy/        # AI 中转服务（保存模型 Key、解决跨域）
│   └── mcp-bridge/      # 让外部 MCP 客户端操作桌面版
├── scripts/             # 启动、发版辅助脚本
└── docs/                # 产品与架构文档
```

代码约定和各模块入口见 [AGENTS.md](../AGENTS.md)；解析 / 渲染原理见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

## 技术栈

| 层级 | 选型 |
|------|------|
| UI | React 18、Ant Design 5、lucide-react |
| 构建 | Vite 5、pnpm workspace |
| 桌面 | Electron 33（正式版）· Tauri 2（迁移预览） |
| 状态 | Zustand（persist） |
| Markdown 核心 | 自研 parser / renderer（`packages/markdown-core`） |
| 代码高亮 | Shiki |
| 图表 | Mermaid（随应用打包，按需加载） |
| 富文本 | BlockNote |
| AI | Agent 引擎 + 工具注册表（`apps/editor/renderer/src/core/agent/`） |
| 存储 | localStorage（网页版）· SQLite + FTS5（Electron 与 Tauri 各自独立） |

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

推送 tag 后 CI 会构建 `.dmg` 并发布到 GitHub Releases。完整检查清单见 [release-process.md](./release-process.md)。

Tauri 预览包使用 `.github/workflows/tauri-preview.yml` 手动构建，不跟随 tag 发布，也不覆盖 Electron Release。

## 部署网页版到 GitHub Pages

每次推送 `main` 都会通过 `.github/workflows/deploy-pages.yml` 自动构建部署，也可以在 Actions 页签手动触发。

不要改回 tag 触发：`github-pages` 环境默认只允许从默认分支部署，tag 触发时 build 能过、deploy 会被保护规则直接拒绝（job 失败且没有日志）。

第一次启用需要在仓库 **Settings → Pages** 把 **Source** 设为 **GitHub Actions**。

CI 会把 Vite 的 `base` 自动设为 `/<仓库名>/`，本地开发仍是 `/`。如果 Pages 上静态资源 404，先检查这一项。

## 其他文档

| 主题 | 文档 |
|------|------|
| 每个界面能干什么 | [产品功能说明.md](./产品功能说明.md) |
| 内容创作路线图 | [content-creation-roadmap.md](./content-creation-roadmap.md) |
| 编辑器设计取向 | [editor-philosophy.md](./editor-philosophy.md) |
| AI 助手验收清单 | [ai-assistant-quality-checklist.md](./ai-assistant-quality-checklist.md) |
| 今日速记类别说明 | [daily-notebook-task-category.md](./daily-notebook-task-category.md) |
| 知识库进度 / 路线 | [knowledge-base-progress.md](./knowledge-base-progress.md) · [knowledge-base-roadmap.md](./knowledge-base-roadmap.md) |
| Tauri 2 迁移 | [tauri-migration-plan.md](./tauri-migration-plan.md) |
