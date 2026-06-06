/**
 * 工作区树结构工具函数（纯函数）
 */

const DEFAULT_FILE_ID = 'file-default';
const DEFAULT_NODE_TYPE = 'document';

export const KNOWLEDGE_NODE_TYPE_OPTIONS = [
  { value: 'concept', label: '概念' },
  { value: 'method', label: '方法' },
  { value: 'tech', label: '技术' },
  { value: 'component', label: '组件' },
  { value: 'document', label: '文档' },
  { value: 'bookmark', label: '书签' },
];

export const createId = (prefix) => {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
};

export const sanitizeStringList = (values) => {
  return Array.from(
    new Set((values ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)),
  );
};

export const normalizeNodeType = (nodeType) => {
  return KNOWLEDGE_NODE_TYPE_OPTIONS.some((item) => item.value === nodeType)
    ? nodeType
    : DEFAULT_NODE_TYPE;
};

export const createDefaultKnowledgeFields = (overrides = {}) => {
  return {
    nodeType: normalizeNodeType(overrides.nodeType),
    summary: String(overrides.summary ?? '').trim(),
    aliases: sanitizeStringList(overrides.aliases),
    relatedIds: sanitizeStringList(overrides.relatedIds),
  };
};

export const getKnowledgeNodeTypeLabel = (nodeType) => {
  return KNOWLEDGE_NODE_TYPE_OPTIONS.find((item) => item.value === normalizeNodeType(nodeType))?.label ?? '文档';
};

export const BOOKMARK_FOLDER_NAME = '书签';

/**
 * 创建一个书签节点（纯函数）。书签复用 file 节点，nodeType='bookmark' 且带 url 字段，
 * content 留空（只存链接，不抓正文），title/summary/tags 会进搜索与图谱。
 */
export const createBookmarkNode = ({ title, url, tags = [], summary = '', createdAt } = {}) => {
  const cleanUrl = String(url ?? '').trim();
  const ts = Number.isFinite(createdAt) ? createdAt : Date.now();
  const name = String(title ?? '').trim() || cleanUrl || '未命名书签';
  return {
    id: createId('bookmark'),
    type: 'file',
    name,
    url: cleanUrl,
    content: '',
    createdAt: ts,
    updatedAt: ts,
    tags: sanitizeStringList(tags),
    ...createDefaultKnowledgeFields({ nodeType: 'bookmark', summary }),
  };
};

