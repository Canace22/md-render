---
name: md-render-tauri-migration
description: 在 md-render 把 Electron 能力分阶段迁到 Tauri 2、维护双壳、接 Rust command、处理 WebView 数据隔离或构建安装包时使用。触发场景包括“换成 Tauri”“迁移 Electron”“Tauri 数据没了”“接系统 WebView”“Tauri 打包”“迁移文件/数据库/更新器”。略主动。
---

# md-render Tauri 迁移

把 Tauri 当成新的系统壳，复用现有 Renderer，但逐项迁移系统能力。Electron 在验收完成前继续作为正式版，避免一次切换造成数据、功能或发布链路回归。

## 为什么这样做

Tauri 不携带 Node 运行时，但现有文件、SQLite、Agent、MCP 和更新能力依赖 Electron 主进程。页面能在 WebView 打开，只能证明 UI 可加载，不能证明桌面能力已经迁移。

Tauri WebView 还有独立浏览器 profile。首次打开看不到 Electron 的 `localStorage` 或工作区，不代表原数据被删除；任何迁移都必须从副本和白名单开始，不能直接覆盖正式数据。

## 步骤

1. 定向搜索当前能力的完整调用链：React → store/service → `window.electronAPI` → preload → main service。
2. 先写清参数、返回值、错误语义和数据位置，再决定 Rust command、Tauri plugin 或自定义协议的落点。
3. 保持 `desktopBridge.js` 只做运行时识别和跨壳公共能力；不要伪造 `window.electronAPI`，也不要让未迁移能力误报可用。
4. Tauri 使用独立应用名、bundle identifier、开发端口和数据目录。预览窗口必须明确标注“隔离数据，非正式版”。
5. capability 从空权限开始，只增加当前功能必需项。页面仍有外部 CDN 时不要开放文件、进程或 shell 等高风险能力；先本地化资源并启用严格 CSP。
6. 应用版本从 `apps/editor/package.json` 读取；Rust 运行时通过 `AppHandle.package_info()` 返回版本，不再另写一份用户可见版本。
7. 一次只迁移一个能力。先在副本上验证读，再验证写、监听、取消和错误路径；通过后才替换对应 Electron 路径。
8. 每个独立功能验证通过后立即提交。Electron 正式链路保持可构建、可启动，直到 Tauri 达到切换门槛。

### 只读目录的迁移模式

- 部分能力要单独声明，例如 `canOpen / canRead / canWrite / canUseDefaultWorkspace`；不要因为 Tauri 能读目录，就让原来的“本地项目完整可用”判断返回 true。
- 真实目录由 Rust registry 持有，Renderer 只拿绑定当前窗口的短期不透明 token；后续读取只传 token 与相对路径，不返回或接受任意绝对根路径。
- 目录 token、扫描树和选中节点都属于当前会话，持久化 workspace 前必须剔除；移除挂载时立即 revoke token 并清掉子树标签，重启后要求用户重新授权。
- `readOnly` 从挂载根递归传给后代，并同时约束 UI、store action、AI/Agent 提案和元数据入口；不能只靠隐藏按钮。
- 读取前再次校验文件类型、相对路径、符号链接、规范化后的目录边界和体积上限。保持 capability 最小化，目录选择器可由 Rust 直接调用，不必给 Renderer 通用 `dialog/fs` 权限。

## 关键约束与易踩坑

- 最终用户不需要 Node、pnpm 或 Rust；这些只属于开发和构建环境。
- macOS 使用 WKWebView，Windows 使用 WebView2；Linux WebKitGTK 不是本阶段发布承诺。
- 不把“窗口打开”“前端 build 通过”当成数据迁移成功；必须观察真实 command、真实文件副本或真实数据库结果。
- 不直接复制整个 WebView profile。只迁移明确列出的设置，并为每项提供默认值和失败回退。
- 不把正式版用户数据目录改成预览目录，也不在预览阶段移动、清理或重建正式数据库。
- Electron 与 Tauri 构建模式不能同时启用；专用端口必须避开现有服务占用。
- macOS 安装包要区分当前架构与 universal；对外发布前补齐 Developer ID 签名、公证和更新渠道。
- Windows 安装位置、WebView2 策略、签名和 Inno Setup 要单独验收，不能从 macOS 结果外推。

## 验证

默认不主动跑 Vitest、Playwright 或 E2E；用户明确要求时再执行。代码完成后至少列出以下 10 条 case，并按当前改动范围做构建、真实启动或人工验证：

1. Web 模式仍识别为 `web`，不暴露桌面能力。
2. Electron 模式仍识别为 `electron`，原 preload 和 IPC 正常。
3. Tauri 模式识别为 `tauri`，平台名保持 `darwin / win32 / linux` 约定。
4. Rust command 返回真实运行时、平台和应用版本。
5. Electron 与 Tauri 环境变量同时存在时立即失败。
6. Tauri 预览使用独立 bundle identifier 和数据目录。
7. 预览空工作区不会修改 Electron 数据库、WAL 或工作区文件。
8. 未迁移能力明确不可用，不出现“按钮可点但静默失败”。
9. Tauri 产物能启动，且包内不携带 Node runtime。
10. Electron 正式构建仍通过，打包产物不混入 Tauri 构建目录。

执行过构建或测试后，检查并清理 `vite.config.*.timestamp-*.mjs`、`vitest.config.*.timestamp-*.mjs` 等临时产物；`src-tauri/target/` 和生成 schema 保持忽略。

## 完成标准

- 当前功能在真实 Tauri 窗口中有可复核证据。
- 正式 Electron 数据未被移动、覆盖或重建。
- 权限、数据隔离、签名和未迁移能力在文档中说清楚。
- 相关 Tauri 构建通过，Electron 回归边界有验证记录。
- 总结明确区分已完成、尚未迁移和未经证明的性能结论。
