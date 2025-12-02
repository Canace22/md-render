import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownParser, MarkdownRenderer } from '../core';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import { copyToWeChat } from '../utils/wechatCopy';
import '../styles/styles.css';

const STORAGE_KEY = 'md-renderer-workspace';
const DEFAULT_FILE_ID = 'file-default';

const DEFAULT_MARKDOWN = `# 欢迎使用 Markdown 渲染器

这是一个支持 CommonMark 规范的 Markdown 渲染器示例。

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

![22](https://Canace22.github.io/picx-images-hosting/22.6ikg63uj2n.webp)

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

const createId = (prefix) => {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
};

const createDefaultWorkspace = () => ({
  id: 'root',
  name: '工作区',
  type: 'folder',
  children: [
    {
      id: DEFAULT_FILE_ID,
      type: 'file',
      name: '示例文档.md',
      content: DEFAULT_MARKDOWN,
    },
  ],
});

const findNodeById = (node, targetId) => {
  if (!node) return null;
  if (node.id === targetId) return node;

  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findNodeById(child, targetId);
      if (result) return result;
    }
  }
  return null;
};

const findParentId = (node, targetId, parentId = null) => {
  if (!node) return null;
  if (node.id === targetId) return parentId;

  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findParentId(child, targetId, node.id);
      if (result) return result;
    }
  }
  return null;
};

const findFirstFileId = (node) => {
  if (!node) return null;
  if (node.type === 'file') return node.id;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findFirstFileId(child);
      if (result) return result;
    }
  }
  return null;
};

const updateNodeById = (node, targetId, updater) => {
  if (!node) return node;
  if (node.id === targetId) {
    return updater(node);
  }

  if (node.type === 'folder' && Array.isArray(node.children)) {
    let changed = false;
    const nextChildren = node.children.map((child) => {
      const updatedChild = updateNodeById(child, targetId, updater);
      if (updatedChild !== child) {
        changed = true;
      }
      return updatedChild;
    });
    if (changed) {
      return { ...node, children: nextChildren };
    }
  }

  return node;
};

const removeNodeById = (node, targetId) => {
  if (!node || node.id === targetId) {
    return { node, removed: node?.id === targetId };
  }

  if (node.type !== 'folder' || !Array.isArray(node.children)) {
    return { node, removed: false };
  }

  let removed = false;
  const nextChildren = node.children
    .map((child) => {
      if (child.id === targetId) {
        removed = true;
        return null;
      }
      const result = removeNodeById(child, targetId);
      if (result.removed) {
        removed = true;
      }
      return result.node;
    })
    .filter(Boolean);

  if (removed) {
    return { node: { ...node, children: nextChildren }, removed: true };
  }

  return { node, removed: false };
};

const nameExists = (node, name) => {
  if (!node) return false;
  if (node.name === name) return true;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    return node.children.some((child) => nameExists(child, name));
  }
  return false;
};

const buildUniqueName = (workspace, baseName, extension = '') => {
  let candidate = `${baseName}${extension}`;
  let index = 1;
  while (nameExists(workspace, candidate)) {
    candidate = `${baseName} ${index}${extension}`;
    index += 1;
  }
  return candidate;
};

const addChildNode = (node, folderId, childNode) => {
  if (!node) return node;
  if (node.id === folderId && node.type === 'folder') {
    const children = Array.isArray(node.children) ? node.children : [];
    return {
      ...node,
      children: [...children, childNode],
    };
  }

  if (node.type === 'folder' && Array.isArray(node.children)) {
    let changed = false;
    const nextChildren = node.children.map((child) => {
      const updatedChild = addChildNode(child, folderId, childNode);
      if (updatedChild !== child) {
        changed = true;
      }
      return updatedChild;
    });
    if (changed) {
      return { ...node, children: nextChildren };
    }
  }

  return node;
};

const resolveTargetFolderId = (workspace, selectedId) => {
  if (!workspace) return null;
  if (!selectedId) return workspace.id;

  const selectedNode = findNodeById(workspace, selectedId);
  if (!selectedNode) return workspace.id;

  if (selectedNode.type === 'folder') {
    return selectedNode.id;
  }

  const parentId = findParentId(workspace, selectedId);
  return parentId ?? workspace.id;
};

function MarkdownEditor() {
  const [workspace, setWorkspace] = useState(() => createDefaultWorkspace());
  const [selectedId, setSelectedId] = useState(DEFAULT_FILE_ID);
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [html, setHtml] = useState('');
  const outputRef = useRef(null);
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const saveTimerRef = useRef(null);

  const selectedFile = useMemo(() => {
    const node = findNodeById(workspace, selectedId);
    return node?.type === 'file' ? node : null;
  }, [workspace, selectedId]);

  const persistWorkspace = (nextWorkspace) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextWorkspace));
    } catch (err) {
      console.error('保存工作区失败:', err);
    }
  };

  const schedulePersist = (nextWorkspace) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      persistWorkspace(nextWorkspace);
    }, 500);
  };

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

  const copyCode = (button, codeContent) => {
    navigator.clipboard
      .writeText(codeContent)
      .then(() => {
        button.classList.add('copied');
        setTimeout(() => {
          button.classList.remove('copied');
        }, 2000);
      })
      .catch((err) => {
        console.error('复制失败:', err);
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
        } catch (err2) {
          console.error('降级复制也失败:', err2);
        }
        document.body.removeChild(textArea);
      });
  };

  const bindCopyButtons = () => {
    if (!outputRef.current) return;
    const copyButtons = outputRef.current.querySelectorAll('.code-copy-btn');
    copyButtons.forEach((button) => {
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      const codeBlock = newButton.closest('.code-block');
      const encodedContent = codeBlock.getAttribute('data-code');
      const codeContent = decodeURIComponent(encodedContent);
      newButton.addEventListener('click', () => {
        copyCode(newButton, codeContent);
      });
    });
  };

  const updatePreview = (nextMarkdown) => {
    const tokens = parserRef.current.parse(nextMarkdown);
    const htmlString = rendererRef.current.render(tokens);
    setHtml(htmlString);
  };

  const handleMarkdownChange = (value) => {
    setMarkdown(value);
    setWorkspace((prev) => {
      const updated = updateNodeById(prev, selectedId, (node) => {
        if (node.type !== 'file') {
          return node;
        }
        return {
          ...node,
          content: value,
        };
      });
      schedulePersist(updated);
      return updated;
    });
    updatePreview(value);
  };

  const handleSelect = (nodeId) => {
    setSelectedId(nodeId);
  };

  const handleAddFile = () => {
    const fileId = createId('file');
    setWorkspace((prev) => {
      const name = buildUniqueName(prev, '未命名', '.md');
      const newFile = {
        id: fileId,
        type: 'file',
        name,
        content: '',
      };
      const targetFolderId = resolveTargetFolderId(prev, selectedId);
      const nextWorkspace = addChildNode(prev, targetFolderId, newFile);
      schedulePersist(nextWorkspace);
      return nextWorkspace;
    });
    setSelectedId(fileId);
    setMarkdown('');
    updatePreview('');
  };

  const handleAddFolder = () => {
    const folderId = createId('folder');
    setWorkspace((prev) => {
      const folderName = buildUniqueName(prev, '新建文件夹');
      const newFolder = {
        id: folderId,
        type: 'folder',
        name: folderName,
        children: [],
      };
      const targetFolderId = resolveTargetFolderId(prev, selectedId);
      const nextWorkspace = addChildNode(prev, targetFolderId, newFolder);
      schedulePersist(nextWorkspace);
      return nextWorkspace;
    });
  };

  const handleRename = () => {
    const node = findNodeById(workspace, selectedId);
    if (!node) return;
    const nextName = window.prompt('请输入新名称', node.name);
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;
    if (nameExists(workspace, trimmed) && trimmed !== node.name) {
      alert('名称已存在，请换一个。');
      return;
    }
    setWorkspace((prev) => {
      const updated = updateNodeById(prev, selectedId, (current) => ({
        ...current,
        name: trimmed,
      }));
      schedulePersist(updated);
      return updated;
    });
  };

  const handleDelete = () => {
    if (selectedId === 'root') {
      alert('根目录不能删除');
      return;
    }
    const node = findNodeById(workspace, selectedId);
    if (!node) return;
    const isFolder = node.type === 'folder';
    const confirmed = window.confirm(
      `确定删除${isFolder ? '文件夹及其全部内容' : '文件'}「${node.name}」吗？`,
    );
    if (!confirmed) return;

    setWorkspace((prev) => {
      const result = removeNodeById(prev, selectedId);
      if (!result.removed) {
        return prev;
      }
      const nextWorkspace = result.node;
      const nextFileId = findFirstFileId(nextWorkspace);
      schedulePersist(nextWorkspace);
      setSelectedId(nextFileId ?? nextWorkspace.id);
      return nextWorkspace;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        updatePreview(DEFAULT_MARKDOWN);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        updatePreview(DEFAULT_MARKDOWN);
        return;
      }
      setWorkspace(parsed);
      const initialFileId = findFirstFileId(parsed) ?? DEFAULT_FILE_ID;
      setSelectedId(initialFileId);
      const node = findNodeById(parsed, initialFileId);
      if (node?.type === 'file') {
        setMarkdown(node.content ?? '');
        updatePreview(node.content ?? '');
      } else {
        setMarkdown('');
        updatePreview('');
      }
    } catch (err) {
      console.error('读取工作区失败，使用默认内容:', err);
      setWorkspace(createDefaultWorkspace());
      setSelectedId(DEFAULT_FILE_ID);
      setMarkdown(DEFAULT_MARKDOWN);
      updatePreview(DEFAULT_MARKDOWN);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedFile && selectedFile.content !== markdown) {
      setMarkdown(selectedFile.content);
      updatePreview(selectedFile.content);
    }
    if (!selectedFile) {
      const firstFileId = findFirstFileId(workspace);
      if (firstFileId) {
        setSelectedId(firstFileId);
      }
    }
  }, [selectedFile, workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!outputRef.current) return;
    if (window.hljs) {
      window.hljs.highlightAll();
    }
    // 初始化并渲染 Mermaid 图表
    if (window.mermaid && outputRef.current.querySelector('.mermaid')) {
      try {
        // 仅初始化一次全局配置
        if (!window.__mermaidInitialized) {
          window.mermaid.initialize({
            startOnLoad: false,
            theme: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'default',
            securityLevel: 'loose'
          });
          window.__mermaidInitialized = true;
        }
        // 仅对当前容器内的 mermaid 节点进行渲染
        window.mermaid.run({
          querySelector: '#markdown-output .mermaid'
        });
      } catch (e) {
        console.error('Mermaid 渲染失败:', e);
      }
    }
    // 增强 Mermaid：增加全屏查看按钮与事件
    const enhanceMermaid = () => {
      if (!outputRef.current) return;
      const mermaidNodes = outputRef.current.querySelectorAll('.mermaid');
      mermaidNodes.forEach((node) => {
        // 避免重复包装
        const wrapper = node.closest('.mermaid-figure');
        if (wrapper) return;
        const container = document.createElement('div');
        container.className = 'mermaid-figure';
        node.parentNode.insertBefore(container, node);
        container.appendChild(node);

        const actions = document.createElement('div');
        actions.className = 'mermaid-actions';
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.type = 'button';
        fullscreenBtn.className = 'mermaid-fullscreen-btn';
        fullscreenBtn.title = '全屏预览';
        fullscreenBtn.setAttribute('aria-label', '全屏预览');
        fullscreenBtn.innerHTML = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path d="M7 3H3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 3H21V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 17V21H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7 21H3V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'mermaid-copy-btn';
        copyBtn.title = '复制图表';
        copyBtn.setAttribute('aria-label', '复制图表');
        copyBtn.innerHTML = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path d="M9 9H19C20.1046 9 21 9.89543 21 11V19C21 20.1046 20.1046 21 19 21H11C9.89543 21 9 20.1046 9 19V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 3H5C3.89543 3 3 3.89543 3 5V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        actions.appendChild(copyBtn);
        actions.appendChild(fullscreenBtn);
        container.appendChild(actions);

        const copyMermaid = async () => {
          try {
            // 找到已渲染的 SVG
            const svg = node.querySelector('svg');
            if (!svg) {
              // 若未渲染成功，尝试复制 DSL 文本
              await navigator.clipboard.writeText(node.textContent || '');
              return;
            }
            // 先尝试复制 PNG 图片到剪贴板（新浏览器）
            const serializer = new XMLSerializer();
            const svgString = serializer.serializeToString(svg);
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            // 设定白色/深色背景下的底色画布
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const bgColor = prefersDark ? '#1e1e1e' : '#ffffff';
            await new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              img.src = url;
            });
            const canvas = document.createElement('canvas');
            const width = img.naturalWidth || 1200;
            const height = img.naturalHeight || 800;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (pngBlob && navigator.clipboard && window.ClipboardItem) {
              try {
                await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
                return; // 复制 PNG 成功
              } catch (_) {
                // 回退复制 SVG 文本
              }
            }
            // 回退：复制 SVG 文本
            await navigator.clipboard.writeText(svgString);
          } catch (err) {
            console.error('复制 Mermaid 图表失败:', err);
            // 最后回退：复制 DSL 文本
            try {
              await navigator.clipboard.writeText(node.textContent || '');
            } catch {}
          }
        };

        const openFullscreen = () => {
          // 创建/复用全屏遮罩
          let backdrop = document.getElementById('mermaid-fullscreen-backdrop');
          if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'mermaid-fullscreen-backdrop';
            backdrop.className = 'mermaid-fullscreen-backdrop';
            backdrop.innerHTML = `
  <div class="mermaid-fullscreen-toolbar">
    <button type="button" class="mermaid-fullscreen-close" title="关闭" aria-label="关闭">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
  <div class="mermaid-fullscreen-content"></div>
