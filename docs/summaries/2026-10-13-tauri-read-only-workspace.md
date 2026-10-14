# Tauri 只读工作区

日期：2026-10-13

## 结果

Tauri 预览版现在可以从设置页手动选择一个或多个目录，浏览其中的 Markdown 和 TXT 文件。这个阶段只解决“原文件看得见”，不会保存、改名、移动或删除文件，也不会自动寻找 Electron 的数据库或工作区。

## 原理

- 系统目录选择器和扫描逻辑都在 Rust 内执行，Renderer 没有通用文件系统权限。
- 每个目录只向前端返回 `tauri-ro:v1:*` 会话标识和目录显示名，不返回真实绝对路径。
- 后续读取只接受会话标识与相对路径；Rust 会再次检查窗口归属、路径层级、文件类型、符号链接和目录边界。
- 首版只接收 `.md`、`.markdown`、`.txt`，并限制目录深度、条目数、文件数、单文件和总读取体积。
- 只读标记从挂载根递归传到全部后代，编辑器、标题、元数据、目录操作、看板和 AI 提案都在 UI 与 store 两层拒绝修改。
- 会话挂载不会写入持久化 workspace；手动移除时会立即注销标识并清理子树标签，关闭应用后标识也会失效，重新打开时需要用户再次选择目录。

## 数据边界

- Tauri capability 仍未开放前端 `dialog`、`fs` 或 `shell` 权限。
- Tauri 不会调用默认工作区初始化，也不会访问 `Application Support/md-render`。
- “移除项目”只移除当前界面的会话挂载，不删除磁盘文件。
- Electron 和 Web File System Access 的原有读写路由保持不变。

## 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | 在 Tauri 设置页取消目录选择 | workspace 不变，不创建挂载 |
| 2 | 选择含 Markdown/TXT 的普通目录 | 文件树和正文可浏览，不暴露绝对路径 |
| 3 | 目录含隐藏项、依赖目录、二进制或超限文件 | 受限条目被跳过，并显示跳过数量 |
| 4 | 伪造 token、绝对路径、`..`、反斜杠或符号链接 | Rust command 拒绝读取 |
| 5 | 编辑正文、标题、标签或 frontmatter | UI 不提供编辑，store 调用也返回失败 |
| 6 | 新建、重命名、移动、删除、F2、Delete 或拖拽 | 只读节点不出现入口，数据层仍拒绝 |
| 7 | AI 编辑/删除提案、插入引用、改元数据 | 明确返回只读失败，不误报成功 |
| 8 | 看板修改只读稿件状态 | 菜单禁用，元数据不变化 |
| 9 | 移除挂载并重启 Tauri | 磁盘文件不变，会话挂载不持久化 |
| 10 | Electron/Web 打开原有工作区 | 原有读写、同步与默认工作区行为不回归 |

## 尚未迁移

受控写入、目录监听、非文本预览、本地媒体协议、SQLite/FTS、AI 运行时、MCP、PDF 和自动更新仍未迁到 Tauri。Tauri 仍是预览版，Electron 继续作为正式版。

## 本次验证记录

- `pnpm build` 通过；`cargo check --locked` 通过。
- `pnpm tauri:build:mac` 通过，产物为 20.19 MiB 的 `.app` 和 8.88 MiB 的 `.dmg`。
- 在真实 Tauri release 应用中，从设置页选择仓库的 `docs` 目录后，Markdown 文件树和正文正常显示。
- 只读文件的正文、代码块语言、元数据均不可编辑；F2 不会进入改名；文件右键菜单不出现新建、改名、移动或删除。
- 退出并重新启动 Tauri 后，只读目录挂载消失，说明会话 token 和目录树没有写进持久化 workspace。
- `ELECTRON=true pnpm --filter @md-render/editor build` 通过，Electron renderer、main 和 preload 均成功构建。
- 正式版 `MdRender` 工作区仍为 158 个文件，聚合 SHA-256 与操作前一致。正式版 Electron 当时仍在运行并持有数据库、WAL 和 SHM，因此主库文件会随 checkpoint 变化，不能用单文件哈希作为静态证明；只读 `PRAGMA quick_check` 返回 `ok`，库中可见 272 篇文档和 55 条版本记录，未发现 Tauri 访问正式数据目录的证据。
- 按项目规则未运行 Vitest、Playwright 或 E2E。
