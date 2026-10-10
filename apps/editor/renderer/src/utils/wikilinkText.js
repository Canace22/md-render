import { findWikilinks } from '@narrative/blocknote-core';

/**
 * 把纯文本拆成「普通文字 / [[双链]]」片段（纯函数），供思维导图等只读视图渲染：
 * 双链只显示文档名（或别名），不显示方括号。
 * 返回 [{ type: 'text', text } | { type: 'link', name, label }]
 */
export const splitWikilinks = (text) => {
  const source = String(text ?? '');
  const segments = [];
  let cursor = 0;
  findWikilinks(source).forEach(({ start, end, labelStart, labelEnd, name }) => {
    if (start > cursor) segments.push({ type: 'text', text: source.slice(cursor, start) });
    segments.push({ type: 'link', name, label: source.slice(labelStart, labelEnd).trim() || name });
    cursor = end;
  });
  if (cursor < source.length) segments.push({ type: 'text', text: source.slice(cursor) });
  return segments;
};

/**
 * 把 [[双链]] 换成带文件路径的标准 Markdown 链接（复制给外部 AI 用，它不认识双链）。
 * resolvePath(name) 返回路径；返回空串说明找不到 / 不在磁盘上，原样保留 [[双链]]。
 * 路径用 <> 包起来，文件名里有空格、括号也不会断。
 */
export const wikilinksToPathLinks = (text, resolvePath) => {
  const source = String(text ?? '');
  let out = '';
  let cursor = 0;
  findWikilinks(source).forEach(({ start, end, labelStart, labelEnd, name }) => {
    const filePath = resolvePath(name);
    if (!filePath) return;
    const label = source.slice(labelStart, labelEnd).trim() || name;
    out += `${source.slice(cursor, start)}[${label}](<${filePath}>)`;
    cursor = end;
  });
  return out + source.slice(cursor);
};
