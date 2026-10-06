# md-render AI Native 重构方案

> 状态：草案，待评审 · 2026-10-05
> 关联：`docs/agent-product-roadmap.md`（v0.1 已落地部分）、`server/mcp-bridge/README.md`

## 一句话

把 AI 从「右侧面板里的一个功能」改成「应用的执行引擎」：**数据是文件，能力是工具，AI 是引擎，功能是 skill，UI 是视图**。功能写成 skill 文件，app 内 AI 和外部 agent（Claude Code、Hermes、Cursor）用的是同一份 skill、同一套工具、同一份数据。

---

## 1. 现状诊断

| 层 | 现在是什么样 | 问题 |
|---|---|---|
| 数据 | 工作区树和白板是 SQLite `app_state` 里的一整块 JSON；文档在 `documents` 表，**单向**导出到 `MdRender/Artifacts`；Daily 在 localStorage；编辑部记忆是工作区里的隐藏节点；只有挂载的本地项目是真文件 | 外部 agent 改文件，app 不认；Daily、白板、记忆外部碰不到；和「全本地 + Obsidian + git」的目标冲突 |
| 能力 | 工具执行器依赖 `host`，而 `host` 是 `AgentPanel.jsx` 里 `useMemo` 出来的闭包 | 能力挂在 React 组件上：要开着 app 和窗口、面板要挂载才能用；工具语义绑定界面焦点（`read_active_doc` / `write_active_doc`） |
| AI | `agentEngine.js` 本身是纯函数（这点做得对），但只有 `AgentPanel` 在调；规则靠 `ROLE_RULES` 一长串 prompt | 外部 agent 拿不到这些规则；约束写在 prompt 里，换个模型或 agent 就失效 |
| 功能 | 选题、审稿、平台版、润色等写死在 `AgentPanel.jsx` 的 `PROJECT_SLASH_SKILLS` / `EDITORIAL_SKILLS` 等常量里，分 agent / quick / platform / script 四套 handler；平台版 prompt 在 `utils/platformVariant.js` | 加一个功能要改 JS 再发版；外部 agent 用不了这些功能；`.agents/skills/` 在运行时不会被读取 |
| UI | 入口、执行、确认、展示都在 `AgentPanel` 里 | 写入确认塞进同步调用（MCP 30 秒超时）；外部 agent 做了什么，用户看不到 |

根本原因：**能力层长在 UI 里，数据层不在文件里**。功能层又依附在这两层上，只能写死。

---

## 2. 目标分层

```
┌────────────────────────────────────────────────────────────┐
│ UI 层      视图、入口、人工确认（提案收件箱）、活动日志        │  React
├────────────────────────────────────────────────────────────┤
│ 功能层     skills：审稿 / 平台版 / 选题 / 复盘 / 润色 …        │  SKILL.md 文件
├────────────────────────────────────────────────────────────┤
│ AI 层      agent loop + skill 加载 + 上下文组装 + 记忆        │  core/agent（无 UI 依赖）
├────────────────────────────────────────────────────────────┤
│ 能力层     原子工具：按 id/路径读写、元数据、搜索、渲染、       │  core/capabilities
│           排版、发布、导航、提案                               │  + 主进程 fs 实现
├────────────────────────────────────────────────────────────┤
│ 数据层     文件：md + frontmatter + json；git 管版本           │  ~/Documents/MdRender
│           SQLite 只做索引和缓存，能从文件重建                  │
└────────────────────────────────────────────────────────────┘
```

**每层的规矩**

- **数据层**：文件是唯一真相。SQLite 删了能重建，丢的只是索引。
- **能力层**：确定性代码，不调 AI。按 id 或路径操作，不依赖「当前打开的是哪篇」。AI 断开时 UI 照样调用它。
- **AI 层**：通用引擎，不认识任何具体功能。只做三件事：加载 skill、组装上下文、调用工具。
- **功能层**：只写 prompt 和声明（要哪些工具、什么输入、产出什么），不写代码。
- **UI 层**：只负责展示和让人做决定，不承载业务逻辑。

**三条验收标准**（整个方案做完要满足）

1. 新增一个功能，只需要加一个 skill 文件，不用改 JS。
2. 同一个 skill，app 内 AI 和 Claude Code 打开 `MdRender` 目录跑出来的行为一致。
3. 断开 AI，写稿、排版、搜索、发布照常能用。

---

## 3. 现有功能归类

