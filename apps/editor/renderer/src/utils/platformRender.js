/**
 * 把 Markdown 渲染成公众号可粘贴的内联样式 HTML（和编辑器「复制公众号」同一条链路）。
 * 依赖 DOM（convertToWeChatHTML），只能在 renderer 里跑。
 */

import { MarkdownParser, MarkdownRenderer } from '../core';
import { convertToWeChatHTML } from './wechatCopy.js';
import { TEMPLATES } from './wechatTemplates.js';
import { isBlockNoteContent, normalizeMarkdown } from './markdownUtils.js';
import { parseMarkdownFrontmatter } from '@shared/frontmatter.js';

export const PLATFORM_HTML_TEMPLATE_IDS = Object.freeze(TEMPLATES.map((template) => template.id));
export const MAX_PLATFORM_HTML_CHARS = 60000;

const parser = new MarkdownParser();
const renderer = new MarkdownRenderer();

/**
 * @returns {{ ok: true, templateId: string, html: string, truncated: boolean } | { ok: false, error: string }}
 */
export function renderPlatformHtml(content, templateId = 'default') {
  if (!PLATFORM_HTML_TEMPLATE_IDS.includes(templateId)) {
    return { ok: false, error: `模板只能是 ${PLATFORM_HTML_TEMPLATE_IDS.join(' / ')}` };
  }
  if (isBlockNoteContent(content)) {
    return { ok: false, error: '该文档是旧版富文本格式，请先在编辑器里打开一次再渲染。' };
  }
  const body = parseMarkdownFrontmatter(normalizeMarkdown(content ?? '')).content;
  if (!body.trim()) return { ok: false, error: '文档正文为空。' };

  const html = convertToWeChatHTML(renderer.render(parser.parse(body)), templateId);
  const truncated = html.length > MAX_PLATFORM_HTML_CHARS;
  return { ok: true, templateId, html: truncated ? html.slice(0, MAX_PLATFORM_HTML_CHARS) : html, truncated };
}
