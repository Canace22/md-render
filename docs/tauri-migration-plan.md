# Tauri 2 桌面端迁移方案

## 当前结论

正式桌面发布已经从 Electron 切到 Tauri 2。它复用现有 React/Vite 界面，系统能力改由 Rust command 提供，macOS 使用 WKWebView，Windows 使用 WebView2。Electron 只保留一个稳定发布周期的手动回退包，不再进入 `v*` tag 的 GitHub Release。

当前代码已接入可控本地目录、Tauri 私有 SQLite/FTS、显式旧库导入、远程 AI 代理、本地媒体、原生保存导出和外链打开。首个正式版明确不包含 PDF、自动更新、本机 Agent、本机 MCP、“数据文件化”和自定义 skill 编辑；这些入口会隐藏，不伪装成可用。

最终用户不需要安装 Node.js、pnpm 或 Rust。Node.js 和 Rust 只用于开发与构建。但 AI 功能仍需要一个可达的 `ai-proxy`：Tauri 客户端不会自动启动本地 Node 服务。

## 稳定身份与 Electron 回退

Electron 与 Tauri 的 WebView profile、应用标识和数据目录彼此独立。Tauri 首次打开时看不到 Electron 里的工作区，是数据隔离的结果，不是原数据被删除。

正式切换后仍遵守三条原则：

- Electron 与 Tauri 不同时写同一个数据库。
- Tauri 不自动猜测或读取 Electron 的旧数据目录，只走用户主动发起的交接。
- 未迁移能力在 Tauri 中隐藏或明确报错，不伪装成已可用。

内部 bundle identifier 永久保留为 `com.mdrender.app.tauri-preview`。这个值已经承载 Tauri 的 SQLite、WebView profile 和单实例身份；为去掉 `preview` 字样而改名会再次切换数据目录，让已有 Tauri 用户看起来“数据又没了”。正式身份由产品名、可执行文件、签名和发布链路决定，不由 identifier 文案决定。

## 当前能力

| 能力 | 当前状态 | 边界 |
|---|---|---|
| React/Vite 界面 | 已复用 | Electron、Tauri 和 Web 使用同一套 Renderer |
| 本地目录 | 已接入只读与读写模式 | 必须由用户选择；关闭应用后需重新授权 |
| Markdown 文件操作 | 已接入 | 读写、新建、改名、删除、在文件管理器显示；仍需真实 UI 回归 |
| 外部变更检测 | 已接入 | 先轮询轻量 revision，变化后才重新扫描 |
| 本地媒体 | 已接入 | 图片写入工作区 `assets/`，Markdown 保留相对路径，预览通过受控 `local-media` 协议 |
| SQLite / FTS5 | 已在 Rust 侧接入 | 使用 Tauri 自己的 `knowledge.db`，不与 Electron 共用 |
| Electron 旧库导入 | 已接入显式导入 | 必须先退出 Electron；源库只读；替换而非合并；切换前备份当前 Tauri 库 |
| AI API | 已接入 Tauri 请求通道 | 需用户配置可达 `ai-proxy`；生产建议 HTTPS |
| MD / HTML / DOCX 导出 | 已接入原生保存对话框 | Rust 原子写入；需真实产物交互验收 |
| 外部链接 | 已接入系统打开 | 只允许 `http` / `https` |
| PDF 导出 | 未迁移 | Tauri 中不展示 PDF 导出入口 |
| 自动更新 | 未迁移 | Electron updater 不在 Tauri 中误报可用 |
| 本机 Agent / MCP | 未迁移 | 不会调用系统 Node 或 Electron `run-as-node` |
| 数据文件化 / 外部 Agent 设置 | 未迁移 | 依赖 Electron vault bridge，Tauri 中隐藏 |
| 自定义 skill 新建 / 编辑 | 未迁移 | 内置 skill 可运行，文件编辑依赖 Electron vault bridge |

## 本地目录的授权模型

