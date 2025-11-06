import { useState, useEffect, useRef } from 'react';
import { MarkdownParser, MarkdownRenderer } from '../core';
import '../styles/styles.css';

const DEFAULT_MARKDOWN = `# 欢迎使用 Markdown 渲染器

这是一个支持 CommonMark 规范的 Markdown 渲染器示例。

![22](https://Canace22.github.io/picx-images-hosting/22.6ikg63uj2n.webp)

## 功能特性

- 支持标题
- 支持列表（有序和无序）
- 支持嵌套列表
- 支持代码块（语法高亮）
- 支持行内代码
- 支持链接和强调
- 支持删除线
- 支持图片
- 支持表格
- 支持多行引用

### 示例代码

\`\`\`javascript
function hello() {
    console.log('Hello, Markdown!');
}
\`\`\`

### 示例链接

访问 [GitHub](https://github.com "点击访问 GitHub") 了解更多。

**粗体文本**、*斜体文本* 和 ~~删除线~~

### 示例图片

![Markdown Logo](https://via.placeholder.com/400x100?text=Markdown+Renderer "Markdown 渲染器")

### 多行引用示例

> 第一行引用
> 
> 第二行引用
> 
> 引用中可以包含**粗体**和*斜体*

### 表格示例

| 功能 | 状态 | 说明 |
|------|------|------|
| 标题 | ✅ | 支持 H1-H6 |
| 列表 | ✅ | 有序和无序列表 |
| 代码块 | ✅ | 支持语法高亮 |
| 表格 | ✅ | GFM 表格支持 |
| 图片 | ✅ | 支持 alt 和 title |

### 嵌套列表示例

- 列表项 1
- 列表项 2
  - 嵌套列表项 1
  - 嵌套列表项 2
    - 三级嵌套列表项
    - 另一个三级项
- 列表项 3
  1. 嵌套有序列表
  2. 第二个有序项`;