`;
            document.body.appendChild(backdrop);
          }
          const content = backdrop.querySelector('.mermaid-fullscreen-content');
          content.innerHTML = '';
          // 克隆当前图表的 SVG/内容
          const clone = node.cloneNode(true);
          content.appendChild(clone);

          const onKeyDown = (evt) => {
            if (evt.key === 'Escape') {
              closeFullscreen();
            }
          };
          const closeBtn = backdrop.querySelector('.mermaid-fullscreen-close');
          const closeFullscreen = () => {
            backdrop.classList.remove('visible');
            document.removeEventListener('keydown', onKeyDown);
          };
          // 绑定一次性事件
          closeBtn.onclick = closeFullscreen;
          backdrop.onclick = (e) => {
            if (e.target === backdrop) {
              closeFullscreen();
            }
          };
          document.addEventListener('keydown', onKeyDown);

          // 展示
          backdrop.classList.add('visible');
        };

        copyBtn.addEventListener('click', copyMermaid);
        fullscreenBtn.addEventListener('click', openFullscreen);
      });
    };
    enhanceMermaid();
    bindCopyButtons();
  }, [html]);

  return (
    <div className="container">
      <WorkspaceSidebar
        workspace={workspace}
        selectedId={selectedId}
        onSelect={handleSelect}
        onAddFile={handleAddFile}
        onAddFolder={handleAddFolder}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <div className="editor-panel">
        <div className="panel-header">
          <h2>Markdown 输入</h2>
        </div>
        <div className="panel-body">
          <textarea
            id="markdown-input"
            placeholder="在这里输入 Markdown 文本..."
            value={markdown}
            onChange={(e) => handleMarkdownChange(e.target.value)}
          />
        </div>
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
        <div className="panel-body">
          <div id="markdown-output" ref={outputRef} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

export default MarkdownEditor;

