# 数据层文件化（AI Native 重构 P3）

日期：2026-10-05

## 背景

内容散在 SQLite（工作区整棵树、白板、Daily 镜像）、localStorage（Daily）和工作区隐藏节点（编辑部记忆）里，外部 agent 和 Obsidian 碰不到；`Artifacts/` 是单向、扁平、同名覆盖的导出。目标是让 `~/Documents/MdRender` 下的真文件成为唯一真相，SQLite 只做索引。

## 决策（用户要求一次做完，按推荐默认执行）

- D1 内置文档迁到 `Projects/内置文档/`，保留原目录结构
- D2 Daily 用 Markdown + Dataview 行内字段；Markdown 表达不了的富文本放在文件末尾的隐藏注释里，保证往返一致
- D3 Web 版不对齐，P3 只做桌面版
- D5 没有授权读取真实数据：预演改为在你本机的迁移向导里先跑，报告确认后才写入

## 怎么用

设置 → 数据存储 → 迁移到内容库文件… → 先预演（只读，出报告）→ 确认迁移 → 完成。需要回滚：同一处「切回旧存储」。

## 改动

| 任务 | 文件 | 做法 |
|------|------|------|
| 格式 | `shared/migration/{dailyFormat,canvasFormat,memoryMerge,docsPlan}.js` | Daily/Todo ↔ Markdown、白板 ↔ JSON Canvas / .excalidraw、记忆合并去重、内置文档迁移计划（重名、链接改写、base64 抽图、元数据进 frontmatter），全部纯函数 |
| M0 / M-base-1 | `main/migration/{planMigration,executeMigration}.js` | 预演只读；执行：数据库在线备份 + 旧数据快照 → git 快照（≤200MB）→ 暂存 → 校验 → 移到目标（文档不覆盖已有）→ `state.json` + 报告 → git 提交；可重复执行，有冲突的步骤跳过 |
| M-base-2 | `database.js`、设置页 | 从当前工作区重建 FTS 和链接 |
| M-base-3 | `utils/vaultBridge.js` | 桌面版统一读写入口；Web 版保持旧存储 |
| M-base-4 | `main/migration/frontmatterIds.js`、`useVaultStorage` | 内置文档迁移后，外部新建的 Markdown 自动补 `id`，记活动日志 |
| M1 | `createHost.js` | 记忆读写 `.agent/memory/editorial.md` |
| M2 / M3 | `hooks/useVaultStorage.js`、`utils/vaultFileSync.js` | 启动从文件加载，改动防抖增量写回；外部改了重读；旧存储同步一份方便回滚 |
| M4 | `main/localProject.js`、`workspaceUtils.js` | frontmatter `id` → 节点 `docId`，`findNodeById` 按 docId 兜底，旧引用继续有效 |
| M5 | `services/vaultMigration.js`、store | 迁移后工作区去掉内置节点，作为 `Projects/内置文档` 磁盘节点重新出现；AI 在内置区新建改落到该目录 |
| M6 | `dbHandlers.js`、`planMigration.js` | 和数据库一致的 `Artifacts/` 旧导出挪到 `.agent/migration/legacy-artifacts/`，其余原地保留；之后不再导出 |
| M7 | `executeMigration.rollbackMigration`、`runVaultRollback` | 内置文档回灌成内置节点（沿用原 id）、记忆写回；`Projects/内置文档` 挪到 `.agent/migration/rollback-<时间>/` |
| U5 | `MigrationWizard.jsx`、`VaultStorageSettings.jsx` | 向导 + 设置页「数据存储」 |
| U6 | `ExternalChangeBanner.jsx`、`useLocalProjectWatcher.js` | 当前文档被外部改动：载入最新内容并提示，可对比或恢复 |
| U7 | `localProject.js`、侧栏、`DocHeader.jsx` | frontmatter 损坏只读正文并标记 |

## 设计取舍

- **迁移在主进程里用异步 IO 跑，没有单独开 worker**：耗时主要在磁盘读写，不阻塞窗口；向导期间不可操作。
- **Daily / 白板双写**：文件为准，旧存储继续同步一份，回滚不用反向导入；内置文档没法双写（节点 id 变了），回滚时从磁盘回灌。
- **去掉内置节点会让 SQLite 里这些文档的版本历史被同步删除**：迁移第一步已用 better-sqlite3 在线备份完整数据库到 `.agent/migration/backup-<时间>/knowledge.db`，报告里写明。之后的历史交给 git。
- 白板目标文件已存在且不同、Daily 往返不一致：这一步跳过，其它照常；Daily 已有同名日记按 id 合并，不丢条目。
- 不碰 `versions` 表、不迁设置类 localStorage（属于设备设置）。

## 已知限制

- 没在真实数据上预演过（D5 未授权）。第一次迁移前请先看预演报告。
- 新稿件之外，侧栏手动在根目录新建的文档原本就落在 Projects；只有 AI 在内置区新建的被改道。
- 迁移后装回旧版本：旧版只认 SQLite，看不到迁移后的修改。
- 只支持一个白板文件（`Canvas/白板.*`），多白板 UI 不在范围内。

## 验证

- 新增单测：Daily 格式 6、白板格式 4、记忆合并 3、文档计划 8、迁移执行 10（临时内容库：预演只读、执行、重复执行、冲突跳过、备份失败停止、回滚、白名单、补 id、frontmatter 损坏、节点互转）、增量写回 3、迁移数据组装 3、记忆读写文件 1。
- 构建（`pnpm build`）和真实桌面环境下的端到端还没在我这边跑过，需要你本机验证。

建议手动过一遍（先备份 `~/Documents/MdRender`）：

1. 设置 → 数据存储 → 先预演，看报告里的改名、链接改写、Artifacts 处理是否符合预期
2. 确认迁移，完成后侧栏出现「内置文档」文件夹，Daily、白板内容不变
3. 在 Obsidian 里打开 `Daily/今天.md` 勾掉一个任务，回到 app 已勾选
4. 关掉 app，删掉 `knowledge.db`，重启后内容完整，在设置里重建索引后搜索正常
5. 设置 → 切回旧存储，内置文档回到侧栏，`Projects/内置文档` 被挪到 `.agent/migration/` 下
