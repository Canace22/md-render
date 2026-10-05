import {
  isBlockNoteContent,
  parseBlockNoteContent,
  serializeBlockNoteContent,
} from '../../utils/markdownUtils.js';

export const INSPIRATION_NOTE_NAME = '灵感.md';

const cleanLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const cleanBody = (value) => String(value ?? '').trim();

export const buildInspirationEntry = ({ text, title, dateKey, sources = [] } = {}) => {
  const body = cleanBody(text);
  if (!body) throw new Error('没有可记录的内容');
  const sourceNames = [...new Set(
    (Array.isArray(sources) ? sources : []).map(cleanLine).filter(Boolean),
  )];
  return {
    heading: `${cleanLine(dateKey) || '未知日期'} · ${cleanLine(title) || '新会话'}`,
    body,
    sourceLine: sourceNames.length ? `来源：${sourceNames.join(' / ')}` : '来源：对话',
  };
};

const toMarkdown = (entry) => [
  `## ${entry.heading}`,
  entry.body.split('\n').map((line) => `> ${line}`).join('\n'),
  entry.sourceLine,
].join('\n\n');

const appendBlockNoteEntry = (content, entry) => {
  const blocks = parseBlockNoteContent(content);
  if (!blocks) return null;
  return serializeBlockNoteContent([
    ...blocks,
    { type: 'heading', props: { level: 2 }, content: entry.heading },
    { type: 'quote', content: entry.body },
    { type: 'paragraph', content: entry.sourceLine },
  ]);
};

export const appendInspirationEntry = (content, input) => {
  const entry = buildInspirationEntry(input);
  if (isBlockNoteContent(content)) {
    return appendBlockNoteEntry(content, entry);
  }
  const current = cleanBody(content);
  return `${current ? `${current}\n\n` : '# 灵感\n\n'}${toMarkdown(entry)}\n`;
};
