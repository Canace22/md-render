/**
 * 内容库根目录 AGENTS.md：给 Claude Code / Codex / Hermes 等直接打开 MdRender 目录的 agent 看。
 * 和 app 内 AI、MCP instructions 同源（shared/appKnowledge.js），由 app 生成并维护标记区；
 * 标记区外面的内容是用户自己写的，原样保留。
 */

import { AGENT_INSTRUCTIONS } from './appKnowledge.js';

export const AGENTS_MD_FILE = 'AGENTS.md';
export const MANAGED_BEGIN = '<!-- md-render:begin（这一段由 MD Render 自动生成，改了会被覆盖；自己的规则写在标记外面） -->';
export const MANAGED_END = '<!-- md-render:end -->';

const DIRECTORY_CONVENTIONS = [
  '| 路径 | 放什么 |',
  '|---|---|',
  '| `Projects/` | 母稿（权威位置）。`Projects/内置文档/` 是从旧版数据库迁出来的文档 |',
  '| `Artifacts/` | 派生产物：平台版、方案、报告……不要改母稿，派生内容新建在这里 |',
  '| `Daily/YYYY-MM-DD.md` | 今日速记：一行一条，`- [ ]` 是任务，属性是 Dataview 行内字段 `[key:: value]` |',
  '| `Todo.md` | 待办池 |',
  '| `Canvas/白板.canvas` | 灵感白板（JSON Canvas，Obsidian 能打开） |',
  '| `.agent/memory/editorial.md` | AI 编辑部记忆：只追加，不改写 |',
  '| `.agent/proposals/` | 待用户确认的改动（app 生成，不要手改） |',
  '| `.agent/activity/` | 所有 agent 的操作日志（app 生成） |',
  '| `.agents/skills/<name>/SKILL.md` | 技能（`.claude/skills` 指向这里）。带 `.md-render-managed.json` 的是 app 内置技能的副本，改了就变成你的版本 |',
].join('\n');

const FILE_RULES = [
  '每篇 Markdown 的 frontmatter 里有稳定的 `id`，改名、移动都不要动它；新建文件不写 `id` 也行，app 会补。',
  '元数据都在 frontmatter：`status`（idea / drafting / ready / published …）、`tags`、`platforms`、`sources`（派生自哪些稿件，写成 `[[路径]]`）、`related`。',
  '平台版、方案等派生内容新建文件，frontmatter 写 `platform` 和 `sources: [[母稿路径]]`，不要覆盖母稿。',
  '要改母稿正文时，直接改文件即可（有 git 兜底）；如果用户正开着 app 编辑同一篇，app 会提示外部修改。',
];

/** 技能里写的是 md-render 的工具名：没连 MCP 时，用文件操作做同样的事 */
const TOOL_FILE_MAPPING = [
  '| 技能里的工具 | 直接操作文件时怎么做 |',
  '|---|---|',
  '| `read_active_doc` / `read_doc` | 读用户指定的稿件文件（没指定就问） |',
  '| `write_active_doc` / `propose_edit` | 改写该文件正文，保留 frontmatter |',
  '| `create_agent_artifact` / `create_new_doc` | 在 `Artifacts/内容运营/` 新建文件，frontmatter 写 `platform`、`sources` |',
  '| `update_doc_meta` | 改 frontmatter 对应字段 |',
  '| `read_editorial_memory` / `update_editorial_memory` | 读 / 往对应小节末尾追加 `.agent/memory/editorial.md` |',
  '| `read_daily` / `add_daily_entry` / `add_todo_entry` | 读写 `Daily/<日期>.md`、`Todo.md`（格式照抄已有行） |',
  '| `search_docs` / `list_docs` / `recall_related_docs` | 在 `Projects/`、`Artifacts/` 里搜索 |',
].join('\n');

export const buildManagedAgentsSection = () => [
  MANAGED_BEGIN,
  '',
  '# MD Render 内容库',
  '',
  '这是 MD Render（本地优先的内容创作工具）的内容库。app 里的 AI 和你用的是同一份文件、同一套技能。',
  '',
  '## 目录约定',
  '',
  DIRECTORY_CONVENTIONS,
  '',
  '## 改文件时的约定',
  '',
  ...FILE_RULES.map((rule) => `- ${rule}`),
  '',
  '## 技能里的工具名',
  '',
  '连着 md-render 的 MCP 时直接调用这些工具（改正文会进 app 的待确认收件箱）；没连时按下表用文件操作完成：',
  '',
  TOOL_FILE_MAPPING,
  '',
  '## 产品知识与规则（和 app 内 AI 同源）',
  '',
  AGENT_INSTRUCTIONS,
  '',
  MANAGED_END,
].join('\n');

/** 把标记区写进已有 AGENTS.md：有标记就替换，没有就加在最前面；用户写的其它内容不动 */
export const mergeAgentsMd = (existing = '') => {
  const section = buildManagedAgentsSection();
  const text = String(existing ?? '');
  const begin = text.indexOf('<!-- md-render:begin');
  const end = text.indexOf(MANAGED_END);
  if (begin >= 0 && end > begin) {
    return `${text.slice(0, begin)}${section}${text.slice(end + MANAGED_END.length)}`;
  }
  return text.trim() ? `${section}\n\n${text.replace(/^\n+/, '')}` : `${section}\n`;
};
