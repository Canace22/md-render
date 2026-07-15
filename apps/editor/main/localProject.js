import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  applyKnowledgeMetadataToFrontmatter,
  extractKnowledgeMetadataFromFrontmatter,
  parseMarkdownFrontmatter,
  serializeMarkdownFrontmatter,
} from '../shared/frontmatter.js';

export const MD_RENDER_DIR_NAME = 'MdRender';
export const MD_RENDER_SUBDIRS = ['Projects', 'Artifacts', 'Scheduled'];

// 粘贴/拖入的图片素材统一存到项目根下的此目录
const ASSETS_DIR_NAME = '素材';
// base64 mime 子类型 → 文件扩展名（仅允许图片，防止写入可执行文件）
const ASSET_MIME_EXTENSIONS = {
  png: 'png',
  jpeg: 'jpg',
  jpg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  svg: 'svg',
  'svg+xml': 'svg',
  bmp: 'bmp',
};

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const LOCAL_PROJECT_META_DIR_NAME = '.md-render';
const LOCAL_PROJECT_META_SIDECAR_SUFFIX = '.md-render-meta.json';
const LOCAL_PROJECT_META_VERSION = 1;
const DAILY_WORKSPACE_FILENAME = 'daily-workspace.json';
const DAILY_WORKSPACE_VERSION = 1;
const DEFAULT_NODE_TYPE = 'document';
const BOOKMARK_FETCH_TIMEOUT_MS = 15000;
const BOOKMARK_FETCH_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const SUPPORTED_FILE_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt',
  '.html', '.htm',
  '.docx',
  '.xlsx', '.xls',
  '.csv',
  '.rst',
  '.org',
  '.json',
  // 图片
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico',
  // 视频
  '.mp4', '.webm', '.ogg', '.mov',
  // 音频
  '.mp3', '.wav', '.flac', '.aac',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.next',
  '.turbo',
  '.vscode',
  'build',
  'dist',
  'node_modules',
]);

const toRelativePath = (rootPath, targetPath) => {
  return path.relative(rootPath, targetPath).split(path.sep).join('/');
};

const isSupportedFile = (name) => {
  return SUPPORTED_FILE_EXTENSIONS.has(path.extname(name).toLowerCase());
};

const isMarkdownFile = (name) => {
  const ext = path.extname(name).toLowerCase();
  return MARKDOWN_EXTENSIONS.has(ext) || ext === '.txt';
};

const shouldIgnoreDirectory = (name) => {
  return IGNORED_DIRECTORIES.has(name) || name.startsWith('.');
};

const isLocalProjectMetadataSidecar = (name) => {
  return name.startsWith('.') && name.endsWith(LOCAL_PROJECT_META_SIDECAR_SUFFIX);
};

const buildLegacyMetadataSidecarPath = (filePath) => {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  return path.join(dirPath, `.${baseName}${LOCAL_PROJECT_META_SIDECAR_SUFFIX}`);
};

const buildMetadataDirectoryPath = (filePath) => {
  return path.join(path.dirname(filePath), LOCAL_PROJECT_META_DIR_NAME);
};

const buildWorkspaceMetaDirectoryPath = (projectRootPath) => {
  return path.join(projectRootPath, LOCAL_PROJECT_META_DIR_NAME);
};

const buildDailyWorkspaceFilePath = (projectRootPath) => {
  return path.join(buildWorkspaceMetaDirectoryPath(projectRootPath), DAILY_WORKSPACE_FILENAME);
};

const buildMetadataSidecarPath = (filePath) => {
  const baseName = path.basename(filePath);
  return path.join(buildMetadataDirectoryPath(filePath), `${baseName}${LOCAL_PROJECT_META_SIDECAR_SUFFIX}`);
};

const listMetadataCandidatePaths = (filePath) => {
  return [
    buildMetadataSidecarPath(filePath),
    buildLegacyMetadataSidecarPath(filePath),
  ];
};

