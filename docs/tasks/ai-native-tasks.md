# AI Native 重构任务清单

> 来源：[`../ai-native-architecture-plan.md`](../ai-native-architecture-plan.md)、[`../ai-native-data-migration.md`](../ai-native-data-migration.md)
> 创建：2026-10-05
> 约定：每个阶段单独发版；做完一条就勾选，提交信息用「完成任务：<编号> <标题>」；较大的阶段完成后在 `docs/summaries/` 写总结。

**状态说明**：`[ ]` 待做 · `[~]` 进行中 · `[x]` 完成 · `⛔` 被决策阻塞

---

## D 决策（需要你拍板，会阻塞对应任务）

- [x] **D1** 内置文档去留：全部迁到 `Projects/内置文档/`，取消「内置文档」概念（推荐）；或者改成双向同步 → 阻塞 M5、U9
- [x] **D2** Daily 文件格式：markdown + Dataview 行内字段（推荐）；或者 md + 隐藏 json → 阻塞 M2
- [x] **D3** Web 版是否和桌面版能力对齐？不对齐的话，P3 只做桌面版 → 影响 M 系列
- [x] **D4** P1、P2 谁先做（默认 P1 先）
- [ ] **D5**（未授权：迁移向导在你本机运行时先做只读预演，报告给你确认后才写入）授权只读访问 `~/Documents/MdRender` 和 `~/Library/Application Support/md-render`，用真实数据做一次预演统计 → 阻塞 M0

> 2026-10-05 用户要求一次做完、不中途确认，D1–D4 按推荐默认执行：D1 内置文档迁到 `Projects/内置文档/`；D2 Daily 用 markdown + Dataview 行内字段（Markdown 表达不了的富文本样式存在文件末尾的隐藏注释里，保证往返一致）；D3 Web 版不对齐，P3 只做桌面版；D4 P1 先做。

---

## P0 止血：MCP 可用性

- [x] **P0-1** MCP 每次调用重新读握手文件；读不到时返回「md-render 没在运行」，不再 `process.exit`
  - 范围：`server/mcp-bridge/index.js`
  - 验收：先开 Claude Desktop 后开 app，工具可用；重启 app 后不用重启 Claude Desktop
- [x] **P0-2** app 退出时删除 `agent-bridge.json`
  - 范围：`apps/editor/main/agentBridge.js`（导出 cleanup）、`main.js` 的 `before-quit`
  - 验收：退出 app 后握手文件不存在；MCP 返回明确的报错，而不是 `fetch failed`
- [x] **P0-3** 工具失败时标记 `isError`（结果以「失败」「出错」「拒绝」开头，或者 `ok:false`）
  - 范围：`bridgeListener.js`、`mcp-bridge/index.js`
  - 验收：调用 `write_active_doc` 传空内容，MCP 端收到 `isError: true`
- [x] **P0-4** 经 MCP 调用 `write_active_doc` 时不再等待确认，立即返回「已暂存，等待用户确认」
  - 范围：`bridgeListener.js`（桥接调用走非阻塞分支）
  - 验收：调用在 1 秒内返回；用户之后点「应用」，文档正确更新
- [x] **P0-5** `stageAgentWrite` 在已有一个待确认改动时，先拒绝新的写入（或者把旧的标记为 superseded 并 resolve），不再静默覆盖
  - 范围：`store/slices/agentSlice.js`
  - 验收：连续两次写入，第一个 Promise 能结束，不会一直挂起
- [x] **P0-6** 给上面的改动补单测
  - 范围：`tests-unit/agent-bridge.test.js`

> P0 已知限制：待确认改动只在编辑器的 `DiffOverlay` 里显示；用户不在编辑器界面时，外部 agent 的后续写入会一直收到「写入被拒绝」，直到用户处理。U3（待确认收件箱）解决。

---

## P1 功能 skill 化

- [x] **P1-1** 定义 skill 格式：`SKILL.md` + `agents/md-render.yaml`（`label / entry / input / tools / output`），写进 `.agents/skills/README.md`
- [x] **P1-2** 新建 `core/agent/skillRegistry.js`：加载内置（`apps/editor/resources/skills/`）和内容库（`MdRender/.agents/skills/`）两处，后者覆盖同名的前者；解析 yaml；纯函数部分可单测
  - 验收：同名 skill 以内容库的为准；yaml 格式错误时跳过并给出提示，不影响其他 skill
- [x] **P1-3** 主进程新增读取 skill 目录的 IPC，并监听目录变化（复用 watcher 思路）
  - 范围：`main/ipc/` 新增 handler、`preload.js`
  - 验收：新增或修改 skill 文件，不重启就能生效