| 现有功能 | 现在的实现 | 归到哪层 | 怎么改 |
|---|---|---|---|
| 公众号版 / 小红书版 / 知乎版 | `type: 'platform'` + `platformVariant.js` 里的 prompt | 功能层 | 每个平台一个 skill；prompt 搬进 SKILL.md |
| 提纲 / 扩写 / 续写 / 润色 / 压缩 / 标题建议 / 关键要点 | `type: 'quick'` + `aiActions.js` | 功能层 | 合并成一个 `rewrite` skill，带参数；或每个动作一个轻量 skill |
| 编辑部审稿 / 标题分析 / 发布复盘 | `type: 'agent'`，审稿已用 `?raw` 内联 SKILL.md | 功能层 | 已经最接近目标，改成运行时加载 |
| 选题 / 新稿件 / 资料单 / 待发布稿 | `type: 'agent'` + `create_content_entry` | 功能层 + 能力层 | skill 负责引导；建条目是能力层的 `create_doc(template, meta)` |
| 今日任务 / 笔记 / 待办池 | agent skill + `add_daily_entry` / `add_todo_entry` | 能力层 | 工具保留，数据改成落到 Daily 文件 |
| 白板流程图 / 卡片 | agent skill + canvas 工具 | 功能层 + 能力层 | 「画流程图」是 skill；读写白板是能力 |
| 相关旧文 / 工作区概览 | agent skill + `recall_related_docs` 等 | 能力层 | 本质是查询，留作工具，skill 入口可以去掉 |
| 应用体检 | agent skill + `inspect_app_health` / `apply_safe_repair` | 能力层 | 保持现有 inspect → confirm → apply → verify → rollback |
| 生成交付物 | agent skill + `create_agent_artifact` | 功能层 | 每类交付物（方案、简报、调研……）一个 skill 模板 |
| PDF→Word / 视频→音频 | `type: 'script'`，走 ai-proxy | 能力层 | 不需要 AI，就是普通工具；从 AI 面板挪到文件右键菜单 |
| 微信排版 / 复制富文本 | 编辑器工具栏，没有对 AI 开放 | 能力层 | 新增 `render_platform_html(id, template)`，让 AI 也能调 |
| 编辑部记忆 | 工作区隐藏节点 `.agent` | 数据层 | 改成真文件 `.agent/memory/editorial.md` |

---

## 4. 各层设计

### 4.1 数据层：文件为真相

**目录约定**（沿用你已经在用的 `~/Documents/MdRender`）

```
MdRender/
├── AGENTS.md                  # 给所有 agent 看的目录约定和规则（app 生成，可手改）
├── .agents/skills/            # 用户自己的 skill（覆盖内置同名 skill）
├── .claude/skills -> ../.agents/skills
├── Projects/                  # 母稿（权威位置）
│   └── <项目>/<稿件>.md
├── Artifacts/                 # 派生产物：平台版、方案、报告……
│   └── 内容运营/...
├── Daily/
│   └── 2026-10-05.md          # 任务 / 事件 / 笔记，用 markdown 列表 + 行内标记
├── Todo.md                    # 待办池
├── Canvas/
│   └── <名称>.canvas          # 用 Obsidian 的 JSON Canvas 格式，Obsidian 能直接打开
└── .agent/
    ├── memory/editorial.md    # 编辑部记忆
    ├── proposals/<id>.json    # 待确认改动（见 4.3）
    └── activity/2026-10-05.jsonl  # 所有 agent 的操作日志
```

**元数据全部进 frontmatter**。现在只有 `title / author / published / created`（平台稿另加 `platform / source / description`）同步到 frontmatter，`status`、标签、目标平台还在节点字段里。统一成：

```yaml
---
id: 01JA8X...            # 稳定 id（ULID），改名或移动都不变
title: 为什么我不再做同步
status: draft            # idea | draft | ready | published
tags: [工具, 本地优先]
platforms: [wechat, xiaohongshu]
source: [01J9ZK...]      # 派生自哪些稿件（替代 sourceMaterialIds）
created: 2026-10-01
published:
---
```

`shared/properties.js` 和 `frontmatterDocument.js` 已经有基础，在上面扩展就行。

**SQLite 的新角色**：全文搜索（FTS）、反向链接、id → 路径映射、版本快照缓存。启动时和文件变化时由 watcher 增量更新；`documents` 表删了能从文件重建。

