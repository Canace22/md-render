# Tauri 2 桌面端迁移方案

## 当前结论

Tauri 2 方案可行，但现在仍是与 Electron 并行的预览版，不会替换正式发布链路。它复用现有 React/Vite 界面，系统能力改由 Rust command 提供，macOS 使用 WKWebView，Windows 使用 WebView2。

当前分支已接入可控本地目录、Tauri 私有 SQLite/FTS、显式旧库导入、远程 AI 代理、本地媒体、原生保存导出和外链打开。PDF、自动更新、本机 Agent 和本机 MCP 还没有迁移。在双端实机、签名和数据回归验收完成前，Electron 继续是正式版。

最终用户不需要安装 Node.js、pnpm 或 Rust。Node.js 和 Rust 只用于开发与构建。但 AI 功能仍需要一个可达的 `ai-proxy`：Tauri 客户端不会自动启动本地 Node 服务。

## 为什么保留双壳

Electron 与 Tauri 的 WebView profile、应用标识和数据目录彼此独立。Tauri 首次打开时看不到 Electron 里的工作区，是数据隔离的结果，不是原数据被删除。

双壳期间遵守三条原则：

- Electron 与 Tauri 不同时写同一个数据库。
- Tauri 不自动猜测或读取 Electron 的正式数据目录。
- 未迁移能力在 Tauri 中隐藏或明确报错，不伪装成已可用。

Tauri 预览版的 bundle identifier 是 `com.mdrender.app.tauri-preview`，窗口和页面都明确标注“隔离数据，非正式版”。

## 当前能力

| 能力 | 当前状态 | 边界 |
|---|---|---|
| React/Vite 界面 | 已复用 | Electron、Tauri 和 Web 使用同一套 Renderer |
| 本地目录 | 已接入只读与读写模式 | 必须由用户选择；关闭应用后需重新授权 |
| Markdown 文件操作 | 已接入 | 读写、新建、改名、删除、在文件管理器显示；仍需真实 UI 回归 |
| 外部变更检测 | 已接入 | 先轮询轻量 revision，变化后才重新扫描 |
| 本地媒体 | 已接入 | 图片写入工作区 `assets/`，Markdown 保留相对路径，预览通过受控 `local-media` 协议 |
| SQLite / FTS5 | 已在 Rust 侧接入 | 使用 Tauri 自己的 `knowledge.db`，不与 Electron 共用 |
| Electron 旧库导入 | 已接入显式导入 | 必须先退出 Electron；源库只读；导入前后校验并保留备份 |
| AI API | 已接入 Tauri 请求通道 | 需用户配置可达 `ai-proxy`；生产建议 HTTPS |
| MD / HTML / DOCX 导出 | 已接入原生保存对话框 | Rust 原子写入；需真实产物交互验收 |
| 外部链接 | 已接入系统打开 | 只允许 `http` / `https` |
| PDF 导出 | 未迁移 | Tauri 中不展示 PDF 导出入口 |
| 自动更新 | 未迁移 | Electron updater 不在 Tauri 中误报可用 |
| 本机 Agent / MCP | 未迁移 | 不会调用系统 Node 或 Electron `run-as-node` |

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

需要带入 Electron 旧数据时，在 Tauri 设置页手动选择 `knowledge.db`。导入流程是：

1. 先锁住交互，排空文件、图片、metadata 与 SQLite 保存，再冻结新的状态和 Rust 写入。
2. 以只读方式打开源库，校验 schema 白名单和 `PRAGMA quick_check`。
3. 把业务表复制到新候选库，重建 FTS，比对记录数、工作区 JSON 与文档 ID。
4. 备份 Tauri 当前库，再切换候选库；新库无法重新打开时恢复原库。
5. 源库保持不变；成功后保持冻结直到重载，失败才恢复当前会话。

**导入前必须完全退出 Electron。** Electron 运行时，最新写入可能还在 `knowledge.db-wal` 中。此时只复制一个 `.db` 文件可能丢失最新内容。安全做法是退出 Electron 后直接选原库，或在退出后复制出完整副本再选择。