- [x] **P1-4** 迁移平台版 skill：公众号、小红书、知乎。prompt 从 `utils/platformVariant.js` 搬进 SKILL.md
- [x] **P1-5** 迁移改写类 skill：提纲、扩写、续写、润色、压缩、标题建议、关键要点（来源 `utils/aiActions.js`）
  - 备注：tone（改语气）、subheadings（小标题）界面原本就没露出，迁成 skill 时 `entry: []`
- [x] **P1-6** 迁移编辑部 skill：审稿、标题分析、发布复盘。`ai-editorial-board` 移到 `resources/skills/`；`editorialBoard.js` 不再用 `?raw` 内联，改为从 registry 读取
- [x] **P1-7** 迁移入口类 skill：选题、新稿件、资料单、待发布稿、今日任务、今日笔记、待办池、白板流程图、白板卡片、生成交付物
- [x] **P1-8** 引擎按 skill 的 `tools` 白名单裁剪工具，执行器层再拦截一次
  - 范围：`agentEngine.js`、`toolRegistry.js`
  - 验收：skill 调用未声明的工具会被拒绝，拒绝结果回填给模型
- [x] **P1-9** `AgentPanel` 用统一的 `runSkill(skillId, input)` 替换 agent / quick / platform 三套 handler；删除 `PROJECT_SLASH_SKILLS`、`EDITORIAL_SKILLS`、`EXTRA_PLATFORM_SLASH_SKILLS` 等常量
  - 备注：新增 `composer` 入口（输入框「+」菜单）
- [x] **P1-10** PDF→Word、视频→音频从 AI 面板移出，放到文件右键菜单（不需要 AI）
- [x] **P1-11** 更新 `.agents/skills/md-render-agent/SKILL.md`：写清「加功能 = 加 skill 文件」的新规则

**UI（P1）**

- [x] **U1** AI 面板「技能」页改为由 registry 生成；每个 skill 有「编辑」按钮（在编辑器里打开 SKILL.md）；页面底部有「新建 skill」（从模板创建）
- [x] **U2** 文档工具栏的平台版按钮由 skill 生成（`entry` 包含 `doc-toolbar` 的才显示）

**P1 阶段验收**：在内容库里新建一个「即刻版」skill 文件，不改代码、不重启，就能出现在 slash 列表和工具栏，并且能正常运行。

---

## P2 能力层下沉 + 提案机制

- [x] **P2-1** 新建 `apps/editor/shared/capabilities/`（schema 和纯逻辑）+ `apps/editor/main/capabilities/`（fs 实现）
- [x] **P2-2** 新建 `core/agent/createHost.js`，把 host 从 `AgentPanel` 的 `useMemo` 搬出来；每次调用都读实时状态
  - 验收：同一轮里连续「先查再写」不会重复建档（回归「编辑部记忆」6 个副本那个坑）
- [x] **P2-3** 按 id 的工具：`read_doc(id?)`、`propose_edit(id, content, baseHash)`、`update_doc_meta`、`list_docs(filter)`；`read_active_doc` / `write_active_doc` 保留为不传 id 时的别名
- [x] **P2-4** 乐观锁：`baseHash` 和当前内容不一致时拒绝写入，并提示「内容已变化，请重新读取」
- [x] **P2-5** 提案机制：`propose_edit` 写入 `.agent/proposals/<id>.json`，立即返回 `pending`；新增 `get_proposal_status`
- [x] **P2-6** 活动日志：所有工具调用追加到 `.agent/activity/<日期>.jsonl`，字段为 `who / tool / 目标 id / 结果摘要`，不记录正文
- [x] **P2-7** 新增 `render_platform_html(id, template)`，复用 `wechatCopy.js` / `wechatTemplates.js`
- [x] **P2-8** 风险分级替代工具名白名单：读和可逆写（含移动、重命名）直接执行；覆盖和删除走提案。`agentBridgeTools.js` 改为按级别过滤
- [x] **P2-9** 规则来源统一：`ROLE_RULES` 拆成「引擎通用行为」和「产品规则」，后者合并进 `appKnowledge.js`；MCP 初始化时带上 `instructions`
- [x] **P2-10** MCP 改为复用同一套能力和风险分级，不再单独维护白名单

**UI（P2）**

- [x] **U3** 待确认收件箱：顶栏带数字的入口，列表里每条能看 diff、应用或放弃；任何界面都能打开。替代只在编辑器里显示的 `DiffOverlay`
- [x] **U4** 活动记录：AI 面板新增一个标签页，按时间列出操作，标注来源（app 内 AI / MCP 客户端名 / 外部改动）

**P2 阶段验收**：关掉 AI 面板后，MCP 仍然能读写；外部 agent 提交的改动，在「今日速记」界面也能看到并确认。

---

## P3 数据层文件化（按顺序做，每一步单独发版）

**通用基础**