export const getFileKnowledgeSearchText = (file) => {
  if (!file || file.type !== 'file') return '';
  return [
    file.name,
    file.content,
    file.summary,
    file.url,
    ...(file.aliases ?? []),
    ...(file.tags ?? []),
    getKnowledgeNodeTypeLabel(file.nodeType),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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
      ...createDefaultKnowledgeFields({
        summary: '示例文档，用来演示知识库里的 Markdown 内容结构。',
        aliases: ['示例'],
      }),
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

export function ensureKnowledgeFields(node) {
  if (!node) return node;

  if (node.type === 'file') {
    const nextKnowledge = createDefaultKnowledgeFields(node);
    const changed = node.nodeType !== nextKnowledge.nodeType
      || (node.summary ?? '') !== nextKnowledge.summary
      || JSON.stringify(node.aliases ?? []) !== JSON.stringify(nextKnowledge.aliases)
      || JSON.stringify(node.relatedIds ?? []) !== JSON.stringify(nextKnowledge.relatedIds);
    return changed ? { ...node, ...nextKnowledge } : node;
  }

  if (node.type === 'folder' && Array.isArray(node.children)) {
    let changed = false;
    const nextChildren = node.children.map((child) => {
      const next = ensureKnowledgeFields(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...node, children: nextChildren } : node;
  }

  return node;
}

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

export function buildUniqueNameInFolder(folder, baseName, extension = '') {
  const siblings = folder?.type === 'folder' ? (folder.children ?? []) : [];
  let candidate = `${baseName}${extension}`;
  let index = 1;
  const existsAmongSiblings = (name) => siblings.some((child) => child.name === name);
  while (existsAmongSiblings(candidate)) {
    candidate = `${baseName} ${index}${extension}`;
    index += 1;
  }
  return candidate;
}

export function nameExistsAmongSiblings(parent, name, excludeId = null) {
  const siblings = parent?.type === 'folder' ? (parent.children ?? []) : [];
  return siblings.some((child) => child.id !== excludeId && child.name === name);
}

export function replaceRelativePathBasename(relativePath, nextBaseName) {
  const parts = String(relativePath ?? '').split('/').filter(Boolean);
  if (parts.length === 0) return nextBaseName;
  parts[parts.length - 1] = nextBaseName;
  return parts.join('/');
}

export function ensureRenameFileName(inputName, oldFileName) {
  const trimmed = String(inputName ?? '').trim();
  if (!trimmed) return trimmed;
  const extMatch = String(oldFileName ?? '').match(/(\.[^./\\]+)$/);
  const ext = extMatch?.[1] ?? '';
  if (ext && !trimmed.toLowerCase().endsWith(ext.toLowerCase())) {
    return `${trimmed}${ext}`;
  }
  return trimmed;
}

export function remapDiskNodeAfterRename(node, oldRelativePath, newRelativePath, newName) {
  if (!node?.projectRootPath || !node.relativePath) return node;

  const nextRelativePath = node.relativePath === oldRelativePath
    ? newRelativePath
    : node.relativePath.startsWith(`${oldRelativePath}/`)
      ? `${newRelativePath}${node.relativePath.slice(oldRelativePath.length)}`
      : node.relativePath;

  const nextName = node.relativePath === oldRelativePath ? newName : node.name;
  const next = {
    ...node,
    name: nextName,
    relativePath: nextRelativePath,
    id: `project:${node.projectRootPath}:${node.type}:${nextRelativePath}`,
  };

  if (node.type === 'folder' && Array.isArray(node.children)) {
    next.children = node.children.map((child) => (
      remapDiskNodeAfterRename(child, oldRelativePath, newRelativePath, newName)
    ));
  }

  return next;
}

export function findNodeIdByRelativePath(node, relativePath) {
  if (!node) return null;
  if (node.relativePath === relativePath) return node.id;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNodeIdByRelativePath(child, relativePath);
      if (found) return found;
    }
  }
  return null;
}

const joinRelativePath = (parentRelativePath, name) => {
  if (!parentRelativePath) return name;
  return `${parentRelativePath}/${name}`;
};

export function findLocalProjectRoot(workspace) {
  if (!workspace) return null;
  if (workspace.localProjectRoot) return workspace;
  if (workspace.type !== 'folder' || !Array.isArray(workspace.children)) return null;
  for (const child of workspace.children) {
    const found = findLocalProjectRoot(child);
    if (found) return found;
  }
  return null;
}

export function findProjectsFolder(localProjectRoot) {
  if (!localProjectRoot || localProjectRoot.type !== 'folder') return null;
  return (localProjectRoot.children ?? []).find(
    (child) => child.type === 'folder' && (child.relativePath === 'Projects' || child.name === 'Projects'),
  ) ?? null;
}

export function stripLocalProjectMounts(workspace) {
  if (!workspace?.children) return workspace;
  return {
    ...workspace,
    children: workspace.children.filter((child) => !child.localProjectRoot),
  };
}

export function mergeProjectsChildren(workspace, projectsChildren) {
  if (!Array.isArray(projectsChildren) || projectsChildren.length === 0) return workspace;
  const existingIds = new Set((workspace.children ?? []).map((child) => child.id));
  const toAdd = projectsChildren.filter((child) => !existingIds.has(child.id));
  if (toAdd.length === 0) return workspace;
  return {
    ...workspace,
    children: [...(workspace.children ?? []), ...toAdd],
  };
}

/** 将磁盘扫描结果合并进工作区（更新内容、增删节点） */
export function syncProjectsChildrenFromDisk(workspace, projectRootPath, projectsChildren) {
  if (!workspace || !projectRootPath || !Array.isArray(projectsChildren)) return workspace;

  const freshById = new Map(projectsChildren.map((child) => [child.id, child]));
  const freshIds = new Set(freshById.keys());
  const children = workspace.children ?? [];

  const merged = children
    .filter((child) => child.projectRootPath !== projectRootPath || freshIds.has(child.id))
    .map((child) => {
      if (child.projectRootPath !== projectRootPath) return child;
      return freshById.get(child.id) ?? child;
    });

  const mergedIds = new Set(merged.map((child) => child.id));
  const added = projectsChildren.filter((child) => !mergedIds.has(child.id));

  return {
    ...workspace,
    children: [...merged, ...added],
  };
}

export function replaceLocalProjectMount(workspace, projectRootPath, freshRootNode) {
  if (!workspace?.children || !projectRootPath || !freshRootNode) return workspace;
  let changed = false;
  const children = workspace.children.map((child) => {
    if (child.localProjectRoot && child.projectRootPath === projectRootPath) {
      changed = true;
      return freshRootNode;
    }
    return child;
  });
  return changed ? { ...workspace, children } : workspace;
}

/** 收集当前工作区中需要监听的本地项目根路径 */
export function collectLocalProjectRootPaths(workspace, mdRenderRootPath = '') {
  const paths = new Set();
  if (mdRenderRootPath) paths.add(mdRenderRootPath);

  const visit = (node) => {
    if (!node) return;
    if (node.localProjectRoot && node.projectRootPath) {
      paths.add(node.projectRootPath);
    }
    if (node.type === 'folder' && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  visit(workspace);
  return [...paths];
}

/**
 * 解析磁盘新建目标：默认落在 MdRender/Projects，选中用户目录则在其下创建。
 */
export function resolveLocalProjectCreateTarget(workspace, contextNodeId, projectRootPath) {
  if (!projectRootPath || !workspace) return null;

  const folderId = resolveTargetFolderId(workspace, contextNodeId);
  const folder = findNodeById(workspace, folderId);

  if (folder?.projectRootPath === projectRootPath && folder.type === 'folder' && folder.id !== 'root') {
    return {
      parentFolderId: folder.id,
      projectRootPath,
      parentRelativePath: folder.relativePath ?? 'Projects',
      parentFolder: folder,
    };
  }

  const root = findNodeById(workspace, workspace.id) ?? workspace;
  return {
    parentFolderId: root.id,
    projectRootPath,
    parentRelativePath: 'Projects',
    parentFolder: root,
  };
}

export function createLocalProjectFileNode(projectRootPath, relativePath, name, content = '') {
  return {
    id: `project:${projectRootPath}:file:${relativePath}`,
    name,
    type: 'file',
    relativePath,
    projectRootPath,
    content,
    updatedAt: Date.now(),
    ...createDefaultKnowledgeFields(),
  };
}

export function createLocalProjectFolderNode(projectRootPath, relativePath, name) {
  return {
    id: `project:${projectRootPath}:folder:${relativePath}`,
    name,
    type: 'folder',
    relativePath,
    projectRootPath,
    children: [],
  };
}

export function addChildNode(node, folderId, childNode, prepend = false) {
  if (!node) return node;
  if (node.id === folderId && node.type === 'folder') {
    const children = Array.isArray(node.children) ? node.children : [];
    return {
      ...node,
      children: prepend ? [childNode, ...children] : [...children, childNode],
    };
  }

  if (node.type === 'folder' && Array.isArray(node.children)) {
    let changed = false;
    const nextChildren = node.children.map((child) => {
      const updatedChild = addChildNode(child, folderId, childNode, prepend);
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

/**
 * 将同一父文件夹内的 fromId 节点移动到 toId 节点的位置（同级重排）。
 * 置顶节点（pinned）始终保持在最前，拖拽排序在置顶区和非置顶区内各自生效。
 * 返回新的根节点（纯函数）。
 */
export function moveNodeInParent(root, fromId, toId) {
  if (!root || fromId === toId) return root;

  if (root.type === 'folder' && Array.isArray(root.children)) {
    const children = root.children;
    const fromIdx = children.findIndex((c) => c.id === fromId);
    const toIdx = children.findIndex((c) => c.id === toId);

    // 在当前层找到了 from 和 to，执行同级重排
    if (fromIdx !== -1 && toIdx !== -1) {
      const next = [...children];
      const [moved] = next.splice(fromIdx, 1);
      const insertAt = next.findIndex((c) => c.id === toId);
      next.splice(insertAt, 0, moved);
      return { ...root, children: next };
    }

    // 否则递归找子文件夹
    let changed = false;
    const nextChildren = children.map((child) => {
      const updated = moveNodeInParent(child, fromId, toId);
      if (updated !== child) changed = true;
      return updated;
    });
    if (changed) return { ...root, children: nextChildren };
  }

  return root;
}

/**
 * 切换节点的置顶状态（pinned 字段）。
 * 置顶节点会移到所在文件夹 children 的最前面；取消置顶时保持当前位置不变。
 */
export function togglePinNode(root, targetId) {
  if (!root) return root;

  if (root.type === 'folder' && Array.isArray(root.children)) {
    const idx = root.children.findIndex((c) => c.id === targetId);
    if (idx !== -1) {
      const target = root.children[idx];
      const nextPinned = !target.pinned;
      const updated = { ...target, pinned: nextPinned };
      let next = [...root.children];
      next[idx] = updated;
      // 置顶时把节点移到最前
      if (nextPinned) {
        next.splice(idx, 1);
        next.unshift(updated);
      }
      return { ...root, children: next };
    }

    let changed = false;
    const nextChildren = root.children.map((child) => {
      const updated = togglePinNode(child, targetId);
      if (updated !== child) changed = true;
      return updated;
    });
    if (changed) return { ...root, children: nextChildren };
  }

  return root;
}

/**
 * 按关键词过滤工作区树（纯函数）。
 * 命中规则：文件/文件夹名包含关键词，或文件正文包含关键词。
 * 命中文件会保留其所在的父文件夹路径，方便在树里看到上下文。
 * 关键词为空时原样返回。
 */
export function filterWorkspace(node, keyword) {
  const query = (keyword ?? '').trim().toLowerCase();
  if (!node) return null;
  if (!query) return node;

  const matchesSelf = (target) => {
    const name = (target.name ?? '').toLowerCase();
    if (name.includes(query)) return true;
    if (target.type === 'file') {
      return getFileKnowledgeSearchText(target).includes(query);
    }
    return false;
  };

  if (node.type === 'file') {
    return matchesSelf(node) ? node : null;
  }

  // folder：先递归过滤子节点，子节点有命中则保留该文件夹
  const children = Array.isArray(node.children) ? node.children : [];
  const filteredChildren = children
    .map((child) => filterWorkspace(child, query))
    .filter(Boolean);

  if (filteredChildren.length > 0 || matchesSelf(node)) {
    return { ...node, children: filteredChildren };
  }
  return null;
}

/**
 * 取文件夹的直接子节点（不递归），用于目录页展示。
 */
export function getFolderDirectChildren(folder) {
  if (!folder || folder.type !== 'folder') return [];
  return Array.isArray(folder.children) ? [...folder.children] : [];
}

/**
 * 目录页摘要文案（纯函数）：只统计直接子级。
 */
export function buildFolderChildSummary(children) {
  const list = Array.isArray(children) ? children : [];
  const folderCount = list.filter((item) => item.type === 'folder').length;
  const fileCount = list.filter((item) => item.type === 'file').length;
  const parts = [];
  if (folderCount > 0) parts.push(`${folderCount} 个文件夹`);
  if (fileCount > 0) parts.push(`${fileCount} 个文档`);
  if (parts.length === 0) return '空目录';
  return parts.join('，');
}

/**
 * 收集工作区里所有文件（纯函数），扁平成数组。
 */
export function collectFiles(node, acc = []) {
  if (!node) return acc;
  if (node.type === 'file') {
    acc.push(node);
  } else if (node.type === 'folder' && Array.isArray(node.children)) {
    node.children.forEach((child) => collectFiles(child, acc));
  }
  return acc;
}

/**
 * 取最近编辑的前 N 篇文件，按 updatedAt 倒序（纯函数）。
 * 没有 updatedAt 的老文件排在最后。
 */
export function collectRecentFiles(workspace, limit = 5) {
  const files = collectFiles(workspace).filter((f) => f.updatedAt);
  return files
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

/**
 * 给缺少 updatedAt 的老文件补初始时间戳（纯函数，返回新树）。
 * 用一个基准时间逐个递减，保证老笔记之间有稳定顺序、且都早于本次会话的新编辑。
 * 已有 updatedAt 的文件保持不变。
 */
export function ensureFileTimestamps(node, baseTime = Date.now()) {
  let counter = 0;
  const walk = (current) => {
    if (!current) return current;
    if (current.type === 'file') {
      if (current.updatedAt) return current;
      counter += 1;
      // 依次往前推 1 分钟，越靠前遍历到的越「新」一点
      return { ...current, updatedAt: baseTime - counter * 60000 };
    }
    if (current.type === 'folder' && Array.isArray(current.children)) {
      let changed = false;
      const nextChildren = current.children.map((child) => {
        const next = walk(child);
        if (next !== child) changed = true;
        return next;
      });
      // 没有任何子节点被补，则原样返回，便于上层判断是否需要落盘
      return changed ? { ...current, children: nextChildren } : current;
    }
    return current;
  };
  return walk(node);
}

/**
 * 收集工作区里所有用过的标签（纯函数），去重并按使用次数倒序。
 * 返回 [{ tag, count }]。
 */
export function collectTags(workspace) {
  const counts = new Map();
  collectFiles(workspace).forEach((file) => {
    (file.tags ?? []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * 按标签过滤工作区树（纯函数）：只保留带该标签的文件及其父文件夹路径。
 * tag 为空时原样返回。
 */
export function filterWorkspaceByTag(node, tag) {
  if (!node) return null;
  if (!tag) return node;

  if (node.type === 'file') {
    return (node.tags ?? []).includes(tag) ? node : null;
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const filteredChildren = children
    .map((child) => filterWorkspaceByTag(child, tag))
    .filter(Boolean);

  return filteredChildren.length > 0 ? { ...node, children: filteredChildren } : null;
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

/**
 * 外部渠道根目录的来源标签（纯函数）。
 * 仅标注从本地项目、Notion 等外部渠道挂载的顶层文件夹；本系统新建的目录返回 null。
 */
export function getFolderChannelLabel(node) {
  if (!node || node.type !== 'folder') return null;
  if (node.localProjectRoot) return '本地';
  if (node.notionSyncRoot) return 'Notion';
  return null;
}
