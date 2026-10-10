/**
 * AI 对话里「记下来」的灵感 → 今日速记「💡 笔记」分区的一条大纲。
 * 只负责拼 Markdown（纯函数），写入走 store.appendDailyMarkdown（会落盘到 Daily/日期.md）。
 */
export const INSPIRATION_DAILY_SECTION = 'note';

const CHILD_INDENT = '  ';
const HEADING_MARK_RE = /^(\s*)#{1,6}\s+/;
const FENCE_RE = /^```/;

const cleanLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const cleanBody = (value) => String(value ?? '').trim();

export const buildInspirationEntry = ({ text, title, sources = [] } = {}) => {
  const body = cleanBody(text);
  if (!body) throw new Error('没有可记录的内容');
  const sourceNames = [...new Set(
    (Array.isArray(sources) ? sources : []).map(cleanLine).filter(Boolean),
  )];
  return {
    heading: `灵感 · ${cleanLine(title) || '新会话'}`,
    body,
    sourceLine: sourceNames.length ? `来源：${sourceNames.join(' / ')}` : '来源：对话',
  };
};

/**
 * 正文缩进成标题条目的子级。速记只认顶格标题当分区，所以正文里的 # 标记去掉，
 * 免得把灵感拆成新分区；代码块内容不缩进（解析时原样读取）。
 */
const indentBody = (body) => {
  let inFence = false;
  return body.split('\n').map((line) => {
    const trimmed = line.trim();
    if (FENCE_RE.test(trimmed)) {
      inFence = !inFence;
      return `${CHILD_INDENT}${trimmed}`;
    }
    if (inFence) return line;
    if (!trimmed) return '';
    return `${CHILD_INDENT}${line.replace(HEADING_MARK_RE, '$1')}`;
  }).join('\n');
};

/** 灵感 → 速记大纲 Markdown：「- 灵感 · 会话名」下挂正文和来源 */
export const buildInspirationDailyMarkdown = (input) => {
  const entry = buildInspirationEntry(input);
  return [
    `- ${entry.heading}`,
    indentBody(entry.body),
    `${CHILD_INDENT}- ${entry.sourceLine}`,
  ].join('\n');
};