const removeLocalProjectMetadataDirIfEmpty = async (filePath) => {
  const metadataDirPath = buildMetadataDirectoryPath(filePath);
  try {
    const entries = await fs.readdir(metadataDirPath);
    if (entries.length === 0) {
      await fs.rmdir(metadataDirPath);
    }
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) {
      throw error;
    }
  }
};

const deleteLocalProjectMetadataFiles = async (filePath) => {
  await Promise.all(
    listMetadataCandidatePaths(filePath).map((candidatePath) => fs.rm(candidatePath, { force: true })),
  );
  await removeLocalProjectMetadataDirIfEmpty(filePath);
};

const sanitizeStringList = (values) => {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean)));
};

const normalizeLocalProjectMetadata = (metadata = {}) => {
  return {
    nodeType: String(metadata.nodeType ?? '').trim() || DEFAULT_NODE_TYPE,
    summary: String(metadata.summary ?? '').trim(),
    url: String(metadata.url ?? metadata.source ?? '').trim(),
    aliases: sanitizeStringList(metadata.aliases),
    relatedIds: sanitizeStringList(metadata.relatedIds),
    draftStatus: String(metadata.draftStatus ?? '').trim(),
    targetPlatforms: sanitizeStringList(
      metadata.targetPlatforms ?? metadata.platforms ?? metadata.publishPlatforms,
    ),
    scheduledPublishAt: String(metadata.scheduledPublishAt ?? metadata.publishAt ?? '').trim(),
    sourceMaterialIds: sanitizeStringList(
      metadata.sourceMaterialIds ?? metadata.sourceMaterials,
    ),
    tags: sanitizeStringList(metadata.tags),
  };
};

const hasMeaningfulMetadata = (metadata) => {
  if (!metadata) return false;
  return metadata.nodeType !== DEFAULT_NODE_TYPE
    || Boolean(metadata.summary)
    || Boolean(metadata.url)
    || metadata.aliases.length > 0
    || metadata.relatedIds.length > 0
    || Boolean(metadata.draftStatus)
    || metadata.targetPlatforms.length > 0
    || Boolean(metadata.scheduledPublishAt)
    || metadata.sourceMaterialIds.length > 0
    || metadata.tags.length > 0;
};

async function readLocalProjectMetadata(filePath) {
  for (const sidecarPath of listMetadataCandidatePaths(filePath)) {
    try {
      const raw = await fs.readFile(sidecarPath, 'utf8');
      const parsed = JSON.parse(raw);
      const payload = parsed?.metadata && typeof parsed.metadata === 'object'
        ? parsed.metadata
        : parsed;
      return normalizeLocalProjectMetadata(payload);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      console.warn('[localProject] 读取元数据 sidecar 失败:', sidecarPath, error);
      return null;
    }
  }
  return null;
}

async function writeLocalProjectMetadata(filePath, metadata) {
  const sidecarPath = buildMetadataSidecarPath(filePath);
  const normalized = normalizeLocalProjectMetadata(metadata);
  const fileName = path.basename(filePath);

  if (isMarkdownFile(fileName)) {
    try {
      const rawContent = await fs.readFile(filePath, 'utf8');
      const parsed = parseMarkdownFrontmatter(rawContent);
      if (parsed.hasFrontmatter) {
        const nextFrontmatter = applyKnowledgeMetadataToFrontmatter(parsed.frontmatter, normalized);
        await fs.writeFile(
          filePath,
          serializeMarkdownFrontmatter(nextFrontmatter, parsed.content),
          'utf8',
        );
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('[localProject] 同步 frontmatter 失败:', filePath, error);
      }
    }
  }

  if (!hasMeaningfulMetadata(normalized)) {
    await deleteLocalProjectMetadataFiles(filePath);
    return { ok: true, deleted: true };
  }

  await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
  await fs.writeFile(sidecarPath, `${JSON.stringify({
    version: LOCAL_PROJECT_META_VERSION,
    metadata: normalized,
  }, null, 2)}\n`, 'utf8');
  await fs.rm(buildLegacyMetadataSidecarPath(filePath), { force: true });
  return { ok: true, deleted: false };
}

