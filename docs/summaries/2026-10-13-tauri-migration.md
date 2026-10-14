# Tauri 2 迁移阶段总结

日期：2026-10-13

## 结果

Tauri 预览版已从“能打开界面、只读浏览目录”推进到可验收的双壳方案：本地目录可显式授予只读或读写权限，SQLite/FTS 在 Rust 侧独立运行，Electron 旧库可手动导入，AI 通过可配置的远程代理工作，媒体、普通导出和外部链接也有了 Tauri 实现。

这仍是预览版。Electron 继续是正式桌面版；PDF、自动更新、本机 Agent 和本机 MCP 还没有迁移。Windows 安装、双端签名和本轮完整 UI 流程的验收结果，必须以后续实测记录为准。

## 这次做了什么

### 1. 受控的本地目录

- 用户主动选择只读或读写打开目录。
- Rust 保管真实路径，Renderer 只持有当前窗口的 `tauri-ro:v1:*` / `tauri-rw:v1:*` 会话 token。
- 读写模式支持正文和 frontmatter 保存、新建文件与目录、改名、删除和在系统文件管理器中显示。
- 保存会检查磁盘修改时间，同一挂载的写操作会串行执行，降低覆盖外部更改和正文/元数据互相覆盖的风险。
- 目录 token 不持久化。最新内容会以去路径、去 token 的只读快照保存，使用稳定 opaque identity 维持文档、评论、双链和版本关系；重启后需重新授权才能继续写盘。
- 扫描结果只有在完整且目录结构高置信匹配时才能覆盖旧快照；文件数、总体积、深度、I/O、编码或扫描竞争异常都会保留原数据。

### 2. 媒体、导出与外链

- 粘贴或上传的图片写入工作区 `assets/`，磁盘 Markdown 保留相对路径。
- 预览使用绑定挂载 token 和相对路径的 `local-media` 协议，不向 Renderer 开放任意本地文件路径。
- MD、HTML 和 DOCX 导出走系统保存对话框，Rust 在目标目录中原子写入。
- 外链交给系统打开，且只允许 `http` / `https`。
- PDF 还没有 Tauri 实现，相关入口在 Tauri 中不展示。

### 3. SQLite / FTS 和旧数据导入

- Tauri 使用自己的 `knowledge.db`，支持工作区状态、文档、FTS 搜索、双链与版本历史。
- 设置页可显式选择 Electron `knowledge.db`。源库以只读方式打开，导入前校验 schema 和 `quick_check`。
- 业务数据先进入新候选库，FTS 重建后检查数量、工作区 JSON 和文档 ID，通过后才备份并切换 Tauri 当前库。
- 导入前会锁住界面，排空正文、Daily、画布、图片、metadata、Rust 文件队列和 SQLite，再冻结新的写入；成功后保持冻结直到重载，失败才恢复当前会话。
- 切换失败时恢复 Tauri 原库；Electron 源库始终不被修改。

**导入前必须完全退出 Electron。** Electron 运行时的最新写入可能还在 WAL 里，只复制一个 `.db` 文件不代表拿到了完整数据。

### 4. AI 通道

- 聊天、流式输出、取消、工具调用、知识搜索、网页读取和附件文本提取已经走 Rust 通道。
- Tauri 客户端不包含也不依赖用户安装 Node.js。
- AI 仍需可达的 `ai-proxy`；Tauri 不自动启动仓库中的 Node 代理。本地开发可手动运行，正式发布应使用稳定 HTTPS 代理。
- 本机 Agent 与 MCP 的进程生命周期尚未迁移。

### 5. macOS 与 Windows 安装包

- macOS 增加 Universal `.app` + `.dmg` 构建命令与手动 CI。secrets 齐全时走 Developer ID 签名、公证和 stapling；否则明确生成 ad-hoc 预览产物。
- Windows 先构建 Tauri x64 exe，再交给 Inno Setup 6。安装器使用现代化向导，显示 MIT 许可，默认安装到 `Program Files`，并运行经 Microsoft 签名验证的 WebView2 Evergreen Bootstrapper。
- Windows PFX secrets 齐全时签名 exe 和卸载器；未签名产物会明确带 `unsigned` 标记。
- 应用二进制不安装到 AppData，但配置、缓存和 SQLite 仍遵守操作系统的用户数据目录约定。