- [ ] **M0** ⛔D5（预演能力已就绪：设置 → 数据存储 → 迁移 → 先预演，会在你本机只读统计并出报告） 用真实数据做只读预演统计：文档数、重名数、base64 图片数、`Artifacts/` 冲突数、各部分体积，结果写进迁移方案
- [x] **M-base-1** 迁移框架：预演报告 → 备份（db + wal/shm + localStorage 导出 + git 初始提交）→ 写暂存区 → 校验 → 切换（`storage_source`、`migration_version`）。放在主进程 worker 里跑，带进度
- [x] **M-base-2** 从文件重建索引：`documents`、FTS、`links` 都能从文件重建（回滚也复用这个能力）
  - 备注：设置 → 数据存储 →「从当前内容重建索引」；内置文档迁到文件后，工作区本身就是磁盘内容，正常保存也会重建
- [x] **M-base-3** 存储层 adapter 接口：桌面版用 fs，Web 版用 `webFsBridge`
  - 备注：按 D3 只做桌面版：`utils/vaultBridge.js` 统一读写入口，Web 版 `isVaultSupported()` 为 false，保持旧存储
- [x] **M-base-4** watcher 覆盖整个内容库；外部新建的文件缺 `id` 时补写 frontmatter，并记活动日志

**分步迁移**

- [x] **M1** 编辑部记忆 → `.agent/memory/editorial.md`（合并重复副本，旧副本列进报告，不删）
- [x] **M2** ⛔D2 Daily + 待办池 → `Daily/*.md` + `Todo.md`；由 renderer 读 localStorage、经 IPC 交给主进程写文件；`parse(serialize(x)) == x` 不通过就不切换
- [x] **M3** 白板 → 卡片引擎存 `Canvas/白板.canvas`（JSON Canvas），Excalidraw 引擎存 `Canvas/白板.excalidraw`
- [x] **M4** 元数据全部进 frontmatter（先做本地项目，再做内置文档）；扩展 `shared/properties.js`
  - 备注：本地项目的元数据早已写 frontmatter；内置文档在 M5 迁移时写入；新增 frontmatter `id` → 节点 `docId`
- [x] **M5** ⛔D1 内置文档实体迁移：沿用 id；同名加 ` (2)`；改写 `[[旧名]]` 为 `[[新名|旧名]]`；原名写入 `aliases`；base64 图片抽到 `assets/`
- [x] **M6** 清理 `Artifacts/` 旧导出：和数据库内容 hash 一致的移到 `.agent/migration/legacy-artifacts/`，不一致的原地保留并写进报告；关闭 `writeBuiltInDocsToDisk`
- [x] **M7** 回滚入口：设置里「切回旧存储」，先把文件反向导入 SQLite，再切换存储源

**UI（P3）**

- [x] **U5** 迁移向导：展示预演报告 → 确认 → 进度（期间工作区只读）→ 完成，并告知回滚入口位置
- [x] **U6** 外部修改提示：正在编辑的文件被外部改动时弹出横幅，提供「重新加载」或「对比」
- [x] **U7** 元数据解析失败提示：frontmatter 不合法的文件只读正文，并在文件上标记

**P3 阶段验收**：删掉 `knowledge.db` 后重启，内容完整（只需重建索引）；在 Obsidian 里改 `status`，创作看板随之更新。

---

## P4 打通外部 agent

- [x] **P4-1** app 在内容库根目录生成并维护 `AGENTS.md`（目录约定 + 产品规则，和 `appKnowledge` 同源），并建好 `.claude/skills → .agents/skills` 软链接
- [~] **P4-2** 用 Claude Code 打开 `MdRender` 目录，跑通三个 skill：出公众号版、审稿、整理今天的 Daily；行为和 app 内一致
  - 准备已完成：AGENTS.md 工具↔文件映射、skill 同步到 `.agents/skills` 与 `.claude/skills` 软链、一致性单测；需要在本机用 Claude Code 实跑确认
- [x] **P4-3** 合并 `docs/agent-product-roadmap.md` 和新方案，删除冲突的内容
- [x] **P4-4** 更新 `docs/产品功能说明.md` 和 `README`：三种使用入口、skill 怎么加、MCP 怎么接

**UI（P4）**

- [x] **U8** 设置里新增「内容库路径」和「外部 agent 接入」（复制 MCP 配置、打开 `AGENTS.md`）
- [x] **U9** ⛔D1 移除「同步中心」；如果 D1 选择迁移，也移除侧边栏里的「内置文档」

**P4 阶段验收**（也是整体验收）

1. 新增功能只需要加一个 skill 文件，不改 JS
2. 同一个 skill，app 内 AI 和 Claude Code 的行为一致
3. 断开 AI 后，写稿、排版、搜索、发布照常可用

---

## 明确不做

不做通用插件系统 · skill 不能带代码 · 不做多 agent 编排 · 不做云同步 · 不引入向量库 · app 内不做 git 界面
