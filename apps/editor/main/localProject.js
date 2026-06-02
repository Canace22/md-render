import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export const MD_RENDER_DIR_NAME = 'MdRender';
export const MD_RENDER_SUBDIRS = ['Projects', 'Artifacts', 'Scheduled'];

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
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

const isSupportedMarkdownFile = (name) => {
  return MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase());
};

const shouldIgnoreDirectory = (name) => {
  return IGNORED_DIRECTORIES.has(name) || name.startsWith('.');
};

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

  if (!stat.isFile() || !isSupportedMarkdownFile(name)) {
    return null;
  }

  const content = await fs.readFile(currentPath, 'utf8');
  const relativePath = toRelativePath(rootPath, currentPath);

  return {
    id: `file:${relativePath}`,
    type: 'file',
    name,
    relativePath,
    content,
    updatedAt: stat.mtimeMs,
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
  await fs.writeFile(filePath, content ?? '', 'utf8');
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

export async function createLocalProjectFolder(projectRootPath, relativePath) {
  const folderPath = resolveProjectFilePath(projectRootPath, relativePath);
  await fs.mkdir(folderPath, { recursive: true });
  return {
    relativePath: toRelativePath(projectRootPath, folderPath),
  };
}

export async function deleteLocalProjectEntry(projectRootPath, relativePath) {
  const targetPath = resolveProjectFilePath(projectRootPath, relativePath);
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function renameLocalProjectEntry(projectRootPath, relativePath, newRelativePath) {
  const oldPath = resolveProjectFilePath(projectRootPath, relativePath);
  const newPath = resolveProjectFilePath(projectRootPath, newRelativePath);
  await fs.rename(oldPath, newPath);
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

export async function ensureMdRenderWorkspaceData() {
  const projectRootPath = await ensureMdRenderDirectories();
  const projectsChildren = await readProjectsChildren(projectRootPath);
  return { projectRootPath, projectsChildren };
}
