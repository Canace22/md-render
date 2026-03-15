/**
 * 将 HTML 转换为微信公众号兼容格式并复制到剪贴板
 * 支持多种排版模板，通过 template 参数切换风格
 */

import { getTemplateById } from './wechatTemplates.js';

/**
 * 参照 wechat-format：将 ul/ol 转为 p+bullet，避免微信编辑器重置列表样式
 * @see https://github.com/lyricat/wechat-format
 */
const convertListsToParagraphs = (tempDiv, template) => {
  const { base, spacing } = template;
  const pStyle = `margin: 0 0 ${spacing.paragraph} 0; line-height: ${base.lineHeight};`;

  const convertList = (listEl) => {
    const isOl = listEl.tagName.toLowerCase() === 'ol';
    const wrapper = document.createElement('div');
    const items = listEl.querySelectorAll(':scope > li');
    let index = 1;
    items.forEach((li) => {
      const p = document.createElement('p');
      p.setAttribute('style', pStyle);
      const bullet = isOl ? `${index++}. ` : '• ';
      p.innerHTML = bullet + li.innerHTML;
      wrapper.appendChild(p);
    });
    return wrapper;
  };

  const lists = Array.from(tempDiv.querySelectorAll('ul, ol'));
  lists.reverse().forEach((list) => {
    const wrapper = convertList(list);
    list.parentNode?.replaceChild(wrapper, list);
  });
};

