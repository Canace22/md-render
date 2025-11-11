import { useState, useEffect, useRef } from 'react';
import { MarkdownParser, MarkdownRenderer } from '../core';
import { copyToWeChat } from '../utils/wechatCopy';
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

  const handleCopyToWeChat = async () => {
    if (!html) {
      alert('没有可复制的内容');
      return;
    }

    try {
      await copyToWeChat(html, { buttonId: 'copy-wechat-btn' });
    } catch (error) {
      alert('复制失败，请手动复制');
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
            onClick={handleCopyToWeChat}
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