## 数据安全边界

- 预览版继续使用独立 bundle identifier 和数据目录。
- Tauri 为单实例；第二次启动只聚焦已有窗口，避免两套会话同时写同一私有数据库。
- 禁止选择 Electron 正式数据目录和默认 `Documents/MdRender` 树作为 Tauri 读写挂载。
- 目录和媒体操作只接受窗口绑定 token 与受校验的相对路径。
- 导入操作备份 Tauri 当前库，不修改 Electron 源库。
- 关窗、移除挂载、手动同步和导入都会先排空写入；任何失败都会取消操作并保留原状态。
- 没有自动搬迁、清理或重建正式 Electron 数据。

## 验证记录

| 项目 | 当前记录 |
|---|---|
| Rust 格式与编译 | `cargo fmt --all -- --check`、`cargo check --locked` 通过 |
| Web / Electron Renderer 构建 | `ELECTRON=true pnpm --filter @md-render/editor build` 通过；只有既有浏览器 externalize 与大 chunk 警告 |
| macOS Tauri 发布构建 | 当前架构 `.app` + `.dmg` 构建通过；ad-hoc `codesign --verify --deep --strict` 通过 |
| 运行时边界 | 应用可启动，单实例生效；主程序动态库中无 Node/Electron |
| 正式 Electron 数据 | 只读 `quick_check=ok`；主库 SHA-256 为 `68ec646382ccbe6d40e41668746895761ea771af74f4b58dd5014281641c3ba9`，27 条状态、273 篇文档、11 条链接、56 条历史；Electron 仍运行且持有 WAL，因此本轮未导入、未改写 |
| 真实 Tauri UI 交互 | 开发机锁屏，未完成本轮可见交互验收 |
| Windows Inno 安装与 WebView2 | 尚未在 Windows 实机验证 |
| macOS Developer ID 签名/公证 | 需真实证书与 Apple 账号验收 |
| Windows 签名/SmartScreen | 需真实 PFX、时间戳与发布信誉验收 |
| 安装包体积 | 本机当前架构 `.app` 约 24.9 MiB，`.dmg` 约 10.5 MiB；不是 Windows 安装包结论 |

构建通过只能证明工程可编译，不等于数据导入、文件写入、签名安装或 UI 交互已验收。

## 手工验收用例

1. 修改正文后立刻关窗；正文 debounce 与保存队列排空后才退出，失败时窗口保持打开。
2. 修改标题、封面或 frontmatter 后立刻关窗；metadata 成功落盘，失败状态不会被吞掉。
3. 图片仍在 `FileReader` 阶段时关窗；退出等待完整图片生命周期，不留下只有占位块的文档。
4. 图片已写入 `assets/`、但 Markdown URL 尚未回填时关窗；退出等待回填和正文保存。
5. 在内置文档、Daily 和 SQLite 文档中插图；没有本地项目根路径时也必须等待图片生命周期。
6. 触发图片写盘失败并回退 data URL；确认 fallback 完成前不退出，完成后内容仍可恢复。
7. 修改正文后在 400 ms 内移除项目；先保存再撤销 token 和节点。
8. 模拟移除前保存失败；项目、挂载、pending 状态、旧快照和版本历史全部保留。
9. 正文或 metadata 尚未落盘时点“使用磁盘版本”；先排空本地写入，再决定是否刷新。
10. 模拟扫描被截断、读取失败或扫描期间变化；`complete=false` 时自动刷新、手动覆盖和重授权都不得替换旧树与 ID。

另外还需覆盖：改名/移动后评论与双链仍跟随稳定 ID；用合成旧库验证导入/重启/搜索/版本并确认源库哈希不变；分别验证 AI 未配置、成功、取消和失败；在 macOS 与 Windows 实机完成安装、中文输入、导出、外链和卸载不删用户数据。

## 仍未完成

- Tauri PDF 导出。
- Tauri updater 与稳定更新/回滚渠道。
- 本机 Agent 进程、HTTP MCP 和 stdio MCP。
- Windows 实机 Inno/UAC/WebView2/SmartScreen 验收。
- 双平台正式证书签名与 macOS 公证。
- 同条件下的包体、冷启动、空闲内存与关键操作基准。