function MarkdownEditor() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [html, setHtml] = useState('');
  const outputRef = useRef(null);
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());

  /**
   * 将 HTML 转换为微信公众号兼容格式
   * 微信公众号支持的格式要求：
   * 1. 移除代码块的 figure 和 code-header，只保留 pre>code 结构
   * 2. 使用原始代码内容（从 data-code 属性获取），避免语法高亮标记
   * 3. 移除所有 class 属性中的语法高亮类
   * 4. 确保图片链接是 HTTPS
   * 5. 移除不支持的标签和属性
   */
  /**
   * 将 HTML 转换为微信公众号兼容格式（优化版 - 紧凑排版）
   * 微信公众号编辑器最佳排版规范：
   * 1. 段落间距：5px（紧凑）
   * 2. 标题间距：上间距稍大（12-16px），下间距小（4-6px）
   * 3. 列表间距：紧凑，列表项行高 1.6
   * 4. 代码块/图片/表格/引用块：前后间距 8px
   * 5. 空行处理：移除多余的连续空行
   */
  const convertToWeChatHTML = (htmlString) => {
    // 创建一个临时 DOM 容器来处理 HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;

    // 处理代码块：紧凑样式
    const codeBlocks = tempDiv.querySelectorAll('figure.code-block');
    codeBlocks.forEach((figure) => {
      // 优先从 data-code 属性获取原始代码内容
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

      // 创建新的 pre 结构，紧凑样式
      const newPre = document.createElement('pre');
      newPre.setAttribute('style', 
        'padding: 0; ' +
        'overflow: auto; ' +
        'margin: 8px 0; ' +
        'font-family: "Consolas", "Monaco", "Courier New", monospace; ' +
        'font-size: 14px; ' +
        'line-height: 1.5; ' +
        'word-wrap: normal;'
      );
      
      const newCode = document.createElement('code');
      newCode.setAttribute('style', 
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
      
      // 替换整个 figure
      figure.parentNode?.replaceChild(newPre, figure);
    });

    // 处理行内代码：简洁样式
    const inlineCodes = tempDiv.querySelectorAll('code:not(pre code)');
    inlineCodes.forEach((code) => {
      if (!code.closest('pre')) {
        code.setAttribute('style', 
          'padding: 0; ' +
          'margin: 0; ' +
          'font-size: inherit; ' +
          'font-family: "Consolas", "Monaco", "Courier New", monospace;'
        );
      }
    });

    // 处理图片：居中、紧凑间距
    const images = tempDiv.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('http://')) {
        img.setAttribute('src', src.replace('http://', 'https://'));
      }
      img.setAttribute('style', 
        'max-width: 100%; ' +
        'height: auto; ' +
        'display: block; ' +
        'margin: 8px auto; ' +
        'border-radius: 4px;'
      );
    });

    // 处理表格：紧凑间距
    const tables = tempDiv.querySelectorAll('table');
    tables.forEach((table) => {
      table.setAttribute('style', 
        'border-collapse: collapse; ' +
        'border-spacing: 0; ' +
        'width: 100%; ' +
        'margin: 8px 0;'
      );
      
      const ths = table.querySelectorAll('th');
      ths.forEach((th) => {
        th.setAttribute('style', 
          'border: 1px solid #dfe2e5; ' +
          'padding: 6px 13px; ' +
          'font-weight: 600;'
        );
      });
      
      const tds = table.querySelectorAll('td');
      tds.forEach((td) => {
        td.setAttribute('style', 
          'border: 1px solid #dfe2e5; ' +
          'padding: 6px 13px;'
        );
      });
    });

    // 处理引用块：紧凑间距
    const blockquotes = tempDiv.querySelectorAll('blockquote');
    blockquotes.forEach((blockquote) => {
      blockquote.setAttribute('style', 
        'padding: 0 1em; ' +
        'border-left: 0.25em solid #dfe2e5; ' +
        'margin: 8px 0;'
      );
    });

    // 处理标题：优化间距（上间距稍大，下间距小）
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
      const tag = heading.tagName.toLowerCase();
      if (tag === 'h1') {
        heading.setAttribute('style', 
          'font-size: 2em; ' +
          'font-weight: 600; ' +
          'margin-top: 16px; ' +
          'margin-bottom: 6px;'
        );
      } else if (tag === 'h2') {
        heading.setAttribute('style', 
          'font-size: 1.5em; ' +
          'font-weight: 600; ' +
          'margin-top: 14px; ' +
          'margin-bottom: 5px; ' +
          'border-bottom: 1px solid #eaecef; ' +
          'padding-bottom: 0.3em;'
        );
      } else if (tag === 'h3') {
        heading.setAttribute('style', 
          'font-size: 1.25em; ' +
          'font-weight: 600; ' +
          'margin-top: 12px; ' +
          'margin-bottom: 4px;'
        );
      } else {
        heading.setAttribute('style', 
          'font-weight: 600; ' +
          'margin-top: 10px; ' +
          'margin-bottom: 4px;'
        );
      }
    });

    // 处理段落：紧凑间距
    const paragraphs = tempDiv.querySelectorAll('p');
    paragraphs.forEach((p) => {
      p.setAttribute('style', 'margin-top: 0; margin-bottom: 5px;');
    });

    // 处理列表：紧凑间距，优化列表项行高
    const lists = tempDiv.querySelectorAll('ul, ol');
    lists.forEach((list) => {
      list.setAttribute('style', 
        'padding-left: 2em; ' +
        'margin-top: 0; ' +
        'margin-bottom: 5px;'
      );
    });

    // 处理列表项：优化行高
    const listItems = tempDiv.querySelectorAll('li');
    listItems.forEach((li) => {
      li.setAttribute('style', 'line-height: 1.6; margin: 0;');
    });

    // 处理链接：蓝色、无下划线
    const links = tempDiv.querySelectorAll('a');
    links.forEach((link) => {
      link.setAttribute('style', 'color: #0366d6; text-decoration: none;');
    });

    // 处理分割线：紧凑间距
    const hrs = tempDiv.querySelectorAll('hr');
    hrs.forEach((hr) => {
      hr.setAttribute('style', 
        'border: none; ' +
        'border-top: 1px solid #eaecef; ' +
        'margin: 8px 0;'
      );
    });

    // 处理空行：移除多余的连续 <br> 标签
    // 策略：移除所有连续的 br，只保留单个 br（如果前后都是块级元素则完全移除）
    const allBrNodes = Array.from(tempDiv.querySelectorAll('br'));
    
    // 定义块级元素列表
    const blockElements = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
                          'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 
                          'HR', 'FIGURE', 'ARTICLE', 'SECTION', 'HEADER', 'FOOTER'];
    
    // 检查节点是否为块级元素
    const isBlockElement = (node) => {
      if (!node) return false;
      if (node.nodeType === Node.ELEMENT_NODE) {
        return blockElements.includes(node.tagName);
      }
      return false;
    };
    
    // 检查 br 的前一个兄弟节点
    const getPreviousSibling = (node) => {
      let prev = node.previousSibling;
      while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim()) {
        prev = prev.previousSibling;
      }
      return prev;
    };
    
    // 检查 br 的后一个兄弟节点
    const getNextSibling = (node) => {
      let next = node.nextSibling;
      while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) {
        next = next.nextSibling;
      }
      return next;
    };
    
    // 处理每个 br 标签
    allBrNodes.forEach((br) => {
      const prevSibling = getPreviousSibling(br);
      const nextSibling = getNextSibling(br);
      
      // 如果前后都是块级元素，直接移除 br（块级元素之间不需要 br）
      if (isBlockElement(prevSibling) && isBlockElement(nextSibling)) {
        br.parentNode?.removeChild(br);
        return;
      }
      
      // 如果前一个兄弟节点也是 br，移除当前 br（避免连续空行）
      if (prevSibling && prevSibling.nodeName === 'BR') {
        br.parentNode?.removeChild(br);
        return;
      }
      
      // 如果 br 前后都是空白文本节点，也移除
      if ((!prevSibling || (prevSibling.nodeType === Node.TEXT_NODE && !prevSibling.textContent.trim())) &&
          (!nextSibling || (nextSibling.nodeType === Node.TEXT_NODE && !nextSibling.textContent.trim()))) {
        br.parentNode?.removeChild(br);
      }
    });

    // 移除所有 data-* 属性和 class 属性
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith('data-') || attr.name === 'class') {
          el.removeAttribute(attr.name);
        }
      });
    });

    // 返回处理后的 HTML
    return tempDiv.innerHTML;
  };

  /**
   * 复制到微信公众号格式（参照 mdnice 的复制方式）
   * 使用 DOM 选择复制，保留 HTML 格式
   */
  const copyToWeChat = async () => {
    if (!html) {
      alert('没有可复制的内容');
      return;
    }

    try {
      const wechatHTML = convertToWeChatHTML(html);

      console.log('wechatHTML', wechatHTML);
      // 创建一个临时的 div 元素来设置 HTML 内容到剪贴板
      // 参照 mdnice：使用 DOM 选择复制，这样可以保留 HTML 格式
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.innerHTML = wechatHTML;
      document.body.appendChild(tempDiv);
      
      // 选择所有内容
      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // 复制
      try {
        document.execCommand('copy');
        selection.removeAllRanges();
      } catch (e) {
        // 如果 execCommand 失败，使用 Clipboard API
        await navigator.clipboard.writeText(wechatHTML);
      }
      
      document.body.removeChild(tempDiv);
      
      // 显示成功提示
      const button = document.getElementById('copy-wechat-btn');
      if (button) {
        const originalText = button.textContent;
        button.textContent = '已复制！';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('copied');
        }, 2000);
      }
    } catch (err) {
      console.error('复制失败:', err);
      // 最后降级方案：使用 textarea
      try {
        const wechatHTML = convertToWeChatHTML(html);
        const textArea = document.createElement('textarea');
        textArea.value = wechatHTML;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        const button = document.getElementById('copy-wechat-btn');
        if (button) {
          const originalText = button.textContent;
          button.textContent = '已复制！';
          button.classList.add('copied');
          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        }
      } catch (err2) {
        console.error('降级复制也失败:', err2);
        alert('复制失败，请手动复制');
      }
    }
  };

  /**
   * 复制代码到剪贴板
   */
  const copyCode = (button, codeContent) => {
    navigator.clipboard.writeText(codeContent).then(() => {
      button.classList.add('copied');
      setTimeout(() => {
        button.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('复制失败:', err);
      // 降级方案：使用传统方法
      const textArea = document.createElement('textarea');
      textArea.value = codeContent;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        button.classList.add('copied');
        setTimeout(() => {
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('降级复制也失败:', err);
      }
      document.body.removeChild(textArea);
    });
  };

  /**
   * 绑定复制按钮事件
   */
  const bindCopyButtons = () => {
    if (!outputRef.current) return;
    
    const copyButtons = outputRef.current.querySelectorAll('.code-copy-btn');
    copyButtons.forEach(button => {
      // 移除已有的事件监听器（避免重复绑定）
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      // 获取代码内容
      const codeBlock = newButton.closest('.code-block');
      const encodedContent = codeBlock.getAttribute('data-code');
      const codeContent = decodeURIComponent(encodedContent);
      
      // 绑定点击事件
      newButton.addEventListener('click', () => {
        copyCode(newButton, codeContent);
      });
    });
  };

  /**
   * 更新渲染结果
   */
  const updatePreview = () => {
    const tokens = parserRef.current.parse(markdown);
    const htmlString = rendererRef.current.render(tokens);
    console.log('tokens', tokens);

    setHtml(htmlString);
  };

  // 监听 markdown 变化，更新预览
  useEffect(() => {
    updatePreview();
  }, [markdown]);

  // 渲染完成后，执行代码高亮和绑定复制按钮
  useEffect(() => {
    if (!outputRef.current) return;

    // 代码高亮
    if (window.hljs) {
      window.hljs.highlightAll();
    }

    // 绑定复制按钮事件
    bindCopyButtons();
  }, [html]);

  return (
    <div className="container">
      <div className="editor-panel">
        <div className="panel-header">
          <h2>Markdown 输入</h2>
        </div>
        <textarea
          id="markdown-input"
          placeholder="在这里输入 Markdown 文本..."
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
        />
      </div>
      <div className="preview-panel">
        <div className="panel-header">
          <h2>渲染预览</h2>
          <button 
            id="copy-wechat-btn" 
            className="copy-wechat-btn"
            onClick={copyToWeChat}
            title="复制为微信公众号格式"
          >
            复制到微信公众号
          </button>
        </div>
        <div
          id="markdown-output"
          ref={outputRef}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

export default MarkdownEditor;

