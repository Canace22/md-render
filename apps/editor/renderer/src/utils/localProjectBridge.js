const LEGACY_PROJECT_PICK_CHANNEL = 'project:pick-folder';
const LEGACY_PROJECT_READ_CHANNEL = 'project:read-file';
const LEGACY_PROJECT_WRITE_CHANNEL = 'project:write-file';

const hasDirectBridge = () => {
  return typeof window !== 'undefined' && typeof window.electronAPI?.openLocalProject === 'function';
};

const hasMdRenderWorkspaceBridge = () => {
  return typeof window !== 'undefined' && typeof window.electronAPI?.ensureMdRenderWorkspace === 'function';
};

const hasLegacyBridge = () => {
  return typeof window !== 'undefined' && typeof window.electronAPI?.invoke === 'function';
};

const joinProjectPath = (rootPath, relativePath) => {
  const base = String(rootPath ?? '').replace(/[\\/]+$/, '');
  const rel = String(relativePath ?? '').replace(/^[\\/]+/, '');
  return `${base}/${rel}`;
};

const getPathBasename = (targetPath) => {
  const normalized = String(targetPath ?? '').replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  return segments.at(-1) ?? '';
};

const normalizeLegacyNode = async (node, rootPath) => {
  if (!node) return null;

  if (node.type === 'folder') {
    const isRoot = node.id === 'root';
    const children = [];
    for (const child of node.children ?? []) {
      const normalizedChild = await normalizeLegacyNode(child, rootPath);
      if (normalizedChild) {
        children.push(normalizedChild);
      }
    }

    return {
      id: isRoot ? 'root' : `folder:${node.id}`,
      name: isRoot ? (getPathBasename(rootPath) || node.name || '项目') : node.name,
      type: 'folder',
      relativePath: isRoot ? '' : node.id,
      children,
    };
  }

  const content = await window.electronAPI.invoke(LEGACY_PROJECT_READ_CHANNEL, node.diskPath);
  return {
    id: `file:${node.id}`,
    name: node.name,
    type: 'file',
    relativePath: node.id,
    content: typeof content === 'string' ? content : '',
    updatedAt: Date.now(),
  };
};

export function isLocalProjectSupported() {
  return hasDirectBridge() || hasLegacyBridge();
}

export async function openLocalProject() {
  if (hasDirectBridge()) {
    return window.electronAPI.openLocalProject();
  }

  if (!hasLegacyBridge()) {
    throw new Error('本地项目打开仅支持桌面版应用');
  }

  const result = await window.electronAPI.invoke(LEGACY_PROJECT_PICK_CHANNEL);
  if (!result || result.canceled || !result.workspace) {
    return { canceled: true };
  }

  const projectRootPath = result.rootPath ?? result.projectRootPath ?? '';
  const workspace = await normalizeLegacyNode(result.workspace, projectRootPath);
  return {
    canceled: false,
    projectRootPath,
    workspace,
  };
}

export async function saveLocalProjectFile(payload) {
  if (hasDirectBridge()) {
    return window.electronAPI.saveLocalProjectFile(payload);
  }

  if (!hasLegacyBridge()) {
    throw new Error('本地项目保存仅支持桌面版应用');
  }

  const filePath = joinProjectPath(payload?.projectRootPath, payload?.relativePath);
  return window.electronAPI.invoke(LEGACY_PROJECT_WRITE_CHANNEL, {
    filePath,
    content: payload?.content ?? '',
  });
}

export async function saveLocalProjectMetadata(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.saveLocalProjectMetadata === 'function') {
    return window.electronAPI.saveLocalProjectMetadata(payload);
  }
  return null;
}

export async function ensureMdRenderWorkspace() {
  if (!hasMdRenderWorkspaceBridge()) {
    return null;
  }
  return window.electronAPI.ensureMdRenderWorkspace();
}

export async function createLocalProjectFileOnDisk(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.createLocalProjectFile === 'function') {
    return window.electronAPI.createLocalProjectFile(payload);
  }
  throw new Error('本地新建文件仅支持桌面版应用');
}

export async function createLocalProjectFolderOnDisk(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.createLocalProjectFolder === 'function') {
    return window.electronAPI.createLocalProjectFolder(payload);
  }
  throw new Error('本地新建文件夹仅支持桌面版应用');
}

export async function renameLocalProjectEntryOnDisk(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.renameLocalProjectEntry === 'function') {
    return window.electronAPI.renameLocalProjectEntry(payload);
  }
  throw new Error('本地重命名仅支持桌面版应用');
}

export async function deleteLocalProjectEntryOnDisk(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.deleteLocalProjectEntry === 'function') {
    return window.electronAPI.deleteLocalProjectEntry(payload);
  }
  throw new Error('本地删除仅支持桌面版应用');
}

export async function registerLocalProjectWatch(projectRootPath) {
  if (hasDirectBridge() && typeof window.electronAPI.registerLocalProjectWatch === 'function') {
    return window.electronAPI.registerLocalProjectWatch({ projectRootPath });
  }
  return null;
}

export async function readLocalProjectDisk(projectRootPath, mode) {
  if (hasDirectBridge() && typeof window.electronAPI.readLocalProjectDisk === 'function') {
    return window.electronAPI.readLocalProjectDisk({ projectRootPath, mode });
  }
  return null;
}

export async function readLocalProjectFileContent(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.readLocalProjectFileContent === 'function') {
    const result = await window.electronAPI.readLocalProjectFileContent(payload);
    if (result?.ok === false) {
      throw new Error(result.error || '读取本地文件失败');
    }
    return result;
  }
  throw new Error('本地文件读取仅支持桌面版应用');
}

export async function revealLocalProjectEntry(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.revealLocalProjectEntry === 'function') {
    const result = await window.electronAPI.revealLocalProjectEntry(payload);
    if (result?.ok === false) {
      throw new Error(result.error || '在文件管理器中查看失败');
    }
    return result;
  }
  throw new Error('仅桌面版应用支持在文件管理器中查看');
}

export async function fetchBookmarkPageSnapshot(payload) {
  if (hasDirectBridge() && typeof window.electronAPI.fetchBookmarkPageSnapshot === 'function') {
    const result = await window.electronAPI.fetchBookmarkPageSnapshot(payload);
    if (result?.ok === false) {
      throw new Error(result.error || '网页抓取失败');
    }
    return result;
  }
  throw new Error('网页抓取仅支持桌面版应用');
}

export function onLocalProjectDiskChanged(callback) {
  if (hasDirectBridge() && typeof window.electronAPI.onLocalProjectDiskChanged === 'function') {
    return window.electronAPI.onLocalProjectDiskChanged(callback);
  }
  return () => {};
}
