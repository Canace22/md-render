/**
 * Markdown 渲染器
 * 将解析后的 token 数组转换为 HTML
 */

import { MarkdownParser } from './parser.js';

export class MarkdownRenderer {
    constructor() {
        this.parser = new MarkdownParser();
    }

    /**
     * 渲染 token 数组为 HTML
     * @param {Array} tokens - 解析后的 token 数组
     * @returns {string} HTML 字符串
     */
    render(tokens) {
        const htmlParts = [];
        let i = 0;

        while (i < tokens.length) {
            const token = tokens[i];
            htmlParts.push(this.renderToken(token));
            i++;
        }

        return htmlParts.join('');
    }

    /**
     * 渲染单个 token
     */
    renderToken(token) {
        switch (token.type) {
            case 'heading':
                return this.renderHeading(token);
            case 'paragraph':
                return this.renderParagraph(token);
            case 'code-block':
                return this.renderCodeBlock(token);
            case 'list':
                return this.renderList(token);
            case 'blockquote':
                return this.renderBlockquote(token);
            case 'hr':
                return '<hr>';
            case 'empty':
                return '<br>';
            default:
                return '';
        }
    }

    /**
     * 渲染标题
     */
    renderHeading(token) {
        const inlineContent = this.parser.parseInline(token.content);
        return `<h${token.level}>${inlineContent.content}</h${token.level}>`;
    }

    /**
     * 渲染段落
     */
    renderParagraph(token) {
        const inlineContent = this.parser.parseInline(token.content);
        return `<p>${inlineContent.content}</p>`;
    }

    /**
     * 渲染代码块
     */
    renderCodeBlock(token) {
        const escaped = this.escapeHtml(token.content);
        const lang = token.language || 'text';
        // 将原始内容编码后存储在 data 属性中，用于复制
        const encodedContent = this.encodeForDataAttr(token.content);
        return `
<figure class="code-block" data-code="${encodedContent}">
  <div class="code-header">
    <span class="code-lang">${lang}</span>
    <button class="code-copy-btn" title="复制代码" aria-label="复制代码">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 2C4 0.895431 4.89543 0 6 0H10C11.1046 0 12 0.895431 12 2V4H14C15.1046 4 16 4.89543 16 6V14C16 15.1046 15.1046 16 14 16H8C6.89543 16 6 15.1046 6 14V12H4C2.89543 12 2 11.1046 2 10V2C2 0.895431 2.89543 0 4 0H4Z" fill="currentColor"/>
        <path d="M6 2C6 1.44772 6.44772 1 7 1H9C9.55228 1 10 1.44772 10 2V4H8C6.89543 4 6 4.89543 6 6V8H4C3.44772 8 3 7.55228 3 7V3C3 2.44772 3.44772 2 4 2H6Z" fill="currentColor"/>
      </svg>
    </button>
  </div>
  <pre><code class="language-${lang}">${escaped}</code></pre>
</figure>`;
    }

    /**
     * 编码字符串以安全存储在 data 属性中
     */
    encodeForDataAttr(text) {
        return encodeURIComponent(text);
    }

    /**
     * 渲染列表（支持递归渲染嵌套列表）
     */
    renderList(token) {
        const tag = token.listType === 'ordered' ? 'ol' : 'ul';
        const items = token.items.map(item => {
            let content = item.content;
            
            // 递归渲染嵌套列表（children 是完整的 list token）
            if (item.children && item.children.length > 0) {
                const nestedLists = item.children.map(childToken => {
                    return this.renderList(childToken);
                }).join('');
                content += nestedLists;
            }
            
            return `<li>${content}</li>`;
        }).join('');

        return `<${tag}>${items}</${tag}>`;
    }

    /**
     * 渲染引用
     */
    renderBlockquote(token) {
        const inlineContent = this.parser.parseInline(token.content);
        return `<blockquote>${inlineContent.content}</blockquote>`;
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

