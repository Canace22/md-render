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
| | `pnpm tauri:build:mac` | 打 Tauri macOS 预览版 `.app` 和 `.dmg` |
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

Tauri 迁移仍处在双壳阶段。开发机先按 [Tauri 官方前置要求](https://v2.tauri.app/start/prerequisites/) 安装当前 stable Rust，然后运行：

```bash
pnpm tauri:dev
pnpm tauri:build:mac
```

Rust、Node.js 和 pnpm 只用于开发与构建；编译后的 Tauri 应用不要求用户安装这些工具。预览版使用独立应用名、bundle identifier 和数据目录，不会覆盖 Electron 正式版。

当前预览壳已经能加载真实 Renderer，并通过 `runtime_info` command 与 Rust 通信。设置页可以手动选择目录，以只读方式浏览其中的 `.md`、`.markdown` 和 `.txt` 文件；应用不会自动查找正式版目录，也不提供保存、改名或删除。SQLite/FTS、AI/Agent、MCP、PDF、更新和完整文件工作流仍只在 Electron 正式版可用，不能把 Tauri 预览版当成正式版使用。迁移边界和验收门槛见 [tauri-migration-plan.md](./tauri-migration-plan.md)。

## 构建

```bash
pnpm build                # 网页版 → apps/editor/dist/
pnpm electron:build       # 桌面版安装包（Mac 上默认 Mac 版）→ apps/editor/release/
pnpm electron:build:win   # Windows 安装包
pnpm electron:pack        # 只生成可运行的 app 目录，不做安装包
pnpm tauri:build:mac      # Tauri macOS 预览版（当前机器架构）→ apps/editor/src-tauri/target/release/bundle/
pnpm preview              # 本地预览网页版构建（默认 http://localhost:4173）
```

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
| 图表 | Mermaid（CDN 加载） |
| 富文本 | BlockNote |
| AI | Agent 引擎 + 工具注册表（`apps/editor/renderer/src/core/agent/`） |
| 存储 | localStorage（网页版）· SQLite + FTS5（桌面版） |

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
