/**
 * Web 端本地文件夹支持（File System Access API，Chrome/Edge）
 *
 * 与 Electron 的 localProject IPC 同构：openLocalProject 返回相同的
 * workspace 节点结构，save/create/rename/delete 接收相同 payload。
 * localProjectBridge 在非 Electron 环境下路由到这里。
 *
 * 目录句柄存 IndexedDB，刷新后可恢复（浏览器可能要求重新授权）。
 * projectRootPath 用合成标识 `webfs:<文件夹名>:<随机>`，不含真实路径。
 */

const DB_NAME = 'md-renderer-webfs';
const STORE_NAME = 'handles';
const ROOT_PREFIX = 'webfs:';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const SUPPORTED_FILE_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.html', '.htm', '.docx', '.xlsx', '.xls',
  '.csv', '.rst', '.org', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico',
  '.mp4', '.webm', '.ogg', '.mov', '.mp3', '.wav', '.flac', '.aac',
]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);
const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
};

// 运行期句柄注册表：rootPath → FileSystemDirectoryHandle
const rootHandles = new Map();

export function isWebFsSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function isWebFsRootPath(rootPath) {
  return String(rootPath ?? '').startsWith(ROOT_PREFIX);
}

// ── IndexedDB 持久化（句柄可结构化克隆） ──────────────────────────

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** 取根句柄：内存 → IndexedDB 恢复（必要时请求授权） */
async function getRootHandle(rootPath) {
  const cached = rootHandles.get(rootPath);
  if (cached) return cached;

  const stored = await idbGet(rootPath).catch(() => null);
  if (!stored) {
    throw new Error('本地文件夹句柄已失效，请重新打开文件夹');
  }
  let permission = await stored.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    permission = await stored.requestPermission({ mode: 'readwrite' });
  }
  if (permission !== 'granted') {
    throw new Error('浏览器未授权访问该文件夹，请重新打开文件夹');
  }
  rootHandles.set(rootPath, stored);
  return stored;
}

// ── 路径解析 ──────────────────────────────────────────────────────

const getExtension = (name) => {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
};

const isMarkdownFile = (name) => MARKDOWN_EXTENSIONS.has(getExtension(name));
const isSupportedFile = (name) => SUPPORTED_FILE_EXTENSIONS.has(getExtension(name));
const shouldIgnoreDirectory = (name) => name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(name);

const splitRelativePath = (relativePath) => {
  const segments = String(relativePath ?? '').split('/').filter(Boolean);
  if (!segments.length || segments.some((s) => s === '..')) {
    throw new Error('目标文件不在当前项目目录内');
  }
  return segments;
};

/** 定位父目录句柄，返回 { parent, name } */
async function resolveParentDir(rootPath, relativePath, { create = false } = {}) {
  const root = await getRootHandle(rootPath);
  const segments = splitRelativePath(relativePath);
  const name = segments.pop();
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return { parent: dir, name };
}

// ── 读取目录树（与 localProject.readProjectNode 同构） ────────────

async function readDirectoryNode(dirHandle, relativePath, name, isRoot) {
  const children = [];
  const entries = [];
  for await (const entry of dirHandle.values()) {
    entries.push(entry);
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  for (const entry of entries) {
    const childRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (shouldIgnoreDirectory(entry.name)) continue;
      children.push(await readDirectoryNode(entry, childRel, entry.name, false));
      continue;
    }
    if (!isSupportedFile(entry.name) || entry.name.startsWith('.')) continue;

    if (isMarkdownFile(entry.name)) {
      const file = await entry.getFile();
      const content = await file.text();
      children.push({
        id: `file:${childRel}`,
        type: 'file',
        name: entry.name,
        relativePath: childRel,
        content,
        diskContentSnapshot: content,
        updatedAt: file.lastModified,
      });
    } else {
      children.push({
        id: `file:${childRel}`,
        type: 'file',
        name: entry.name,
        relativePath: childRel,
        content: null,
        diskContentSnapshot: null,
        needsConversion: true,
        updatedAt: Date.now(),
      });
    }
  }

  return {
    id: isRoot ? 'root' : `folder:${relativePath}`,
    name,
    type: 'folder',
    relativePath: isRoot ? '' : relativePath,
    children,
  };
}

