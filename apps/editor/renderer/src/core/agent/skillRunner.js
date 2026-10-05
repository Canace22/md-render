/**
 * 把一个 skill 变成一轮对话要发的内容：prompt、界面显示文案、工具白名单。
 *
 * 规则只看 skill 的声明：
 * - input=selection 且有选中文本：只处理选区，原文拼在最后
 * - input=active_doc / selection（无选区）：先读当前文档
 * - input=none：直接用正文
 * 编辑部入口会拼上共享规范（见 editorialBoard.js）。
 *
 * 纯模块：不碰 IPC / store / React。
 */

import { composeEditorialPrompt } from './editorialBoard.js';

export const SELECTION_INTRO = '请先理解上下文，然后只处理下面这段选中文本。';
export const ACTIVE_DOC_INTRO = '请先读取当前文档（read_active_doc），再按下面的要求处理整篇正文。';

const pickIntro = (input, usesSelection) => {
  if (usesSelection) return SELECTION_INTRO;
  return input === 'none' ? '' : ACTIVE_DOC_INTRO;
};

/**
 * @param {object} skill skillRegistry 产出的 skill
 * @param {object} [options]
 * @param {object[]} [options.skills] 当前完整 skill 列表（编辑部入口需要拿共享规范）
 * @param {string} [options.selectionText] 编辑器里引用的选中文本
 * @returns {{ promptText: string, displayText: string, allowedTools: string[], consumesSelection: boolean }}
 */
export const buildSkillTurn = (skill, { skills = [], selectionText = '' } = {}) => {
  const selection = String(selectionText ?? '').trim();
  const usesSelection = skill.input === 'selection' && Boolean(selection);
  const body = composeEditorialPrompt(skill.id, skills) || skill.prompt;
  const promptText = [
    pickIntro(skill.input, usesSelection),
    body,
    usesSelection ? `选中原文：\n${selection}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    promptText,
    displayText: skill.label,
    allowedTools: [...skill.tools],
    consumesSelection: usesSelection,
  };
};