**Web 版**：存储层抽成一个 adapter 接口，桌面版用 fs，Web 版用现有的 `webFsBridge.js`（File System Access API）。Web 版没有目录权限时，降级为现在的 localStorage 方案。

### 4.2 能力层：工具不依赖 UI

**位置**：新建 `apps/editor/shared/capabilities/`（纯逻辑和 schema）+ `apps/editor/main/capabilities/`（fs 实现）。renderer、MCP、未来的 CLI 都调用同一套。

**设计原则**

- 按 id 或路径操作。`write_doc(id, content, baseHash)`：`baseHash` 不匹配就拒绝，防止覆盖用户刚改的内容（乐观锁）。
- 和界面焦点相关的操作单独归为「导航类」，比如 `open_item`、`open_surface`。
- 约束写进执行器，不写进 prompt。例如「修复只能用 availableRepairs」「删除一次最多 10 条」「平台稿必须写 `source`」，全部在代码里校验。
- 风险按**可不可逆**分级，不按工具名分：

| 级别 | 例子 | 处理方式 |
|---|---|---|
| 读 | `read_doc`、`search`、`list`、`get_meta` | 直接执行 |
| 可逆写 | 新建、追加、改元数据、移动、重命名 | 直接执行，记活动日志（有 git 兜底） |
| 覆盖或删除 | 改正文、删除、清空白板 | 生成提案，等用户确认（见 4.3） |
| 环境 | `apply_safe_repair` | 保持现有确认 → 复检 → 回滚流程 |

**工具清单调整**（在现有 28 个基础上）

- 替换：`read_active_doc` / `write_active_doc` → `read_doc(id?)` / `propose_edit(id, content | patch, baseHash)`。不传 id 时默认当前文档，兼容现有用法。
- 新增：`update_doc_meta`、`list_docs(filter)`、`render_platform_html`、`get_proposal_status`、`list_skills`。
- 对外开放：移动、重命名（可逆）；删除走提案。

### 4.3 AI 层：引擎和 UI 解耦

- `agentEngine.js` 本来就是纯函数，保留。要拆出来的是 **`host` 的构建**：从 `AgentPanel` 的 `useMemo` 搬到 `core/agent/createHost.js`，内部只调用能力层，并且每次调用都读实时状态（顺带解决「host 闭包是旧快照」那个已知坑）。
- **Skill 加载器** `core/agent/skillRegistry.js`，按以下顺序合并，后面的覆盖前面的：
  1. app 内置 skill（打包进 `apps/editor/resources/skills/`）
  2. 用户 vault 的 `MdRender/.agents/skills/`
- **规则来源统一**：`ROLE_RULES` 拆成两部分。一部分是通用的引擎行为（中文、简洁、不暴露推理），留在引擎里。另一部分是产品知识和操作规则，合并进 `appKnowledge.js`，并且同一份内容生成三处：app 内 system prompt、MCP `instructions`、vault 根目录的 `AGENTS.md`。
- **确认改成异步提案**：`propose_edit` 把改动写到 `.agent/proposals/<id>.json`，立即返回 `{ proposalId, status: 'pending' }`。UI 的提案收件箱负责展示 diff、让用户应用或放弃。agent 用 `get_proposal_status` 查结果。这样 30 秒超时、看不到确认卡片、新提案覆盖旧提案这三个问题一起解决。
- **活动日志**：所有工具调用（不管来自 app 内还是 MCP）都追加一行到 `.agent/activity/日期.jsonl`，字段包括 `who`、`tool`、目标 id、结果摘要。不记录正文。

### 4.4 功能层：skill 文件

沿用仓库已有的约定：`SKILL.md` 放 prompt；`agents/<工具>.yaml` 放各工具专属的元信息（仓库里已经有可选的 `agents/openai.yaml`）。md-render 专属的声明放在 `agents/md-render.yaml`，Claude Code 等外部 agent 会忽略这个文件，只读 SKILL.md。

```
.agents/skills/wechat-version/
├── SKILL.md
└── agents/md-render.yaml
```

`SKILL.md`（工具无关，外部 agent 能直接用）：

```markdown
---
name: wechat-version
description: 把母稿改写成公众号版本，另存为派生稿，不改原文。用户说「出公众号版」「改成公众号」时使用。
---
1. 读取母稿全文和 frontmatter。
2. 按以下要求改写：……（从 platformVariant.js 搬过来）
3. 在 Artifacts/内容运营/ 下新建文件，frontmatter 写 platform: wechat、source: [母稿 id]。
4. 不要修改母稿。
```