用户在设置中选择“只读打开”或“读写打开”。Rust 保存真实目录，Renderer 只拿到绑定当前窗口的不透明 token：

- `tauri-ro:v1:*` 只能读取。
- `tauri-rw:v1:*` 允许受控写入。
- 后续操作只传 token 和相对路径，不把绝对根路径当成能力凭证。
- 会话 token 不持久化。应用只保存去掉真实路径和 token 的最新挂载快照，并使用稳定的 opaque identity 维持文档、评论、双链和版本关系；重启后快照只读，重新授权后才恢复磁盘写入。
- 从 Electron 导入的旧挂载只保留为只读快照，Tauri 不用其中的旧绝对路径直接写盘；用户需重新选择目录。

读写路径还会检查相对路径、符号链接、文件类型、体积限制和修改时间。同一挂载的写操作会串行执行，避免正文和 frontmatter 互相覆盖。目录删除只允许作用于已完整扫描且没有被忽略内容的子树。

目录扫描会单独返回是否完整。达到文件数、总体积或深度上限，或遇到 I/O、类型、编码、扫描期间变化等异常时，结果不具备覆盖资格；自动刷新、手动“使用磁盘版本”和重新授权都保留原快照、文档 ID 与版本历史。

退出、移除挂载和导入旧库前会先锁住新编辑，依次排空正文、Daily、画布、图片、metadata、Rust 文件队列和 SQLite 写入。任一保存失败都会取消当前操作。Tauri 还启用了单实例，第二次启动只聚焦已有窗口，避免两套会话同时写同一私有数据库。

## 数据库隔离与导入

Tauri 在自己的系统应用数据目录中管理 `knowledge.db`。这个数据库用来保存应用状态、文档索引、双链和版本历史；用户主动选择的 Markdown 工作区仍在原位，不会被搬进应用私有目录。

Electron 旧库通常位于 macOS 的 `~/Library/Application Support/md-render/knowledge.db`，或 Windows 的 `%APPDATA%\md-render\knowledge.db`。找不到时，再检查同级的 `@md-render/editor` 和 `MD Render` 目录。已有 Tauri 预览数据会继续跟随冻结的 `com.mdrender.app.tauri-preview` identifier 自动沿用，不需要导入；“继承 Tauri 预览数据”和“导入 Electron 旧库”是两条不同路径。