async function readProjectNode(rootPath, currentPath, isRoot = false) {
  const stat = await fs.stat(currentPath);
  const name = isRoot ? path.basename(currentPath) : path.basename(currentPath);

  if (stat.isDirectory()) {
    if (!isRoot && shouldIgnoreDirectory(name)) {
      return null;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const sortedEntries = entries
      .filter((entry) => !entry.isSymbolicLink())
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });

    const children = [];
    for (const entry of sortedEntries) {
      const childPath = path.join(currentPath, entry.name);
      const childNode = await readProjectNode(rootPath, childPath, false);
      if (childNode) {
        children.push(childNode);
      }
    }

    return {
      id: isRoot ? 'root' : `folder:${toRelativePath(rootPath, currentPath)}`,
      name,
      type: 'folder',
      relativePath: isRoot ? '' : toRelativePath(rootPath, currentPath),
      children,
    };
  }

  if (!stat.isFile() || isLocalProjectMetadataSidecar(name) || !isSupportedFile(name)) {
    return null;
  }

  const relativePath = toRelativePath(rootPath, currentPath);
  const metadata = await readLocalProjectMetadata(currentPath);

  // Markdown / 纯文本直接读取内容；其他格式只记录元信息，由 Renderer 按需转换
  if (isMarkdownFile(name)) {
    const rawContent = await fs.readFile(currentPath, 'utf8');
    const parsed = parseMarkdownFrontmatter(rawContent);
    const frontmatterMetadata = extractKnowledgeMetadataFromFrontmatter(parsed.frontmatter);
    const content = parsed.hasFrontmatter ? parsed.content : rawContent;
    return {
      id: `file:${relativePath}`,
      type: 'file',
      name,
      relativePath,
      content,
      diskContentSnapshot: content,
      updatedAt: stat.mtimeMs,
      ...frontmatterMetadata,
      ...(metadata ?? {}),
    };
  }

  return {
    id: `file:${relativePath}`,
    type: 'file',
    name,
    relativePath,
    content: null,
    diskContentSnapshot: null,
    needsConversion: true,
    updatedAt: stat.mtimeMs,
    ...(metadata ?? {}),
  };
}

export async function readLocalProjectWorkspace(projectRootPath) {
  const workspace = await readProjectNode(projectRootPath, projectRootPath, true);
  return workspace ?? {
    id: 'root',
    name: path.basename(projectRootPath),
    type: 'folder',
    relativePath: '',
    children: [],
  };
}

export function resolveProjectFilePath(projectRootPath, relativePath) {
  const rootPath = path.resolve(projectRootPath);
  const targetPath = path.resolve(rootPath, relativePath);
  const relativeFromRoot = path.relative(rootPath, targetPath);

  if (
    !relativePath
    || relativeFromRoot.startsWith('..')
    || path.isAbsolute(relativeFromRoot)
  ) {
    throw new Error('目标文件不在当前项目目录内');
  }

  return targetPath;
}

