# Tauri 新版本提示

日期：2026-10-16

## 结果

Tauri 正式包恢复了新版本提示。应用启动 3 秒后检查 GitHub 最新正式 Release，之后每 30 分钟检查一次；只有远端版本高于当前安装版本时，才显示顶部通知条。

通知条会展示精确版本号，点击“前往下载”打开该版本的 GitHub Release 页。无更新或检查失败时不打扰用户。

## 实现边界

- Renderer 新增统一更新 bridge：Electron 继续使用原 preload updater，Tauri 调用独立 Rust command。
- Rust 向 GitHub `releases/latest` 查询最新正式版，去掉 tag 的 `v` 前缀后按 semver 比较，避免 `1.0.10` 和 `1.0.9` 被字符串顺序误判。
- GitHub 返回的 Release 页链接继续经过现有 `http/https` 外链校验后交给系统浏览器。
- Tauri 开发模式不自动检查，避免本地调试反复出现发布提示。
- 本次恢复的是“更新提示”，不是自动安装。当前 Windows 使用自定义 Inno 安装包，发布也允许无代码签名降级；在更新签名和安装器方案完成前，不伪装已支持自动下载/安装。

## 验证记录

- `cargo check --locked --manifest-path apps/editor/src-tauri/Cargo.toml` 通过。
- `TAURI_ENV_PLATFORM=macos pnpm --filter @md-render/editor build` 通过；只有项目已有的 browser externalization 和大 chunk 警告。
- GitHub live API 返回最新正式版 `v1.0.29`，链接为对应 Release；当前应用版本同为 `1.0.29`，因此预期不显示通知。
- `git diff --check` 通过，没有生成 Vite/Vitest timestamp 临时文件。
- 未运行 Vitest、Playwright 或 E2E。由于当前已是最新版，真实新版本通知的可见验收需等下一个 `v*` tag 发布后在旧安装包中确认。

## 验收用例

| # | 场景 | 预期 |
|---|------|------|
| 1 | Tauri 当前版本低于最新 Release | 顶部显示“新版本 vX.Y.Z 可用” |
| 2 | Tauri 当前版本等于最新 Release | 不显示通知 |
| 3 | 当前是更高的本地开发版 | 不误报有更新 |
| 4 | 最新 tag 为 `v1.0.10`，当前为 `1.0.9` | 按 semver 判定为有更新 |
| 5 | GitHub 超时、断网或限流 | 记录错误，界面不弹假的更新提示 |
| 6 | 点击 Tauri 的“前往下载” | 系统浏览器打开对应版本 Release |
| 7 | 关闭通知条 | 本轮不再显示；后续还是新版本时可再提醒 |
| 8 | Tauri 开发模式 | 不自动查 GitHub，不干扰开发 |
| 9 | Electron Windows 发现新版本 | 继续使用原有下载和安装流程 |
| 10 | Electron macOS 发现新版本 | 继续跳转 Release 手动下载 |
