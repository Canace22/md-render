/**
 * AI 编辑部长期记忆：「编辑部记忆」文档的约定与纯函数。
 *
 * 记忆是一篇普通工作区文档（外部 agent 产品可直接编辑同名文件），
 * 固定四个小节，条目只追加不改写。本模块只做纯文本计算：
 * 查找记忆文件、生成模板、把新条目插入对应小节。
 * 读写落库由 host（AgentPanel → store）完成。
 */

export const EDITORIAL_MEMORY_DOC_NAME = '编辑部记忆';

/** category 标识 → 文档小节标题 */
export const MEMORY_CATEGORIES = Object.freeze({
  knowledge: '作者知识体系',
  persona: '作者写作画像',
  experience: '平台经验库',
  retro: '复盘日志',
});

const SECTION_HEADING_PATTERN = /^##\s/;

export const buildMemoryTemplate = () =>
  [
    `# ${EDITORIAL_MEMORY_DOC_NAME}`,
    '',
    '> AI 编辑部的长期知识库。条目只追加、不改写；发现过时经验时新增更正条目，不删除历史。',
    '',
    ...Object.values(MEMORY_CATEGORIES).flatMap((heading) => [`## ${heading}`, '']),
  ].join('\n');

/** 去掉扩展名和首尾空格，用于按名称匹配记忆文件 */
const normalizeDocName = (name) => String(name ?? '').replace(/\.md$/i, '').trim();

/** 在工作区文件列表里找「编辑部记忆」文档 */
export const findEditorialMemoryFile = (files) =>
  (Array.isArray(files) ? files : []).find(
    (file) => file?.type !== 'folder' && normalizeDocName(file?.name) === EDITORIAL_MEMORY_DOC_NAME,
  ) ?? null;

/** 把多行文本格式化成一条带日期的列表条目（续行缩进两格） */
const buildEntryLines = (text, dateKey) => {
  const [first, ...rest] = String(text).trim().split('\n');
  return [
    `- ${dateKey}：${first.trim()}`,
    ...rest.map((line) => `  ${line.trim()}`).filter((line) => line.trim()),
  ];
};

/**
 * 把一条记忆追加到对应小节末尾。
 * @param {string} content  现有文档内容；空则从模板新建
 * @param {object} entry    { category, text, dateKey }
 * @returns {{ ok: true, content: string } | { ok: false, error: string }}
 */
export const appendMemoryEntry = (content, { category, text, dateKey } = {}) => {
  const heading = MEMORY_CATEGORIES[category];
  if (!heading) {
    return { ok: false, error: `不支持的记忆分类「${category ?? ''}」。` };
  }
  const cleanText = String(text ?? '').trim();
  if (!cleanText) return { ok: false, error: '记忆内容为空。' };

  const base = String(content ?? '').trim() ? String(content) : buildMemoryTemplate();
  const lines = base.split('\n');
  const headingLine = `## ${heading}`;

  let sectionStart = lines.findIndex((line) => line.trim() === headingLine);
  if (sectionStart < 0) {
    // 小节被用户删掉/改名：在文末补回，保持只追加语义
    if (lines[lines.length - 1]?.trim()) lines.push('');
    lines.push(headingLine, '');
    sectionStart = lines.length - 2;
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (SECTION_HEADING_PATTERN.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  // 插到小节内容末尾（跳过小节尾部的空行，保持与下一节之间的空行）
  let insertAt = sectionEnd;
  while (insertAt > sectionStart + 1 && !lines[insertAt - 1].trim()) insertAt -= 1;

  const entryLines = buildEntryLines(cleanText, String(dateKey ?? '').trim() || '未记日期');
  lines.splice(insertAt, 0, ...entryLines);
  return { ok: true, content: lines.join('\n') };
};