export async function saveLocalProjectFile(projectRootPath, relativePath, content) {
  const filePath = resolveProjectFilePath(projectRootPath, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const fileName = path.basename(filePath);

  if (!isMarkdownFile(fileName)) {
    await fs.writeFile(filePath, content ?? '', 'utf8');
    return;
  }

  try {
    const rawContent = await fs.readFile(filePath, 'utf8');
    const parsed = parseMarkdownFrontmatter(rawContent);
    if (parsed.hasFrontmatter) {
      await fs.writeFile(
        filePath,
        serializeMarkdownFrontmatter(parsed.frontmatter, content ?? ''),
        'utf8',
      );
      return;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.writeFile(filePath, content ?? '', 'utf8');
}

export async function saveLocalProjectMetadata(projectRootPath, relativePath, metadata) {
  const filePath = resolveProjectFilePath(projectRootPath, relativePath);
  await writeLocalProjectMetadata(filePath, metadata);
}

export function getMdRenderRootPath() {
  return path.join(os.homedir(), 'Documents', MD_RENDER_DIR_NAME);
}

export async function ensureMdRenderDirectories() {
  const rootPath = getMdRenderRootPath();
  await fs.mkdir(rootPath, { recursive: true });
  await Promise.all(
    MD_RENDER_SUBDIRS.map((dirName) => fs.mkdir(path.join(rootPath, dirName), { recursive: true })),
  );
  return rootPath;
}

export async function readDailyWorkspaceBackup(projectRootPath) {
  if (!projectRootPath) return null;
  const filePath = buildDailyWorkspaceFilePath(projectRootPath);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const payload = parsed?.dailyWorkspace && typeof parsed.dailyWorkspace === 'object'
      ? parsed.dailyWorkspace
      : parsed;
    return payload && typeof payload === 'object' ? payload : null;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    console.warn('[localProject] 读取 daily workspace 备份失败:', filePath, error);
    return null;
  }
}

export async function saveDailyWorkspaceBackup(projectRootPath, dailyWorkspace) {
  if (!projectRootPath) {
    throw new Error('缺少项目根路径');
  }
  const filePath = buildDailyWorkspaceFilePath(projectRootPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({
    version: DAILY_WORKSPACE_VERSION,
    dailyWorkspace: dailyWorkspace ?? null,
  }, null, 2)}\n`, 'utf8');
  return {
    relativePath: toRelativePath(projectRootPath, filePath),
  };
}

export async function createLocalProjectFile(projectRootPath, relativePath, content = '') {
  const filePath = resolveProjectFilePath(projectRootPath, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content ?? '', 'utf8');
  const stat = await fs.stat(filePath);
  return {
    relativePath: toRelativePath(projectRootPath, filePath),
    updatedAt: stat.mtimeMs,
  };
}

/**
 * 把粘贴/拖入的图片（base64）存到项目根的 素材/ 目录。
 * @param {string} projectRootPath 当前项目根路径
 * @param {string} base64 不含 data: 前缀的纯 base64
 * @param {string} mimeSubtype 形如 'png' / 'jpeg' / 'svg+xml'
 * @returns {{ relativePath: string }} 相对项目根的 POSIX 路径
 */
export async function saveBinaryAsset(projectRootPath, base64, mimeSubtype = 'png') {
  if (!projectRootPath) throw new Error('缺少项目根路径');
  if (!base64) throw new Error('图片数据为空');

  const normalizedMimeSubtype = String(mimeSubtype).toLowerCase();
  const ext = ASSET_MIME_EXTENSIONS[normalizedMimeSubtype];
  if (!ext) throw new Error(`不支持的图片格式：${normalizedMimeSubtype || '未知'}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 6);
  const relativePath = `${ASSETS_DIR_NAME}/截图-${stamp}-${rand}.${ext}`;

  // 复用 resolveProjectFilePath 的越界校验，杜绝写出项目目录外
  const filePath = resolveProjectFilePath(projectRootPath, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));

  return { relativePath: toRelativePath(projectRootPath, filePath) };
}

export async function createLocalProjectFolder(projectRootPath, relativePath) {
  const folderPath = resolveProjectFilePath(projectRootPath, relativePath);
  await fs.mkdir(folderPath, { recursive: true });
  return {
    relativePath: toRelativePath(projectRootPath, folderPath),
  };
}

export async function deleteLocalProjectEntry(projectRootPath, relativePath) {
  const targetPath = resolveProjectFilePath(projectRootPath, relativePath);
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
      await deleteLocalProjectMetadataFiles(targetPath);
    }
  } catch {
    // ignore missing metadata or target stats
  }
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function renameLocalProjectEntry(projectRootPath, relativePath, newRelativePath) {
  const oldPath = resolveProjectFilePath(projectRootPath, relativePath);
  const newPath = resolveProjectFilePath(projectRootPath, newRelativePath);
  let isFile = false;
  try {
    const stat = await fs.stat(oldPath);
    isFile = stat.isFile();
  } catch {
    isFile = false;
  }
  await fs.rename(oldPath, newPath);
  if (isFile) {
    const metadata = await readLocalProjectMetadata(oldPath);
    if (metadata) {
      await writeLocalProjectMetadata(newPath, metadata);
    }
    await deleteLocalProjectMetadataFiles(oldPath);
  }
  const stat = await fs.stat(newPath);
  return {
    relativePath: toRelativePath(projectRootPath, newPath),
    updatedAt: stat.isFile() ? stat.mtimeMs : undefined,
  };
}

