# Tauri 2 macOS 预览壳

日期：2026-10-13

## 结果

在不替换 Electron 的前提下，新增了可独立开发、构建和启动的 Tauri 2 macOS 预览壳。现有 React/Vite 界面可以在 WKWebView 中打开，前端会调用真实 Rust `runtime_info` command，返回 `tauri / darwin / 1.0.20`。

这一步只证明“双壳地基”可行，不代表文件、数据库、Agent 或发布链路已经迁移。

## 做法

| 改动 | 说明 |
|---|---|
| `apps/editor/src-tauri/` | 新增最小 Rust 应用和 Tauri 配置；当前 capability 不开放额外权限 |
| `desktopBridge.js` | 统一识别 `web / electron / tauri`，平台继续使用 `darwin / win32 / linux` |
| `electronBridge.js` | `getPlatform()` 委托给新桥接层，其余 Electron API 不动 |
| `vite.config.js` | Tauri 使用相对资源路径、独立 1420 开发端口，并忽略 `src-tauri` 监听 |
| workspace scripts | 新增 `tauri:dev`、`tauri:build` 和 `tauri:build:mac` |
| `TauriPreviewNotice.jsx` | 仅在 Tauri 中常驻显示“数据隔离”警告，明确原资料仍需在正式版查看 |
| `md-render-tauri-migration` skill | 固化双壳隔离、数据安全、最小权限和分阶段验收流程 |

预览版名为 `MD Render Tauri Preview`，窗口标题明确标注“隔离数据，非正式版”，bundle identifier 是 `com.mdrender.app.tauri-preview`，与 Electron 正式版隔离。没有给 Tauri 伪造 `window.electronAPI`，未实现的系统能力会保持未实现，不会误报可用。

应用版本从 `apps/editor/package.json` 读取，Rust command 返回 Tauri 运行时识别到的应用版本，避免后续发版时出现三处版本漂移。

## 验证

- `cargo check --manifest-path apps/editor/src-tauri/Cargo.toml` 通过。
- `pnpm build` 通过；`html-to-docx` 的 Node 模块 externalized 和大 chunk 警告是现有构建警告。
- `ELECTRON=true vite build` 通过，Renderer、main、preload 和数据库搜索 worker 均正常产出。
- `pnpm tauri:dev` 成功打开 WKWebView；真实 IPC 输出为 `[desktop-runtime] tauri darwin 1.0.20`。
- 发布版目视检查通过：`tauri://localhost` 正常显示创作首页，深浅色切换可交互，“Tauri 预览版 · 数据隔离”警告可见。
- `pnpm tauri:build:mac` 生成独立的 arm64 `.app`（19.46 MiB）和 `.dmg`（8.64 MiB，9,054,845 bytes）。
- 应用包内只有原生可执行文件、Info.plist 和图标，没有 Node runtime 文件。

没有运行 Vitest 或 Playwright；这次按项目约定只做构建、真实启动和目视交互验证。

## 当前边界

- 产物只有临时 ad-hoc 签名，尚未做 Developer ID 签名、公证或稳定更新渠道。
- 文件系统、SQLite/FTS、本地媒体、AI/Agent、MCP、PDF 和 updater 尚未迁移。
- 预览壳与 Electron 不共享浏览器 profile；首次打开看到空工作区是隔离效果，不代表 Electron 数据被删除。正式切换前还要迁移白名单内的 `localStorage` 设置。
- 当前页面仍引用外部字体和 CDN，所以 PoC 暂时未启用严格 CSP；增加文件或进程权限前必须收紧。
- 一次粗略 RSS 快照中，Tauri 主进程和对应 WebKit XPC 合计约 287 MiB，正在运行的 Electron 进程树约 239 MiB。两者启动时长和页面状态未严格对齐，不能据此下最终结论，但它已经说明“内存必然更低”目前没有被证明，需要后续做同条件基准与前端懒加载优化。

## 下一步

先迁移工作区的打开、读写、监听和本地媒体协议，保持现有业务参数、返回值和错误语义。验证数据副本无损后，再进入 SQLite/FTS；在此之前 Electron 继续作为正式桌面版本。
