# Tauri 本机 Agent 识别修复

日期：2026-10-16

## 结果

- Tauri 版 AI 来源现在能检测本机安装的 Codex、Claude Code 和 Cursor，不再只显示 API 服务商。
- Renderer 沿用现有来源选择和会话逻辑，按运行时选择 Electron preload 或 Tauri command，没有伪造 `window.electronAPI`。
- Tauri 通道支持检测、模型/思考强度选择、运行、会话续接、事件回传和取消。
- Agent 工作目录由 Rust 根据当前窗口的 mount id 解析，Renderer 不获取真实绝对路径；没有挂载项目时使用应用私有工作目录。

## 根因

本机 Agent 原来只有 Electron 链路：`window.electronAPI.localAgent → IPC → Node 进程管理`。Tauri 正式切换后，`hasLocalAgentDetection()` 仍只检查 Electron preload，因此 Tauri 会在数据层直接过滤所有本机 Agent，下拉菜单只剩 API 服务商。

## 实现边界

- Rust 只允许启动注册表中的三个 Agent，参数由固定适配逻辑组装，不提供通用 shell 接口。
- 检测合并 login shell 环境、当前进程环境和常见安装目录，覆盖 macOS 从 Finder 启动时 PATH 不完整的情况。
- 运行期只接受本窗口已注册的 mount id，取消时终止 Agent 进程组。
- Electron 的 `mcp-bridge` 依赖 Node 运行时，本次没有伪装迁移完成。Tauri 运行后会明确提示：当前只能操作已授权项目或应用私有目录，md-render 内部工具待单独迁移。

## 验证证据

- `cargo fmt --manifest-path apps/editor/src-tauri/Cargo.toml -- --check` 通过。
- `cargo check --manifest-path apps/editor/src-tauri/Cargo.toml` 通过。
- `pnpm --filter @md-render/editor build` 通过；仅有项目原有的浏览器兼容和 chunk 体积警告。
- `git diff --check` 通过。
- 未执行 Vitest、Playwright 或 E2E；未在真实 Tauri 窗口中手动点击验收。

## 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | macOS 本机已安装并登录 Codex | Tauri 下拉显示 Codex，可选模型并发送消息 |
| 2 | 已安装 Claude Code，无独立登录检查命令 | 显示为可用的“未验证”来源，首轮由 CLI 返回登录结果 |
| 3 | PATH 不含 CLI，但 CLI 位于 `~/.local/bin` 或 fnm 默认目录 | 仍能检测 |
| 4 | 本机有同名 `agent` 但不是 Cursor | 不误识别为 Cursor |
| 5 | 未安装任何本机 Agent | 只显示 API 来源，设置页保留安装指引 |
| 6 | 选中已授权的 Tauri 本地项目 | Rust 从 mount id 解析 cwd，前端不暴露绝对路径 |
| 7 | 未挂载本地项目时普通聊天 | 使用应用私有工作目录，不使用 home 或系统根目录 |
| 8 | 同一 Agent 连续发送两轮 | 保留 external session id，第二轮走 resume |
| 9 | Agent 运行中点击停止 | 运行返回已取消，不回流迟到的最终答复 |
| 10 | 切回 Electron 版 | 继续使用原 preload / IPC 链路，不经过 Tauri service |
