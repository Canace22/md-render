# Tauri 2 正式替换 Electron 发布

日期：2026-10-14

## 结果

桌面正式发布链已经从 Electron 切换到 Tauri 2：`v*` tag 只发布 macOS Universal DMG 和 Windows x64 Inno Setup。Electron 仍可从 Actions 手动构建回退包，但不再进入 GitHub Release。

Tauri 产品名、窗口名和可执行文件统一为 `MD Render` / `md-render`。内部 identifier 继续冻结为 `com.mdrender.app.tauri-preview`，因为它已经承载 Tauri SQLite、WebView profile 和单实例身份；改这个值会再次切换数据目录，让已有数据看起来消失。

## 发布链

- tag、根目录版本和 editor 版本必须一致。
- tag 指向的 commit 必须位于 `origin/main` 历史上。
- macOS 缺少任一 Developer ID / 公证 secret 时直接失败；正式包必须通过 codesign、Gatekeeper、stapler、DMG 和 Universal 架构校验。
- Windows 缺少 PFX 时直接失败；应用、安装包、安装后应用和卸载器都要通过 Authenticode 校验，并完成安装、启动和卸载冒烟检查。
- 两端都生成 SHA-256 文件，全部成功后才创建 GitHub Release。
- `AI_PROXY_BASE` 是可选 HTTPS 仓库变量；留空时用户需在应用内配置代理。

## 数据安全与升级

旧 Electron 数据不会自动出现在 Tauri 中，但没有被删除。第一次升级需要：

1. 完全退出 Electron。
2. 手动安装 Tauri 新版。
3. 已有 Tauri 预览数据会自动沿用；只有需要恢复 Electron 数据时，才在 **设置 → Electron 数据交接** 选择旧 `knowledge.db`。
4. Electron 导入不是合并：它会先把当前 Tauri 库备份为 `knowledge.before-import.<timestamp>.db`，再用 Electron 数据替换。两边都有新内容时，先导出 JSON 备份并另存重要文稿。
5. 重新选择原本的本地工作区，恢复写入授权。

旧库通常位于 macOS 的 `~/Library/Application Support/md-render/knowledge.db`，或 Windows 的 `%APPDATA%\md-render\knowledge.db`；找不到时再检查同级 `@md-render/editor` 和 `MD Render` 目录。Electron 源库只读且保持不变；迁移确认前不要删除旧库。

导入前备份位于 macOS 的 `~/Library/Application Support/com.mdrender.app.tauri-preview/`，或 Windows 的 `%APPDATA%\com.mdrender.app.tauri-preview\`；成功弹窗会显示具体文件名。

旧 Electron updater 无法跨框架安装 Tauri。自定义 Inno 包也尚未接入 Tauri updater，因此首次迁移和后续版本当前都从 Releases 手动安装。

## Node.js 边界

安装后的 Tauri 应用直接使用系统 WebView，不捆绑 Node / Electron 运行时，也不依赖用户预装 Node.js。AI 请求通过可达的 `ai-proxy`；只有用户选择在本机自行运行仓库里的代理服务时才需要 Node.js。

## 当前未迁移能力

- PDF 导出
- 自动更新
- 本机 Codex / Claude 等 Agent
- HTTP / stdio MCP
- 数据文件化和“外部 Agent 接入”设置
- 自定义 skill 新建和编辑

对应入口在 Tauri 中隐藏。Electron 回退壳保留相关代码不等于正式 Tauri Release 已支持。

## 验证证据

- `cargo check --manifest-path apps/editor/src-tauri/Cargo.toml` 通过。
- `pnpm --filter @md-render/editor build` 通过；只有既有 browser externalization 和 chunk 提示。
- `APPLE_SIGNING_IDENTITY=- pnpm tauri:build:mac` 通过。
- 本地生成 `MD Render.app` 约 24.91 MiB，DMG 约 10.54 MiB。
- app 的 `codesign --verify --deep --strict` 和 DMG 的 `hdiutil verify` 通过。
- 主程序为 arm64 `md-render`，动态链接检查没有 Node / Electron 运行时。
- GitHub Actions YAML 解析、JSON capability 解析、`git diff --check` 和提交前敏感信息扫描通过。
- 本地只有 ad-hoc macOS 构建证据；Developer ID 公证和 Windows 正式签名安装必须等真实 tag CI 才能确认。

## 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | tag 版本与 package 版本不同 | 发布在构建前失败 |
| 2 | tag commit 不属于 `origin/main` | 发布在构建前失败 |
| 3 | 缺少任一 Apple secret | 不生成或发布 macOS 正式包 |
| 4 | 缺少 Windows PFX 或密码 | 不生成或发布 Windows 正式包 |
| 5 | macOS 正式构建 | app / DMG 已签名、公证、staple，二进制同时含 arm64 和 x86_64 |
| 6 | Windows 正式构建 | app、installer、installed app、uninstaller 全部签名，并能安装、启动、卸载 |
| 7 | Electron 老用户交接数据库 | 明确提示替换而非合并；当前 Tauri 库先备份，Electron 源库保持不变 |
| 8 | 已使用过 Tauri 预览版 | 不执行导入也能继续读取原 Tauri 数据与 WebView profile |
| 9 | 未配置 `AI_PROXY_BASE` | 应用可安装运行，AI 明确要求用户填写可达代理；普通用户无需 Node |
| 10 | 正式 tag 发布 | Release 只含 Tauri 产物和校验文件，Electron 回退包只存在于手动 Actions artifact |

## 回退边界

首个稳定发布周期保留 `.github/workflows/ci.yml` 手动构建 Electron macOS / Windows 回退包，产物保留 7 天。回退时不能同时打开两套应用写同一业务数据。确认数据迁移和双端正式包稳定后，再单独决定是否删除 Electron 专用代码。