## AI 与 Node.js 边界

Tauri 客户端的 AI 请求、流式事件、取消、知识库搜索和附件文本提取已有 Rust 桥接。用户机器不需要 Node.js，但需在 AI 设置中填入一个可达的 `ai-proxy` 地址。

- 本地开发可以手动启动仓库里的 Node `ai-proxy`。
- 发给普通用户时，应配置稳定的 HTTPS 代理服务。
- Tauri 不会检测或启动用户机器上的 `node` 命令。
- 本机 Codex / Claude 等 Agent、HTTP MCP 与 stdio MCP 仍只在 Electron 正式版可用。

## 安装与发布

### Windows

- 使用 Inno Setup 6 生成现代化安装向导，包含通用 MIT 许可展示和可选桌面快捷方式。
- 应用程序默认安装到 `Program Files`，不把可执行文件安装到 AppData。
- 用户内容留在用户选择的目录。配置、缓存和 Tauri 私有 SQLite 仍遵守 Windows 的用户数据目录约定；不能把这些可变数据写进 `Program Files`，也不承诺“完全不用 AppData”。
- 安装包携带并调用 Microsoft WebView2 Evergreen Bootstrapper，构建脚本会验证其 Microsoft 数字签名。
- CI 在配置 PFX 时签名应用与卸载器；没有证书时产物会明确标记为 unsigned。

Inno Setup 不能代替代码签名。是否出现 SmartScreen 提示还取决于可信证书和发布信誉，不能从 macOS 构建结果推断。当前 Windows 工作流和安装脚本仍需 Windows 实机或 CI 完整验收。

### macOS

- 本地可构建当前架构的 `.app` 和 `.dmg`。
- 手动 CI 工作流构建 `universal-apple-darwin` 产物，同时包含 Apple Silicon 和 Intel 架构。
- 签名、Apple 公证与 stapling 依赖 Developer ID 和 Apple 账号 secrets；缺少 secrets 时只生成 ad-hoc 预览产物，不应当成已通过 Gatekeeper 发布验收。

Windows 和 macOS 的包体、启动时间与空闲内存都以同一台机器、同一份数据下的实际测量为准，不预设数字。

## 验证边界

“代码已接入”、“构建通过”和“真实交互通过”是三个不同结论。当前分支只能按已有证据声明状态：

- Rust 格式检查、锁定依赖编译、Electron 兼容构建和 macOS 当前架构 Tauri 发布构建已通过。
- 本地 ad-hoc 签名结构校验通过；它没有 Apple 公证，Gatekeeper 拒绝属于预期结果，不能当作正式发行包。
- 当前 macOS 产物能启动且单实例生效，主程序只链接系统框架，没有捆绑 Node/Electron 运行时。
- 当前开发机处于锁屏状态，本轮新增的读写、媒体、数据导入、AI 和原生导出没有完成可见 UI 人工验收。
- macOS 成功不代表 Windows WebView2、UAC、Inno、输入法或 SmartScreen 已验证。
- 没有真实证书和发布账号，不宣称签名、公证或无警告安装已通过。
- 数据导入先用合成旧库或完整副本测试，不拿正在使用的 Electron 正式库做破坏性验证。

## 切换成正式版前还需要什么

1. 在真实 Tauri 窗口中验收本地目录读写、外部变更冲突、媒体和导出。
2. 用合成旧库完成导入、重启持久化、搜索、双链和版本历史回归。
3. 用可控 `ai-proxy` 验收普通对话、流式输出、取消和失败路径。
4. 迁移 PDF、updater、本机 Agent 和 MCP，或在产品上明确它们不属于首个 Tauri 正式版。
5. 在 macOS 和 Windows 实机完成中文输入、编辑、签名安装、卸载、升级与回滚验收。
6. 至少保留一个稳定发布周期的 Electron 回滚包，再决定是否删除 Electron 专用代码。