const applyTemplateStyles = (tempDiv, template) => {
  const { base, linkColor, borderColor, headingBorderColor, headingFontSize, headingAlign, spacing, blockquote, statement, code, codeBlockBg, image } =
    template;

  convertListsToParagraphs(tempDiv, template);

  const codeBlocks = tempDiv.querySelectorAll('figure.code-block');
  codeBlocks.forEach((figure) => {
    const dataCode = figure.getAttribute('data-code');
    let codeContent = '';

    if (dataCode) {
      try {
        codeContent = decodeURIComponent(dataCode);
      } catch (e) {
        const code = figure.querySelector('code');
        codeContent = code?.textContent || code?.innerText || '';
      }
    } else {
      const code = figure.querySelector('code');
      codeContent = code?.textContent || code?.innerText || '';
    }

    // 公众号会过滤部分换行符，需将 \n 转为 <br/> 才能正确显示多行代码
    // @see https://www.barretlee.com/blog/2016/07/14/codes-in-wechat/
    const escaped = codeContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const withBr = escaped.replace(/\n/g, '<br/>');

    const codeBg = codeBlockBg ?? (base.backgroundColor === '#1e1e1e' ? '#2d2d2d' : '#f7f7f7');
    const codeBorder = base.backgroundColor === '#1e1e1e' ? '#444' : '#ececec';

    const newPre = document.createElement('pre');
    newPre.setAttribute(
      'style',
      `margin: ${spacing.block} 0; padding: 10px; overflow: auto; font-family: ${code.fontFamily}; font-size: ${base.fontSize}; line-height: 1.5; background-color: ${codeBg}; border: 1px solid ${codeBorder}; border-radius: 4px;`
    );

    const newCode = document.createElement('code');
    newCode.setAttribute(
      'style',
      `background-color: transparent; padding: 0; margin: 0; font-size: inherit; font-family: inherit; white-space: pre-wrap; word-break: break-all; color: inherit;`
    );
    newCode.innerHTML = withBr;
    newPre.appendChild(newCode);

    figure.parentNode?.replaceChild(newPre, figure);
  });

  const inlineCodes = tempDiv.querySelectorAll('code:not(pre code)');
  inlineCodes.forEach((c) => {
    if (!c.closest('pre')) {
      c.setAttribute('style', `padding: 0; margin: 0; font-size: inherit; font-family: ${code.fontFamily};`);
    }
  });

  const images = tempDiv.querySelectorAll('img');
  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (src?.startsWith('http://')) {
      img.setAttribute('src', src.replace('http://', 'https://'));
    }
    img.setAttribute(
      'style',
      `max-width: 100%; height: auto; display: block; margin: ${image.margin}; border-radius: ${image.borderRadius};`
    );
  });

  const tables = tempDiv.querySelectorAll('table');
  tables.forEach((table) => {
    table.setAttribute(
      'style',
      `border-collapse: collapse; border-spacing: 0; width: 100%; margin: ${spacing.block} 0;`
    );
    table.querySelectorAll('th').forEach((th) => {
      th.setAttribute(
        'style',
        `border: 1px solid ${borderColor}; padding: 6px 13px; font-weight: 600;`
      );
    });
    table.querySelectorAll('td').forEach((td) => {
      td.setAttribute('style', `border: 1px solid ${borderColor}; padding: 6px 13px;`);
    });
  });

  const blockquotes = tempDiv.querySelectorAll('blockquote');
  blockquotes.forEach((bq) => {
    const text = (bq.textContent || '').trim();
    const isStatement = statement && text.startsWith('声明');
    const style = isStatement ? statement : blockquote;
    let bqStyle = `padding: ${style.padding}; margin: ${spacing.block} 0;`;
    if (style.border) bqStyle += ` border: ${style.border};`;
    else if (style.borderLeft) bqStyle += ` border-left: ${style.borderLeft};`;
    if (style.color) bqStyle += ` color: ${style.color};`;
    if (style.fontStyle) bqStyle += ` font-style: ${style.fontStyle};`;
    bq.setAttribute('style', bqStyle);
  });

  const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const headingSize = (tag) => (headingFontSize?.[tag] ?? base.fontSize);
  headings.forEach((heading) => {
    const tag = heading.tagName.toLowerCase();
    const top = spacing.headingTop[tag] ?? spacing.headingTop.h6;
    const bottom = spacing.headingBottom[tag] ?? spacing.headingBottom.h6;
    let style = `font-size: ${headingSize(tag)}; font-weight: 600; line-height: ${base.lineHeight}; margin-top: ${top}; margin-bottom: ${bottom};`;
    if (headingAlign?.[tag]) style += ` text-align: ${headingAlign[tag]};`;
    heading.setAttribute('style', style);
  });

  const paragraphs = tempDiv.querySelectorAll('p');
  paragraphs.forEach((p) => {
    p.setAttribute('style', `margin: 0 0 ${spacing.paragraph} 0; line-height: ${base.lineHeight};`);
  });

  const links = tempDiv.querySelectorAll('a');
  links.forEach((link) => {
    link.setAttribute('style', `color: ${linkColor}; text-decoration: none;`);
  });

  const hrs = tempDiv.querySelectorAll('hr');
  hrs.forEach((hr) => {
    hr.setAttribute(
      'style',
      `border: none; border-top: 1px solid ${headingBorderColor}; margin: ${spacing.block} 0;`
    );
  });

  // 微信公众号需显式设置 font-weight: bold，否则部分字体看不出粗体
  const strongTags = tempDiv.querySelectorAll('strong, b');
  strongTags.forEach((el) => {
    const existing = el.getAttribute('style') || '';
    el.setAttribute('style', `${existing}; font-weight: bold; display: inline;`.replace(/^;\s*/, ''));
  });

  // em/i 斜体：显式设置 font-style
  const emTags = tempDiv.querySelectorAll('em, i');
  emTags.forEach((el) => {
    const existing = el.getAttribute('style') || '';
    el.setAttribute('style', `${existing}; font-style: italic; display: inline;`.replace(/^;\s*/, ''));
  });

  // section 是块级元素，公众号编辑器可能用它包裹内容导致换行，转为 span 保持行内
  const sections = tempDiv.querySelectorAll('section');
  sections.forEach((section) => {
    const span = document.createElement('span');
    span.innerHTML = section.innerHTML;
    const style = section.getAttribute('style') || '';
    span.setAttribute('style', `${style}; display: inline;`.replace(/^;\s*/, ''));
    section.parentNode?.replaceChild(span, section);
  });

  // 去除首尾空白：首元素 margin-top、末元素 margin-bottom 置 0，避免粘贴后前后大段留白
  const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'DIV', 'UL', 'OL', 'TABLE', 'HR'];
  const blocks = Array.from(tempDiv.children).filter((el) =>
    el.nodeType === Node.ELEMENT_NODE && blockTags.includes(el.tagName)
  );
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const trimMarginTop = (el) => {
    const s = (el.getAttribute('style') || '').replace(/\bmargin-top:\s*[^;]+;?\s*/gi, '').trim();
    el.setAttribute('style', (s ? s + '; ' : '') + 'margin-top: 0;');
  };
  const trimMarginBottom = (el) => {
    const s = (el.getAttribute('style') || '').replace(/\bmargin-bottom:\s*[^;]+;?\s*/gi, '').trim();
    el.setAttribute('style', (s ? s + '; ' : '') + 'margin-bottom: 0;');
  };
  if (first) trimMarginTop(first);
  if (last) trimMarginBottom(last);
};

const stripDataAndClass = (tempDiv) => {
  tempDiv.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-') || attr.name === 'class') {
        el.removeAttribute(attr.name);
      }
    });
  });
};

const removeRedundantBr = (tempDiv) => {
  const blockElements = [
    'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI',
    'BLOCKQUOTE', 'PRE', 'TABLE', 'HR', 'FIGURE', 'ARTICLE', 'SECTION', 'HEADER', 'FOOTER',
  ];
  const isBlock = (node) =>
    node?.nodeType === Node.ELEMENT_NODE && blockElements.includes(node.tagName);

  const getPrev = (node) => {
    let prev = node.previousSibling;
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim()) prev = prev.previousSibling;
    return prev;
  };
  const getNext = (node) => {
    let next = node.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) next = next.nextSibling;
    return next;
  };

  Array.from(tempDiv.querySelectorAll('br')).forEach((br) => {
    const prev = getPrev(br);
    const next = getNext(br);
    if (isBlock(prev) && isBlock(next)) {
      br.parentNode?.removeChild(br);
      return;
    }
    if (prev?.nodeName === 'BR') {
      br.parentNode?.removeChild(br);
      return;
    }
    const emptyPrev = !prev || (prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim());
    const emptyNext = !next || (next.nodeType === Node.TEXT_NODE && !next.textContent.trim());
    if (emptyPrev && emptyNext) {
      br.parentNode?.removeChild(br);
    }
  });
};