// ── 对外接口（与 Electron bridge payload 同构） ───────────────────

export async function openLocalProject() {
  let handle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (error) {
    if (error?.name === 'AbortError') return { canceled: true };
    throw error;
  }

  const rootPath = `${ROOT_PREFIX}${handle.name}:${Math.random().toString(36).slice(2, 8)}`;
  rootHandles.set(rootPath, handle);
  await idbPut(rootPath, handle).catch(() => {
    /* IndexedDB 不可用时仅内存有效，刷新后需重新打开 */
  });

  const workspace = await readDirectoryNode(handle, '', handle.name, true);
  return { canceled: false, projectRootPath: rootPath, workspace };
}

export async function readLocalProjectDisk(rootPath) {
  const handle = await getRootHandle(rootPath);
  const workspace = await readDirectoryNode(handle, '', handle.name, true);
  return { ok: true, workspace };
}

export async function saveLocalProjectFile({ projectRootPath, relativePath, content }) {
  const { parent, name } = await resolveParentDir(projectRootPath, relativePath, { create: true });
  const fileHandle = await parent.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content ?? '');
  await writable.close();
  return { ok: true };
}

export async function createLocalProjectFile({ projectRootPath, relativePath, content = '' }) {
  await saveLocalProjectFile({ projectRootPath, relativePath, content });
  return { relativePath, updatedAt: Date.now() };
}

export async function createLocalProjectFolder({ projectRootPath, relativePath }) {
  const root = await getRootHandle(projectRootPath);
  let dir = root;
  for (const segment of splitRelativePath(relativePath)) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  return { relativePath };
}

/** 递归复制（FSA 无跨目录 move，用 复制 + 删除 实现移动/重命名） */
async function copyEntry(sourceParent, sourceName, targetParent, targetName) {
  try {
    const fileHandle = await sourceParent.getFileHandle(sourceName);
    const file = await fileHandle.getFile();
    const destHandle = await targetParent.getFileHandle(targetName, { create: true });
    const writable = await destHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return;
  } catch (error) {
    if (error?.name !== 'TypeMismatchError' && error?.name !== 'NotFoundError') throw error;
  }

  const sourceDir = await sourceParent.getDirectoryHandle(sourceName);
  const destDir = await targetParent.getDirectoryHandle(targetName, { create: true });
  for await (const entry of sourceDir.values()) {
    await copyEntry(sourceDir, entry.name, destDir, entry.name);
  }
}

export async function renameLocalProjectEntry({ projectRootPath, relativePath, newRelativePath }) {
  const source = await resolveParentDir(projectRootPath, relativePath);
  const target = await resolveParentDir(projectRootPath, newRelativePath, { create: true });
  await copyEntry(source.parent, source.name, target.parent, target.name);
  await source.parent.removeEntry(source.name, { recursive: true });
  return { relativePath: newRelativePath, updatedAt: Date.now() };
}

export async function deleteLocalProjectEntry({ projectRootPath, relativePath }) {
  const { parent, name } = await resolveParentDir(projectRootPath, relativePath);
  await parent.removeEntry(name, { recursive: true });
  return { ok: true };
}

export async function readLocalProjectFileContent({ projectRootPath, relativePath }) {
  const { parent, name } = await resolveParentDir(projectRootPath, relativePath);
  const fileHandle = await parent.getFileHandle(name);
  const file = await fileHandle.getFile();
  const ext = getExtension(name);

  if (IMAGE_EXTENSIONS.has(ext)) {
    return { ok: true, encoding: 'fileUrl', data: URL.createObjectURL(file) };
  }
  if (ext === '.mp4' || ext === '.webm' || ext === '.ogg' || ext === '.mov'
    || ext === '.mp3' || ext === '.wav' || ext === '.flac' || ext === '.aac') {
    return { ok: true, encoding: 'fileUrl', data: URL.createObjectURL(file) };
  }
  if (ext === '.docx' || ext === '.xlsx' || ext === '.xls') {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return { ok: true, encoding: 'base64', data: window.btoa(binary) };
  }
  return { ok: true, encoding: 'utf8', data: await file.text() };
}
