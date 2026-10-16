# Tauri 数据库工作区与关窗修复

日期：2026-10-16

## 结果

Electron 时期的工作区以 SQLite 为应用内数据，`Documents/MdRender` 同时可作为本地存档。Tauri 迁移曾错把 `projectRootPath` 当成“外部目录挂载”证据，造成全部工作区标记“本地”、只读且反复要求授权。本次修复了四个问题：

- Electron 导入节点恢复为 SQLite 可编辑数据，不再显示“本地”或要求授权；磁盘存档不再改变其工作区身份。
- 只有用户在 Tauri 里主动打开的目录才持久化 `tauri-directory` 来源，并使用 Rust 私有授权记录恢复。
- SQLite 异步水合完成前禁止持久化，防止启动 effect 用“示例文档”覆盖用户数据库。
- Tauri 红点关闭在安全排空待写入内容后改为最小化，不再销毁主窗口。最小化完成后会解除数据保护 barrier，恢复窗口后可继续编辑。

## 数据边界

- SQLite 是 Electron 导入工作区的主数据。启动时去掉旧的本地挂载字段，但保留 ID、内容、关联和相对路径。
- 会话 mount token 仍然不进 SQLite、BlockNote 内容、关系 ID 或封面地址。新打开目录的真实路径和访问级别只存在 Rust 私有授权文件中。
- 真实验收中触发了旧的启动写入竞态，Tauri 库一度被默认工作区覆盖。已用启动前的 SQLite 在线备份恢复，恢复后 `quick_check=ok`、`documents=273`。被覆盖的库也保留在备份目录中。
- Electron 旧数据库全程未修改。

## 验证记录

- 定向 Vitest：`local-project-snapshot-restore.test.js` 8/8 通过。
- 实际构建：`tauri build --bundles app` 通过，只有已有的 browser externalization 和大 chunk 警告。
- 真实 `.app` 启动：9 个顶层工作区都没有“本地”标签和授权按钮，可直接打开文档。
- 完整进程重启后界面仍保持正确，SQLite 启动前后均为 `quick_check=ok`、`documents=273`、顶层节点 9 个。
- 点击 macOS 红色关闭按钮后窗口最小化，进程仍运行；重新唤起后内容保留。
- `git diff --check` 通过，未留下 Vite/Vitest timestamp 临时文件。
- 曾因参数误传运行了全量 Vitest：709 通过、13 失败；失败为已有 Node ABI、Excalidraw 依赖和既有断言问题，与本次定向用例分开记录。

## 验收用例

| # | 场景 | 预期 |
|---|------|------|
| 1 | 加载带 `projectRootPath` 但不是 Tauri 主动挂载的节点 | 作为 SQLite 节点直接编辑，不显示“本地” |
| 2 | 加载 Electron 时期标记过 `localProjectRoot` 的快照 | 数据库内容仍为主数据，不强制重新授权 |
| 3 | 用户在 Tauri 主动打开新目录 | 写入 `tauri-directory` 来源标记，保留真正本地挂载语义 |
| 4 | SQLite 尚未水合时启动 effect 更新界面状态 | 不产生任何数据库写入 |
| 5 | 水合后正常编辑 | 持久化恢复，SQLite 保存正常 |
| 6 | 完整退出并重启 | 273 条文档和 9 个顶层节点保持，无授权提示 |
| 7 | 点击 macOS 红点 | 先排空待写入内容，然后最小化，进程不退出 |
| 8 | 最小化后重新唤起 | 原工作区和选中状态仍可用 |
| 9 | 启动前后数据库检查 | `quick_check=ok`，文档数不减少 |
| 10 | 数据库快照含失效 mount token | 去掉 token 与磁盘字段，保留 ID、正文和关联 |