/**
 * 将 HTML 转换为微信公众号兼容格式
 * @param {string} htmlString - 原始 HTML
 * @param {string} [templateId='default'] - 模板 ID
 * @returns {string} 转换后的 HTML
 */
/** 移除首尾的 br、空块、空白文本节点，避免粘贴后前后大段留白 */
const removeLeadingTrailingWhitespace = (tempDiv) => {
  const isBlank = (node) => {
    if (!node) return true;
    if (node.nodeType === Node.TEXT_NODE) return !node.textContent.trim();
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') return true;
    if (node.nodeType === Node.ELEMENT_NODE && ['P', 'DIV'].includes(node.tagName)) {
      return !node.textContent.trim();
    }
    return false;
  };
  let node = tempDiv.firstChild;
  while (node && isBlank(node)) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }
  node = tempDiv.lastChild;
  while (node && isBlank(node)) {
    const prev = node.previousSibling;
    node.remove();
    node = prev;
  }
};

const convertToWeChatHTML = (htmlString, templateId = 'default') => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString.trim();

  const template = getTemplateById(templateId);
  if (template.autoStatement) {
    const bq = document.createElement('blockquote');
    bq.innerHTML = template.autoStatement;
    tempDiv.appendChild(bq);
  }

  removeLeadingTrailingWhitespace(tempDiv);
  applyTemplateStyles(tempDiv, template);
  removeRedundantBr(tempDiv);
  stripDataAndClass(tempDiv);

  const wrapper = document.createElement('div');
  const { base } = template;
  const bg = base.backgroundColor ?? '#ffffff';
  let wrapperStyle = `margin: 0; padding: 0; font-size: ${base.fontSize}; line-height: ${base.lineHeight}; color: ${base.color}; background-color: ${bg};`;
  if (base.fontFamily) wrapperStyle += ` font-family: ${base.fontFamily};`;
  wrapper.setAttribute('style', wrapperStyle);
  wrapper.innerHTML = tempDiv.innerHTML;

  return wrapper.outerHTML;
};

/**
 * 复制到微信公众号格式
 * @param {string} html - 原始 HTML
 * @param {Object} [options] - 选项
 * @param {string} [options.buttonId] - 复制按钮 ID，用于显示「已复制」反馈
 * @param {string} [options.templateId='default'] - 排版模板 ID
 */
const copyToWeChat = async (html, options = {}) => {
  if (!html) {
    throw new Error('没有可复制的内容');
  }

  const { buttonId, templateId = 'default' } = options;

  const copySuccess = () => {
    if (!buttonId) return;
    const button = document.getElementById(buttonId);
    if (!button) return;
    const originalText = button.textContent;
    button.textContent = '已复制！';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  };

  const wechatHTML = convertToWeChatHTML(html, templateId);
  const plainText = (() => {
    const div = document.createElement('div');
    div.innerHTML = wechatHTML;
    return div.textContent || div.innerText || '';
  })();

  /**
   * 优先使用 Clipboard API 写入原始 HTML，保证所选模板样式完整进入剪贴板。
   * execCommand 从 DOM 序列化可能被父容器样式干扰，导致粘贴后样式不符。
   */
  const writeWithClipboardAPI = async () => {
    if (!navigator.clipboard?.write) return false;
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([wechatHTML], { type: 'text/html;charset=utf-8' }),
        'text/plain': new Blob([plainText], { type: 'text/plain;charset=utf-8' }),
      }),
    ]);
    return true;
  };

  /**
   * 降级：execCommand 复制。容器仅做定位，不设置 font-size/line-height 避免干扰子元素样式。
   * @see https://github.com/lyricat/wechat-format
   */
  const writeWithExecCommand = () => {
    const container = document.createElement('div');
    container.innerHTML = wechatHTML;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(container);

    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStartBefore(container.firstChild);
    range.setEndAfter(container.lastChild);
    sel.addRange(range);

    document.execCommand('copy');
    document.body.removeChild(container);
    sel.removeAllRanges();
  };

  try {
    const ok = await writeWithClipboardAPI();
    if (ok) {
      copySuccess();
      return;
    }
  } catch (_) {
    /* clipboard API 不可用或失败，继续降级 */
  }

  try {
    writeWithExecCommand();
    copySuccess();
  } catch (err) {
    console.error('复制失败:', err);
    throw err;
  }
};

export { convertToWeChatHTML, copyToWeChat };
