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
| `md-render-binary-asset` | renderer 里处理二进制媒体：截图粘贴、存进 `素材/` 目录、`local-media://` 引用（不内嵌 base64） |
| `md-render-asset-derivation` | 「保留原稿 + 生成派生资产 + 记录来源关系」，如生成平台版本、`sourceMaterialIds` |

## 服务端与集成

| Skill | 覆盖范围 |
|---|---|
| `md-render-cloud-sync` | 自建服务器的工作区同步、revision 冲突、`VITE_CLOUD_SYNC_API` |
| `md-render-external-api-proxy` | 前端调第三方 HTTP API（如 Notion）的代理化，解决 CORS 和「只在 dev 能用」 |

---

**新增 skill**：走 `skill-harvest` 的规范。**改 `ai-editorial-board`**：`core/agent/editorialBoard.js` 在构建期用 `?raw` 内联 `SKILL.md`，改完跑 `pnpm test:unit`（`editorial-board.test.js` 按章节标题提取，别改标题）。
