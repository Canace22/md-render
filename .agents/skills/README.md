# md-render Skills 索引

18 个 skill，AI agent（Claude Code / Cursor / Codex）在对应场景自动加载。

## 通用工作流（不限于本项目）

| Skill | 什么时候用 |
|---|---|
| `safe-change-workflow` | **改任何 src/ 代码前都走一遍**：定向搜索 → 看懂相关代码 → 最小化改动 → 列 10 条 case 预期。默认不主动跑测试，尤其不跑 E2E |
| `pre-commit-secrets` | 提交/push 前扫 API key、token、.env、私钥、数据库连接串 |
| `skill-harvest` | 做完有套路或踩过坑的任务后，判断是否值得沉淀成新 skill |
| `mermaid-verify` | 画完 Mermaid 图自检语法与暗黑主题可见性 |

## 内容创作

| Skill | 什么时候用 |
|---|---|
| `ai-editorial-board` | 9 角色审稿 / 标题分析 / 发布复盘（app 内 slash skill 与外部 agent 共用） |
| `md-render-wechat` | 改微信公众号格式化。模板在 `utils/wechatTemplates.js`，转换在 `utils/wechatCopy.js`。关键约束：微信不支持外部 CSS，样式必须内联 |

## 核心模块

| Skill | 覆盖范围 |
|---|---|
| `md-render-parser-renderer` | Markdown 解析/渲染核心（`packages/markdown-core/`）。**项目最核心也最易出错的模块** |
| `md-render-store` | 全局状态（zustand `useEditorStore.js`）。持久化 key 用 `md-renderer-*` 常量。不要新建其他 store |
| `md-render-agent` | AI 助手引擎与工具（`core/agent/` 下 agentEngine / toolRegistry / aiClient、AgentPanel.jsx） |
| `md-render-blocknote-core` | 接入/改动 `@narrative/blocknote-core`。避坑：buildSchema、编辑器焦点、Arco→AntD、vite CJS interop |
| `md-render-architecture-boundary` | 跨 renderer/main/server 的架构重整、拆 IPC、store slice 化 |

## 功能模块

| Skill | 覆盖范围 |
|---|---|
| `md-render-daily` | Daily 速记面板。核心约定：切日期是**纯视图变更**，破坏性结转 carryOver 只在真正跨到今天时跑一次 |
| `md-render-kb-source` | 给知识库加节点类型/外部来源（书签、稍后读、RSS、剪藏）。都复用 file 节点 + nodeType 区分，落 SQLite + FTS5 |
| `md-render-excalidraw-canvas` | 无限画布的场景同步、防抖保存、卡片插入、视口交互 |
| `md-render-binary-asset` | renderer 里处理二进制媒体：截图粘贴、存进 `assets/`，编辑器用 `local-media://` 显示，磁盘写相对路径 |
| `md-render-asset-derivation` | 「保留原稿 + 生成派生资产 + 记录来源关系」，如生成平台版本、`sourceMaterialIds` |

## 服务端与集成

| Skill | 覆盖范围 |
|---|---|
| `md-render-external-api-proxy` | 前端调第三方 HTTP API 的代理化，解决 CORS 和「只在 dev 能用」 |

---

**新增 skill**：走 `skill-harvest` 的规范。**改 `ai-editorial-board`**：`core/agent/editorialBoard.js` 在构建期用 `?raw` 内联 `SKILL.md`，改完跑 `pnpm test:unit`（`editorial-board.test.js` 按章节标题提取，别改标题）。

---

## 产品 skill 格式（app 内 AI 功能）

本目录放的是**开发 skill**（教 agent 改 md-render 的代码）。**产品 skill**（教 agent 做内容：出公众号版、审稿、扩写……）放在另外两处，格式相同：

| 来源 | 路径 | 说明 |
|---|---|---|
| 内置 | `apps/editor/resources/skills/<name>/` | 随 app 打包（renderer 构建期 `?raw` 内联） |
| 内容库 | `~/Documents/MdRender/.agents/skills/<name>/` | 用户自建或覆盖内置；改完不用重启 |

两处有同名 skill（按 `SKILL.md` 的 `name`，没写就用目录名）时，**内容库覆盖内置**。

### 目录结构

```
<name>/
├── SKILL.md               # 必需：prompt 正文，任何 agent 都能直接用
└── agents/md-render.yaml  # 可选：只给 md-render 用的入口声明，外部 agent 忽略
```

### `SKILL.md`

```markdown
---
name: wechat-version
description: 把母稿改写成公众号版本，另存为派生稿，不改原文。用户说「出公众号版」时使用。
---
1. 调用 read_active_doc 读取母稿全文。
2. 按以下要求改写：……
3. 用 create_agent_artifact 另存为派生稿，来源关联母稿。不要修改母稿。
```

- `name`：skill id，小写字母、数字、`-`。缺省用目录名。
- `description`：一句话说明做什么、什么时候用。
- 正文：直接给模型的指令。不能为空。

### `agents/md-render.yaml`

```yaml
label: 公众号版                      # 界面显示名，缺省用 name
group: 平台版本                      # 可选，界面分组
aliases: [微信, 公众号]              # 可选，slash 搜索别名
entry: [slash, welcome, doc-toolbar] # 出现在哪些入口
input: active_doc                    # 运行时自动带上什么
tools: [read_active_doc, create_agent_artifact]  # 允许调用的工具（白名单）
output: artifact                     # 产出形态
```

| 字段 | 取值 | 缺省 |
|---|---|---|
| `label` | 任意文本 | `name` |
| `group` | 任意文本 | 空 |
| `aliases` | 搜索别名列表 | `[]` |
| `entry` | `slash`（slash 列表）· `welcome`（欢迎页建议）· `doc-toolbar`（文档工具栏）；写 `[]` 表示不在界面露出 | `[slash]` |
| `input` | `active_doc`（当前文档）· `selection`（有选中文本就只处理选区，没有就整篇）· `none` | `none` |
| `tools` | 工具名列表，见 `core/agent/toolRegistry.js` | `[]`（只对话，不调工具） |
| `output` | `artifact`（生成派生稿）· `proposal`（改当前稿，需确认）· `answer`（只回复） | `answer` |

规则：

- 只支持「`key: 值`」、行内列表 `[a, b]` 和 `- 项` 列表，不支持嵌套对象。
- 字段取值不合法（如 `entry: [sidebar]`）→ 这个 skill 被跳过，并在 AI 面板提示原因，不影响其他 skill。
- 不认识的字段忽略，方便以后加字段。
- **skill 不能带代码**。需要代码的事情做成工具（`toolRegistry`），skill 只声明用哪些工具。

解析逻辑在 `apps/editor/renderer/src/core/agent/skillRegistry.js`（纯函数，有单测）。
