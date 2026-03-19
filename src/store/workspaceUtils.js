/**
 * 工作区树结构工具函数（纯函数）
 */

const DEFAULT_FILE_ID = 'file-default';

export const createId = (prefix) => {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
};

export const createDefaultWorkspace = () => ({
  id: 'root',
  name: '工作区',
  type: 'folder',
  children: [
    {
      id: DEFAULT_FILE_ID,
      type: 'file',
      name: '示例文档.md',
      content: getDefaultMarkdown(),
    },
  ],
});

export function getDefaultMarkdown() {
  return `# 欢迎使用 Markdown 渲染器

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
}

export { DEFAULT_FILE_ID };

export function findNodeById(node, targetId) {
  if (!node) return null;
  if (node.id === targetId) return node;

  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findNodeById(child, targetId);
      if (result) return result;
    }
  }
  return null;
}

export function findParentId(node, targetId, parentId = null) {
  if (!node) return null;
  if (node.id === targetId) return parentId;

  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findParentId(child, targetId, node.id);
      if (result) return result;
    }
  }
  return null;
}

export function findFirstFileId(node) {
  if (!node) return null;
  if (node.type === 'file') return node.id;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findFirstFileId(child);
      if (result) return result;
    }
  }
  return null;
}

export function updateNodeById(node, targetId, updater) {
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
}

export function removeNodeById(node, targetId) {
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
}

export function nameExists(node, name) {
  if (!node) return false;
  if (node.name === name) return true;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    return node.children.some((child) => nameExists(child, name));
  }
  return false;
}

export function buildUniqueName(workspace, baseName, extension = '') {
  let candidate = `${baseName}${extension}`;
  let index = 1;
  while (nameExists(workspace, candidate)) {
    candidate = `${baseName} ${index}${extension}`;
    index += 1;
  }
  return candidate;
}

export function addChildNode(node, folderId, childNode) {
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
}

export function resolveTargetFolderId(workspace, selectedId) {
  if (!workspace) return null;
  if (!selectedId) return workspace.id;

  const selectedNode = findNodeById(workspace, selectedId);
  if (!selectedNode) return workspace.id;

  if (selectedNode.type === 'folder') {
    return selectedNode.id;
  }

  const parentId = findParentId(workspace, selectedId);
  return parentId ?? workspace.id;
}
