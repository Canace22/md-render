import {
  isBlockNoteContent,
  parseBlockNoteContent,
  serializeBlockNoteContent,
} from '../../utils/markdownUtils.js';

/**
 * AI 面板「插入引用」：把相关旧文的标题 + 摘要作为引用块追加到正文末尾（纯函数）。
 * 正文可能是 BlockNote JSON（编辑过的文档）或 Markdown，两种格式分别追加，
 * 不能把 Markdown 文本直接拼到 JSON 后面——会把整篇文档弄坏。
 */

const DEFAULT_REFERENCE_TITLE = '未命名';

const toReferenceParts = (ref) => ({
  title: String(ref?.title ?? '').trim() || DEFAULT_REFERENCE_TITLE,
  snippet: String(ref?.snippet ?? '').trim(),
});

const toMarkdownQuote = ({ title, snippet }) => (snippet
  ? `> 参考：${title}\n>\n> ${snippet.replace(/\n/g, '\n> ')}`
  : `> 参考：${title}`);

export const appendReferenceToContent = (content, ref) => {
  const parts = toReferenceParts(ref);
  if (isBlockNoteContent(content)) {
    const blocks = parseBlockNoteContent(content);
    if (blocks) {
      const text = parts.snippet ? `参考：${parts.title}\n${parts.snippet}` : `参考：${parts.title}`;
      return serializeBlockNoteContent([...blocks, { type: 'quote', content: text }]);
    }
  }
  const current = String(content ?? '').replace(/\s+$/, '');
  return `${current ? `${current}\n\n` : ''}${toMarkdownQuote(parts)}\n`;
};