const markDiskBackedNode = (node, projectRootPath) => {
  if (!node) return null;
  const suffix = node.type === 'folder'
    ? `:folder:${node.relativePath}`
    : `:file:${node.relativePath}`;
  const marked = {
    ...node,
    id: `project:${projectRootPath}${suffix}`,
    projectRootPath,
  };
  if (node.type === 'folder' && Array.isArray(node.children)) {
    return {
      ...marked,
      children: node.children
        .map((child) => markDiskBackedNode(child, projectRootPath))
        .filter(Boolean),
    };
  }
  return marked;
};

/** 只读取 Projects 下的用户内容，不暴露 MdRender/Artifacts/Scheduled 结构 */
export async function readProjectsChildren(projectRootPath) {
  const projectsPath = path.join(projectRootPath, 'Projects');
  await fs.mkdir(projectsPath, { recursive: true });

  const entries = await fs.readdir(projectsPath, { withFileTypes: true });
  const sortedEntries = entries
    .filter((entry) => !entry.isSymbolicLink())
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });

  const children = [];
  for (const entry of sortedEntries) {
    const childPath = path.join(projectsPath, entry.name);
    const childNode = await readProjectNode(projectRootPath, childPath, false);
    if (childNode) {
      children.push(childNode);
    }
  }
  return children.map((node) => markDiskBackedNode(node, projectRootPath)).filter(Boolean);
}

/**
 * 读取单个文件的原始内容（文本或 base64）
 * 用于 Renderer 按需转换非 Markdown 文件
 */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico',
]);

const AV_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mov',
  '.mp3', '.wav', '.flac', '.aac',
]);

const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...AV_EXTENSIONS]);

const BINARY_EXTENSIONS = new Set(['.docx', '.xlsx', '.xls', ...MEDIA_EXTENSIONS]);

const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
};

export async function readLocalProjectFileContent(projectRootPath, relativePath) {
  const filePath = resolveProjectFilePath(projectRootPath, relativePath);
  const ext = path.extname(filePath).toLowerCase();

  // 图片文件返回 data URL，避免自定义协议在不同环境下的兼容问题
  if (IMAGE_EXTENSIONS.has(ext)) {
    const buffer = await fs.readFile(filePath);
    const mime = IMAGE_MIME[ext] || 'application/octet-stream';
    return { encoding: 'fileUrl', data: `data:${mime};base64,${buffer.toString('base64')}` };
  }

  // 音视频文件返回 local-media:// URL（需要流式加载）
  if (AV_EXTENSIONS.has(ext)) {
    return { encoding: 'fileUrl', data: `local-media://${filePath}` };
  }

  // 二进制格式（如 docx）以 base64 返回
  if (BINARY_EXTENSIONS.has(ext)) {
    const buffer = await fs.readFile(filePath);
    return { encoding: 'base64', data: buffer.toString('base64') };
  }

  // 文本格式直接返回
  const content = await fs.readFile(filePath, 'utf8');
  return { encoding: 'utf8', data: content };
}

export async function fetchBookmarkPageSnapshot(url) {
  const targetUrl = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    throw new Error('无效链接，仅支持 http(s) 地址');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOKMARK_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'User-Agent': BOOKMARK_FETCH_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`抓取失败：${response.status}`);
    }

    return {
      url: response.url || targetUrl,
      contentType: response.headers.get('content-type') ?? '',
      html: await response.text(),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('抓取网页超时');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureMdRenderWorkspaceData() {
  const projectRootPath = await ensureMdRenderDirectories();
  const projectsChildren = await readProjectsChildren(projectRootPath);
  return { projectRootPath, projectsChildren };
}
