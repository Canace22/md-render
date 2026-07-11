/**
 * AI 编辑部：多角色审稿工作流的 prompt 模块。
 *
 * 单一事实源是仓库根的 `.agents/skills/ai-editorial-board/SKILL.md`
 * （外部 agent 工具直接读该文件），这里通过 Vite `?raw` 在构建期内联同一份内容，
 * 再叠加 app 内工具指令（read_active_doc / recall_related_docs 等）拼成 slash skill prompt。
 *
 * 纯模块：无 IPC / store / React 依赖，可直接单测。
 */

import rawEditorialSkill from '../../../../../../.agents/skills/ai-editorial-board/SKILL.md?raw';

const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n/;

/** 去掉 SKILL.md 顶部 frontmatter，得到可直接给模型看的规范正文 */
export const stripFrontmatter = (text) =>
  String(text ?? '').replace(FRONTMATTER_PATTERN, '').trim();

export const EDITORIAL_BOARD_SPEC = stripFrontmatter(rawEditorialSkill);

/**
 * 按标题关键字提取规范中的一节（含标题行，到下一个同级或更高级标题为止）。
 * 会跳过 ``` 围栏代码块内的行，避免「输出规范」里的模板标题干扰边界判断。
 */
export const extractEditorialSection = (text, keyword) => {
  const lines = String(text ?? '').split('\n');
  const headingLevel = (line) => {
    const match = /^(#{2,4})\s/.exec(line);
    return match ? match[1].length : 0;
  };

  let inFence = false;
  let startIndex = -1;
  let startLevel = 0;
  const collected = [];

  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (inFence) {
      if (startIndex >= 0) collected.push(line);
      continue;
    }
    const level = headingLevel(line);
    if (startIndex < 0) {
      if (level > 0 && line.includes(keyword)) {
        startIndex = index;
        startLevel = level;
        collected.push(line);
      }
      continue;
    }
    if (level > 0 && level <= startLevel) break;
    collected.push(line);
  }

  return collected.join('\n').trim();
};

const CONSTITUTION_SECTION = extractEditorialSection(EDITORIAL_BOARD_SPEC, '编辑部宪法');

// —— app 内工具接线（外部 agent 产品不需要这些，故不写进 SKILL.md）——

const REVIEW_APP_RULES = [
  '你现在是 AI 编辑部，请按下方编辑部规范完成一次完整审稿。',
  '开始前先调用 read_editorial_memory 读取编辑部记忆（写作画像、平台经验等），作为各角色的判断依据；记忆不存在就跳过，不要因此中断。',
  '然后调用 read_active_doc 读取当前稿件全文；再调用 recall_related_docs 召回相关旧文，供热点编辑和品牌编辑判断历史连接（没有旧文就说明「暂无历史连接」）。',
  '审稿只输出意见，禁止调用 write_active_doc 改写正文；只有当作者明确要求应用某条修改时才写回。',
  '信息不足时基于稿件现状直接给判断，不要抛出一长串反问。',
  '审稿意见输出完后，用 agent-choice 协议给出后续选项：保存审稿报告（create_agent_artifact，artifactType=editorial_review，来源关联当前文档）、逐条展开「优先修改」、深入某位编辑的意见。',
].join('\n');

const HEADLINE_APP_RULES = [
  '你现在是 AI 编辑部的标题编辑，遵守编辑部宪法。',
  '先调用 read_editorial_memory 参考平台经验库里的标题经验（不存在就跳过）；再调用 read_active_doc 读取当前稿件，从正文提炼真正价值，然后按下方职责分析标题并生成多个版本（注明各自适合的渠道）。',
  '文档第一行的一级标题即当前标题；没有标题就直接基于正文价值给候选。不要改写正文。',
].join('\n');

const RETRO_APP_RULES = [
  '你现在是 AI 编辑部的复盘编辑，遵守编辑部宪法。',
  '先调用 read_editorial_memory 了解既有经验（不存在就跳过）；再根据我提供的后台数据复盘。如果我还没给数据，先让我粘贴（阅读、分享、评论、新增关注等），不得编造数据。',
  '复盘得出的可复用结论，调用 update_editorial_memory 写入记忆：平台规律用 category=experience，读者偏好用 persona，知识主题用 knowledge，本次复盘记录用 retro；一条一个结论，避免流水账。',
  '写入记忆后，用 agent-choice 询问是否再保存一份复盘报告（create_agent_artifact，artifactType=editorial_review）。',
].join('\n');

export const EDITORIAL_REVIEW_PROMPT = [REVIEW_APP_RULES, EDITORIAL_BOARD_SPEC].join('\n\n');

export const HEADLINE_ANALYSIS_PROMPT = [
  HEADLINE_APP_RULES,
  CONSTITUTION_SECTION,
  extractEditorialSection(EDITORIAL_BOARD_SPEC, '标题编辑'),
].join('\n\n');

export const PUBLISH_RETRO_PROMPT = [
  RETRO_APP_RULES,
  CONSTITUTION_SECTION,
  extractEditorialSection(EDITORIAL_BOARD_SPEC, '复盘编辑'),
].join('\n\n');
