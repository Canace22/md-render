import { useState, useEffect, useRef } from 'react';
import { MarkdownParser } from '../parser.js';
import { MarkdownRenderer } from '../renderer.js';
import '../styles.css';

const DEFAULT_MARKDOWN = `# 欢迎使用 Markdown 渲染器

这是一个简单的 Markdown 渲染器示例。

## 功能特性

- 支持标题
- 支持列表
- 支持代码块
- 支持链接和强调

### 示例代码

\`\`\`javascript
function hello() {
    console.log('Hello, Markdown!');
}
\`\`\`

### 示例链接

访问 [GitHub](https://github.com) 了解更多。

**粗体文本** 和 *斜体文本*

> 这是一条引用

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