当前 Tauri 库和导入前备份位于 macOS 的 `~/Library/Application Support/com.mdrender.app.tauri-preview/`，或 Windows 的 `%APPDATA%\com.mdrender.app.tauri-preview\`。成功弹窗会显示本次 `knowledge.before-import.<timestamp>.db` 的实际文件名。

需要带入 Electron 旧数据时，在 **设置 → Electron 数据交接** 手动选择 `knowledge.db`。**导入不是合并**：它会用 Electron 数据替换当前 Tauri 数据；两边都有新内容时，先导出 Tauri JSON 备份并另存重要文稿。导入流程是：

1. 先锁住交互，排空文件、图片、metadata 与 SQLite 保存，再冻结新的状态和 Rust 写入。
2. 以只读方式打开源库，校验 schema 白名单和 `PRAGMA quick_check`。
3. 把业务表复制到新候选库，重建 FTS，比对记录数、工作区 JSON 与文档 ID。
4. 把 Tauri 当前库备份为 `knowledge.before-import.<timestamp>.db`，再切换候选库；新库无法重新打开时恢复原库。
5. 源库保持不变；成功后保持冻结直到重载，失败才恢复当前会话。

**导入前必须完全退出 Electron。** Electron 运行时，最新写入可能还在 `knowledge.db-wal` 中。此时只复制一个 `.db` 文件可能丢失最新内容。安全做法是退出 Electron 后直接选原库，或在退出后复制出完整副本再选择。导入成功后仍需重新授权本地目录；完成数据、搜索和历史回归前不要删除旧库。

## AI 与 Node.js 边界

Tauri 客户端的 AI 请求、流式事件、取消、知识库搜索和附件文本提取已有 Rust 桥接。用户机器不需要 Node.js，但需在 AI 设置中填入一个可达的 `ai-proxy` 地址。

- 本地开发可以手动启动仓库里的 Node `ai-proxy`。
- 发给普通用户时，应配置稳定的 HTTPS 代理服务。
- Tauri 不会检测或启动用户机器上的 `node` 命令。
- 本机 Codex / Claude 等 Agent、HTTP MCP 与 stdio MCP 只保留在 Electron 回退壳，不属于正式 Release。

## 安装与发布

### Windows

- 使用 Inno Setup 6 生成现代化安装向导，包含通用 MIT 许可展示和可选桌面快捷方式。
- 应用程序默认安装到 `Program Files`，不把可执行文件安装到 AppData。
- 用户内容留在用户选择的目录。配置、缓存和 Tauri 私有 SQLite 仍遵守 Windows 的用户数据目录约定；不能把这些可变数据写进 `Program Files`，也不承诺“完全不用 AppData”。
- 安装包携带并调用 Microsoft WebView2 Evergreen Bootstrapper，构建脚本会验证其 Microsoft 数字签名。
- CI 在 PFX secrets 齐全时签名应用、安装包和卸载器；缺少证书时生成文件名带 `-unsigned` 的未签名包。

Inno Setup 不能代替代码签名。是否出现 SmartScreen 提示还取决于签名状态、可信证书和发布信誉，不能承诺绝不弹窗。CI 会完成静默安装、启动和卸载，有签名时再复核签名；旧 Electron NSIS 与新 Inno 的并存、快捷方式和卸载顺序仍需 Windows 实机回归。

### macOS

- 本地可构建当前架构的 `.app` 和 `.dmg`。
- 正式 tag 工作流构建 `universal-apple-darwin` 产物，同时包含 Apple Silicon 和 Intel 架构。
- Developer ID secrets 齐全时执行正式签名、Apple 公证与 stapling；缺少任一 secret 时使用 ad-hoc 签名，并生成文件名带 `-unsigned` 的包。

Windows 和 macOS 的包体、启动时间与空闲内存都以同一台机器、同一份数据下的实际测量为准，不预设数字。

## 验证边界

“代码已接入”、“构建通过”和“正式签名发布通过”是三个不同结论。当前分支只能按已有证据声明状态：

- Rust 编译检查、Renderer 构建和 macOS 当前架构 Tauri 发布构建已通过。
- 本地生成的 `MD Render.app` 约 24.91 MiB，DMG 约 10.54 MiB；这只是本机当前版本样本，不是跨平台体积承诺。
- 本地 ad-hoc `codesign` 结构校验和 DMG 完整性校验通过；主程序没有链接 Node / Electron 运行时。
- 正式 Developer ID 公证和 Windows Authenticode 只能在配置真实凭证的 tag CI 中确认，本地结果不能代替。
- macOS 成功不代表 Windows WebView2、UAC、Inno、输入法、SmartScreen 或 Electron 共存升级已经实机验证。
- 数据导入先用合成旧库或完整副本测试，不拿正在使用的 Electron 旧库做破坏性验证。

## 正式切换后的待办

1. 在 macOS 和 Windows 正式签名 CI 中完成首个 tag 发布，并保存签名、公证、安装和卸载证据。
2. 在 Windows 实机验证与旧 Electron NSIS 共存、快捷方式、中文输入和两边卸载顺序。
3. 继续回归旧库导入、重启持久化、搜索、双链、版本历史和工作区重新授权。
4. 单独规划 Tauri updater；当前自定义 Inno 包继续从 Releases 手动更新，不冒充已支持自动升级。
5. 逐项迁移 PDF、本机 Agent、MCP、数据文件化和自定义 skill 编辑，再恢复对应入口。
6. 至少保留一个稳定发布周期的 Electron 回退包，确认迁移无阻断后再决定是否删除 Electron 专用代码。
