/**
 * AI 编辑部：多角色审稿工作流的 prompt 拼装。
 *
 * 规范正文是内置 skill `ai-editorial-board`（resources/skills/ai-editorial-board/SKILL.md），
 * 三个入口 skill（editorial-review / editorial-headline / editorial-retro）的正文是 app 内工具接线，
 * 这里按入口把「接线 + 规范（或其中几节）」拼成最终 prompt。内容库里同名 skill 可覆盖任一部分。
 *
 * 纯模块：无 IPC / store / React 依赖，可直接单测。
 */

import { BUILTIN_SKILL_ENTRIES } from './builtinSkills.js';
import { buildSkillRegistry, findSkillById } from './skillRegistry.js';

export const EDITORIAL_SPEC_SKILL_ID = 'ai-editorial-board';
export const EDITORIAL_SKILL_IDS = Object.freeze({
  REVIEW: 'editorial-review',
  HEADLINE: 'editorial-headline',
  RETRO: 'editorial-retro',
});

const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n/;

/** 去掉 SKILL.md 顶部 frontmatter，得到可直接给模型看的规范正文 */
export const stripFrontmatter = (text) =>
  String(text ?? '').replace(FRONTMATTER_PATTERN, '').trim();

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

// 每个入口用规范的哪些部分：审稿用全文，标题 / 复盘只用宪法 + 对应角色
const SPEC_PICKERS = Object.freeze({
  [EDITORIAL_SKILL_IDS.REVIEW]: (spec) => [spec],
  [EDITORIAL_SKILL_IDS.HEADLINE]: (spec) => [
    extractEditorialSection(spec, '编辑部宪法'),
    extractEditorialSection(spec, '标题编辑'),
  ],
  [EDITORIAL_SKILL_IDS.RETRO]: (spec) => [
    extractEditorialSection(spec, '编辑部宪法'),
    extractEditorialSection(spec, '复盘编辑'),
  ],
});

export const isEditorialSkill = (skillId) => Object.hasOwn(SPEC_PICKERS, skillId);

/**
 * 拼出编辑部入口 skill 的完整 prompt。非编辑部 skill 原样返回其正文。
 * @param {string} skillId
 * @param {object[]} skills 当前 skill 列表（含内容库覆盖）
 */
export const composeEditorialPrompt = (skillId, skills) => {
  const skill = findSkillById(skills, skillId);
  if (!skill) return '';
  const picker = SPEC_PICKERS[skillId];
  if (!picker) return skill.prompt;
  const spec = findSkillById(skills, EDITORIAL_SPEC_SKILL_ID)?.prompt || '';
  return [skill.prompt, ...picker(spec)].filter(Boolean).join('\n\n');
};

const { skills: BUILTIN_SKILLS } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });

export const EDITORIAL_BOARD_SPEC = findSkillById(BUILTIN_SKILLS, EDITORIAL_SPEC_SKILL_ID)?.prompt || '';
export const EDITORIAL_REVIEW_PROMPT = composeEditorialPrompt(EDITORIAL_SKILL_IDS.REVIEW, BUILTIN_SKILLS);
export const HEADLINE_ANALYSIS_PROMPT = composeEditorialPrompt(EDITORIAL_SKILL_IDS.HEADLINE, BUILTIN_SKILLS);
export const PUBLISH_RETRO_PROMPT = composeEditorialPrompt(EDITORIAL_SKILL_IDS.RETRO, BUILTIN_SKILLS);