`agents/md-render.yaml`（只给 app 用的入口声明）：

```yaml
label: 公众号版
entry: [slash, welcome, doc-toolbar]   # 出现在哪些入口
input: active_doc                      # active_doc | selection | none
tools: [read_doc, create_doc, render_platform_html]   # 允许调用的工具
output: artifact                       # artifact | proposal | answer
```

- `tools` 是白名单，引擎执行时只给模型这几个工具，执行器层面也会拦截。
- skill 不能带可执行代码。需要代码的事情做成能力层工具，这也是避免过度设计的边界。
- 仓库里 `.agents/skills/` 现有的是**开发 skill**（教 agent 怎么改 md-render 的代码），和**产品 skill**（教 agent 怎么做内容）要分开放。产品 skill 内置在 `resources/skills/`，用户自定义的放在 vault 里。`ai-editorial-board` 迁到 `resources/skills/`，仓库开发 skill 目录里保留一个指向它的说明。

### 4.5 UI 层

- AI 入口（slash 列表、欢迎页建议、文档工具栏按钮）都从 skill registry 生成，删掉 `PROJECT_SLASH_SKILLS` 等常量和 quick / platform / agent 三套 handler，只保留一个 `runSkill(skillId, input)`。
- 新增**提案收件箱**：替代现在只在编辑器界面显示的 `DiffOverlay`，任何界面都能看到待确认数量。
- 新增**活动记录**面板：按时间展示 `.agent/activity`，并标注来源（app 内 AI / Claude Desktop / 其他 MCP）。
- `AgentPanel` 变成纯对话视图，不再持有 host 和工具。

### 4.6 外部 agent 怎么接

| 方式 | 适合谁 | 能做什么 |
|---|---|---|
| **直接读写文件**（推荐） | Claude Code、Hermes、Cursor，以及任何能访问本地目录的 agent | 读 `AGENTS.md` 了解约定，读写 md 和 frontmatter，用 vault 里的 skill。app 不运行也能用 |
| **MCP**（薄层） | Claude Desktop 等只能通过 MCP 的客户端，或需要 app 专属能力时 | 全文搜索、提案、导航、渲染排版、健康诊断 |

MCP 的改动：

- 每次调用重新读握手文件；app 没运行时返回明确的报错，不再退出进程。
- app 退出时删除握手文件。
- `instructions` 来自 `appKnowledge`。
- 工具集和 app 内保持一致，按 4.2 的风险分级处理，不再维护一份单独的白名单。
- 失败结果标记 `isError`。

---

## 5. 分阶段计划

每个阶段都能单独交付、单独回滚，不需要一次性大改。

### P0 止血（1–2 天）

修 MCP 当前的可用性问题，不改架构。

- MCP 每次调用重新读握手；app 不在时返回友好错误；退出时删除握手文件。
- `isError` 正确标记。
- `write_active_doc` 经 MCP 调用时立即返回「已暂存，待用户确认」，不阻塞。

**验收**：先开 Claude Desktop、后开 md-render，工具也能用；重启 md-render 后不需要重启 Claude Desktop。

### P1 功能 skill 化（约 1 周，收益最大、风险最小）

不动数据层，先把功能层从代码里拿出来。

1. 写 `skillRegistry.js`：加载内置和 vault 两处 skill，解析 `agents/md-render.yaml`。
2. 把平台版（3 个）、改写类（7 个）、审稿类（3 个）、选题类（4 个）迁成 skill 文件。
3. `AgentPanel` 入口改为从 registry 生成，用 `runSkill` 替换四套 handler。
4. 引擎按 skill 的 `tools` 白名单裁剪工具。

**验收**：在 vault 里新建一个「即刻版」skill 文件，不改代码、不重启也能出现在 slash 列表里并正常运行。

### P2 能力层下沉 + 提案机制（1–2 周）

1. 工具执行器改成调用 `shared/capabilities`，`createHost` 从组件中移出。
2. 新增按 id 读写、`baseHash` 冲突检查、`update_doc_meta`、`render_platform_html`。
3. 上线提案机制和提案收件箱，替换 `stageAgentWrite` / `DiffOverlay`。
4. 上线活动日志。
5. MCP 工具集改为复用同一套能力和风险分级。

**验收**：关掉 AI 面板（或断开 AI），MCP 仍能读写；外部 agent 提交的改动，在任何界面都能看到并确认。

### P3 数据层文件化（2–3 周，风险最高，分批做）

