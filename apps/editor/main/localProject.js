import fs from 'fs/promises';
import path from 'path';

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

    if (!isRoot && children.length === 0) {
      return null;
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
  await fs.writeFile(filePath, content ?? '', 'utf8');
}
