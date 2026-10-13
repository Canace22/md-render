# Tauri 文件能力安全前置

日期：2026-10-13

## 结果

Tauri 预览壳不再加载远程字体、Highlight.js 或 Mermaid 脚本。Mermaid 改为随应用打包，Tauri 开发版和发布版都启用了明确的内容安全策略（CSP）。

这一步只收紧 WebView 的脚本来源，还没有开放或迁移任何文件读写权限，也不会读取 Electron 正式版数据。

## 为什么先做这一步

Tauri 的前端可以调用已注册的 Rust command。如果页面继续运行 CDN 脚本，远程资源一旦被篡改，也可能尝试调用这些桌面能力。因此必须先把可执行资源留在安装包内，再开始迁移工作区文件能力。

## 改动

- `renderer/index.html` 删除 Google Fonts、Highlight.js 和 Mermaid CDN 标签。
- Mermaid 作为应用直接依赖，仅在预览中出现图表时按需加载，并使用严格安全模式初始化。
- Mermaid DSL 写入预览 HTML 前会转义，避免文档内容借图表容器注入原始标签。
- Tauri 发布 CSP 只允许本地脚本和 IPC；远程展示资源只保留明确需要的 HTTPS 协议。
- 开发 CSP 仅额外允许 Vite 开发端口、HMR WebSocket 和开发期脚本求值。
- 字体回退到现有系统字体栈，不额外扩大安装包。

## 当前边界

- CSP 只约束 Tauri WebView，不改变 Web 版和 Electron 的现有运行方式。
- Tauri 的外部 AI 请求尚未迁移，因此发布 CSP 暂不允许 WebView 直连任意 HTTP/HTTPS 地址。
- 远程图片、媒体和书签 iframe 仅保留 HTTPS；HTTP 内容在 Tauri 预览版中会被拒绝。
- Highlight.js 的 CDN 脚本没有被项目代码调用；代码块继续使用现有 BlockNote/Shiki 和项目 CSS。
- Tauri capability 仍为空，文件、shell、进程和通用事件权限均未开放。

## 验证用例

| # | 输入或场景 | 预期 |
|---|---|---|
| 1 | 页面冷启动，没有 Mermaid 代码块 | 不加载 Mermaid chunk，主界面正常显示 |
| 2 | 一个标准 `flowchart` 代码块 | 切到预览后按需加载并显示 SVG |
| 3 | Mermaid DSL 含 `<`、`>`、`&` | 先以实体写入 HTML，再由 Mermaid 还原为 DSL 解析 |
| 4 | Mermaid DSL 含 `<img onerror=...>` | 标签只作为文本，不进入预览 DOM |
| 5 | 连续多个 Mermaid 代码块 | 每个未处理节点只渲染一次 |
| 6 | Mermaid 语法错误 | 记录渲染错误，React 主界面不白屏 |
| 7 | 普通代码块 | 继续由现有 BlockNote/Shiki 和项目 CSS 展示 |
| 8 | 构建后的 `index.html` | 不含任何远程 `<script>` 或 `<link>` 标签 |
| 9 | Tauri 发布窗口 | 严格 CSP 下主界面加载，`runtime_info` 仍返回真实版本 |
| 10 | capability 与正式数据 | 文件权限仍为空，不读取或写入 Electron 数据 |

## 本次实际验证

- `pnpm build` 通过。
- `ELECTRON=true pnpm --filter @md-render/editor build` 通过。
- `pnpm tauri:build:mac` 通过，生成约 19.47 MiB 的 `.app` 和约 8.64 MiB 的 `.dmg`。
- 实际启动发布版 `.app`，严格 CSP 下主界面、预览隔离提示和 `runtime_info` 均正常。
- 构建后的 `index.html` 不含远程 `<script>` 或 `<link>`。
- 用恶意 Mermaid 文本做渲染诊断，`<img onerror=...>` 与 `&` 均被 HTML 实体转义。
- 按项目约定未运行单元测试、E2E 或 Playwright；上表未覆盖的交互场景仍是后续回归项。