按「新、小、独立」的顺序迁移：

1. 编辑部记忆 → `.agent/memory/editorial.md`
2. Daily / 待办池 → `Daily/*.md`、`Todo.md`（从 localStorage 迁出）
3. 白板 → `Canvas/*.canvas`（JSON Canvas 格式）
4. 所有元数据进 frontmatter
5. 内置文档 → 真文件（见第 7 节的决策点）

每一步都按同一个流程走：**备份 SQLite → 迁移脚本 → 双读校验（文件和旧存储对比）→ 切到读文件 → 观察一个版本 → 删除旧路径**。watcher 的回声问题参考 `docs/summaries/2026-07-15-editor-focus-loss-watcher-echo.md` 的处理方式。

**验收**：删掉 SQLite 数据库文件，重启后内容完整，只是需要重建索引；在 Obsidian 里改一篇稿子的 frontmatter，app 里立刻能看到。

### P4 打通外部 agent（3–5 天）

1. app 在 vault 根目录生成并维护 `AGENTS.md`（目录约定 + 规则），同时建好 `.claude/skills` 软链接。
2. 用 Claude Code 打开 `MdRender` 目录，跑通「出公众号版」「审稿」「整理今天的 Daily」三个 skill。
3. 删除 `docs/agent-product-roadmap.md` 里和本方案冲突的内容，合并成一份。

**验收**：满足第 2 节的三条验收标准。

---

## 6. 不做的事

避免过度设计，以下内容明确不在本方案范围内：

- 不做通用插件系统。skill 只有 prompt 和声明，不能带代码。
- 不做多 agent 编排或 agent 之间的通信。
- 不做云同步。版本管理和多设备交给 git。
- 不引入向量数据库。先用 SQLite FTS，效果不够再说。
- 不让 skill 定义新的 UI 组件。UI 只有固定几种产出形态（artifact / proposal / answer）。

---

## 7. 待你决定

1. **内置文档的去留**：是全部迁到 `Projects/`、取消「内置文档」这个概念（推荐，和「母稿在 Projects」一致），还是保留内置文档并改成双向同步？
2. **白板格式**：用 Obsidian 的 JSON Canvas（推荐，Obsidian 能直接打开），还是保留现有结构另存为 json？
3. **Web 版**：要不要和桌面版能力对齐？如果 Web 版只是演示用，P3 可以只做桌面版。
4. **Daily 格式**：用纯 markdown（Obsidian 友好，解析稍麻烦），还是 md + 一段 frontmatter / json 存结构化字段？
5. **顺序**：P1（skill 化）和 P2（能力下沉）谁先做？方案里 P1 在前，因为它不碰数据、见效快；如果你更在意外部 agent 尽快可用，可以先做 P2。

---

## 8. 风险

| 风险 | 对策 |
|---|---|
| 数据迁移丢内容 | 每步先备份 SQLite；双读校验；观察一个版本后再删旧路径 |
| 文件监听回环，或编辑时被外部改动打断 | 复用已有的 watcher 回声处理；正在编辑的文件被外部改动时，弹提示而不是直接刷新 |
| 大库性能（已知 15GB 级） | 索引增量更新；启动只扫 mtime；深度校验放到后台任务 |
| 外部 agent 直接改坏文件 | git 兜底；活动日志只覆盖经过 app 或 MCP 的操作，直接改文件的靠 git diff 追溯 |
| skill 写错导致越权 | `tools` 白名单在执行器层强制；破坏性操作必须走提案 |

---

## 9. 关键测试 case

1. **skill 热加载**：在 vault 新增 skill 文件 → slash 列表出现该 skill → 运行时只能调用它声明的工具，调用未声明的工具被拒绝。
2. **提案不阻塞**：MCP 调用 `propose_edit` 后 1 秒内返回 `pending`；用户 5 分钟后在「今日速记」界面点应用；`get_proposal_status` 返回 `applied`，文档内容正确。
3. **乐观锁**：agent 读到 `baseHash=A`，用户随后手动修改文档（hash 变成 B），agent 提交时被拒绝，并返回「内容已变化，请重新读取」。
4. **文件为真相**：删除 SQLite 后重启，稿件、Daily、白板、元数据完整；在 Obsidian 里改 `status: ready`，app 的创作看板随之更新。
5. **断开 AI**：清空 AI 配置后，写稿、排版、搜索、新建、移动都正常，只有 AI 入口显示不可用。
