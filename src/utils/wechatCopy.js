/**
 * 将 HTML 转换为微信公众号兼容格式并复制到剪贴板
 * 字号 16px、段落间距 8px、行高 1.6
 */

const convertToWeChatHTML = (htmlString) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;

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

    const newPre = document.createElement('pre');
    newPre.setAttribute(
      'style',
      'padding: 0; ' +
        'overflow: auto; ' +
        'margin: 8px 0; ' +
        'font-family: "Consolas", "Monaco", "Courier New", monospace; ' +
        'font-size: 16px; ' +
        'line-height: 1.6; ' +
        'word-wrap: normal;'
    );

    const newCode = document.createElement('code');
    newCode.setAttribute(
      'style',
      'background-color: transparent; ' +
        'padding: 0; ' +
        'margin: 0; ' +
        'font-size: inherit; ' +
        'font-family: inherit; ' +
        'word-break: normal; ' +
        'white-space: pre;'
    );
    newCode.textContent = codeContent;
    newPre.appendChild(newCode);

    figure.parentNode?.replaceChild(newPre, figure);
  });

  const inlineCodes = tempDiv.querySelectorAll('code:not(pre code)');
  inlineCodes.forEach((code) => {
    if (!code.closest('pre')) {
      code.setAttribute(
        'style',
        'padding: 0; ' +
          'margin: 0; ' +
          'font-size: inherit; ' +
          'font-family: "Consolas", "Monaco", "Courier New", monospace;'
      );
    }
  });

  const images = tempDiv.querySelectorAll('img');
  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('http://')) {
      img.setAttribute('src', src.replace('http://', 'https://'));
    }
    img.setAttribute(
      'style',
      'max-width: 100%; ' +
        'height: auto; ' +
        'display: block; ' +
        'margin: 8px auto; ' +
        'border-radius: 4px;'
    );
  });

  const tables = tempDiv.querySelectorAll('table');
  tables.forEach((table) => {
    table.setAttribute(
      'style',
      'border-collapse: collapse; ' +
        'border-spacing: 0; ' +
        'width: 100%; ' +
        'margin: 8px 0;'
    );

    const ths = table.querySelectorAll('th');
    ths.forEach((th) => {
      th.setAttribute(
        'style',
        'border: 1px solid #dfe2e5; ' + 'padding: 6px 13px; ' + 'font-weight: 600;'
      );
    });

    const tds = table.querySelectorAll('td');
    tds.forEach((td) => {
      td.setAttribute('style', 'border: 1px solid #dfe2e5; ' + 'padding: 6px 13px;');
    });
  });

  const blockquotes = tempDiv.querySelectorAll('blockquote');
  blockquotes.forEach((blockquote) => {
    blockquote.setAttribute(
      'style',
      'padding: 0 1em; ' + 'border-left: 0.25em solid #dfe2e5; ' + 'margin: 8px 0;'
    );
  });

  const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading) => {
    const tag = heading.tagName.toLowerCase();
    if (tag === 'h1') {
      heading.setAttribute(
        'style',
        'font-size: 16px; ' +
          'font-weight: 600; ' +
          'line-height: 1.6; ' +
          'margin-top: 16px; ' +
          'margin-bottom: 6px;'
      );
    } else if (tag === 'h2') {
      heading.setAttribute(
        'style',
        'font-size: 16px; ' +
          'font-weight: 600; ' +
          'line-height: 1.6; ' +
          'margin-top: 14px; ' +
          'margin-bottom: 5px; ' +
          'border-bottom: 1px solid #eaecef; ' +
          'padding-bottom: 0.3em;'
      );
    } else if (tag === 'h3') {
      heading.setAttribute(
        'style',
        'font-size: 16px; ' +
          'font-weight: 600; ' +
          'line-height: 1.6; ' +
          'margin-top: 12px; ' +
          'margin-bottom: 4px;'
      );
    } else {
      heading.setAttribute(
        'style',
        'font-size: 16px; ' +
          'font-weight: 600; ' +
          'line-height: 1.6; ' +
          'margin-top: 10px; ' +
          'margin-bottom: 4px;'
      );
    }
  });

  const paragraphs = tempDiv.querySelectorAll('p');
  paragraphs.forEach((p) => {
    p.setAttribute('style', 'margin: 0 0 8px 0; line-height: 1.6;');
  });

  const lists = tempDiv.querySelectorAll('ul, ol');
  lists.forEach((list) => {
    list.setAttribute(
      'style',
      'padding-left: 2em; ' + 'margin-top: 0; ' + 'margin-bottom: 8px;'
    );
  });

  const listItems = tempDiv.querySelectorAll('li');
  listItems.forEach((li) => {
    li.setAttribute('style', 'line-height: 1.6; margin: 0;');
  });

  const links = tempDiv.querySelectorAll('a');
  links.forEach((link) => {
    link.setAttribute('style', 'color: #0366d6; text-decoration: none;');
  });

  const hrs = tempDiv.querySelectorAll('hr');
  hrs.forEach((hr) => {
    hr.setAttribute(
      'style',
      'border: none; ' + 'border-top: 1px solid #eaecef; ' + 'margin: 8px 0;'
    );
  });

  const allBrNodes = Array.from(tempDiv.querySelectorAll('br'));

  const blockElements = [
    'P',
    'DIV',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'PRE',
    'TABLE',
    'HR',
    'FIGURE',
    'ARTICLE',
    'SECTION',
    'HEADER',
    'FOOTER',
  ];

  const isBlockElement = (node) => {
    if (!node) return false;
    if (node.nodeType === Node.ELEMENT_NODE) {
      return blockElements.includes(node.tagName);
    }
    return false;
  };

  const getPreviousSibling = (node) => {
    let prev = node.previousSibling;
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim()) {
      prev = prev.previousSibling;
    }
    return prev;
  };

  const getNextSibling = (node) => {
    let next = node.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) {
      next = next.nextSibling;
    }
    return next;
  };

  allBrNodes.forEach((br) => {
    const prevSibling = getPreviousSibling(br);
    const nextSibling = getNextSibling(br);

    if (isBlockElement(prevSibling) && isBlockElement(nextSibling)) {
      br.parentNode?.removeChild(br);
      return;
    }

    if (prevSibling && prevSibling.nodeName === 'BR') {
      br.parentNode?.removeChild(br);
      return;
    }

    if (
      (!prevSibling ||
        (prevSibling.nodeType === Node.TEXT_NODE && !prevSibling.textContent.trim())) &&
      (!nextSibling ||
        (nextSibling.nodeType === Node.TEXT_NODE && !nextSibling.textContent.trim()))
    ) {
      br.parentNode?.removeChild(br);
    }
  });

  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-') || attr.name === 'class') {
        el.removeAttribute(attr.name);
      }
    });
  });

  const wrapper = document.createElement('div');
  wrapper.setAttribute('style', 'font-size: 16px; line-height: 1.6; color: #24292e;');
  wrapper.innerHTML = tempDiv.innerHTML;

  return wrapper.outerHTML;
};

const copyToWeChat = async (html, options = {}) => {
  if (!html) {
    throw new Error('没有可复制的内容');
  }

  const { buttonId } = options;

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

  const wechatHTML = convertToWeChatHTML(html);

  try {
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.innerHTML = wechatHTML;
    document.body.appendChild(tempDiv);

    const range = document.createRange();
    range.selectNodeContents(tempDiv);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      document.execCommand('copy');
      selection.removeAllRanges();
    } catch (e) {
      await navigator.clipboard.writeText(wechatHTML);
    }

    document.body.removeChild(tempDiv);
    copySuccess();
  } catch (err) {
    console.error('复制失败:', err);
    try {
      const fallbackHTML = convertToWeChatHTML(html);
      const textArea = document.createElement('textarea');
      textArea.value = fallbackHTML;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      copySuccess();
    } catch (err2) {
      console.error('降级复制也失败:', err2);
      throw err2;
    }
  }
};

export { convertToWeChatHTML, copyToWeChat };

