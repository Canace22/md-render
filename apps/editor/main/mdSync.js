import fs from 'fs/promises';
import path from 'path';
import { getMdRenderRootPath } from './localProject.js';

export function getArtifactsDir() {
  return path.join(getMdRenderRootPath(), 'Artifacts');
}

const sanitizeFilename = (name) =>
  (name ?? '').replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'untitled';

function* walkBuiltInFiles(node) {
  if (!node) return;
  // Local project nodes have projectRootPath; skip them — they're already file-backed
  if (node.type === 'file' && !node.projectRootPath) {
    yield node;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) yield* walkBuiltInFiles(child);
  }
}

/**
 * Write all built-in (non-local-project) workspace files to ~/Documents/MdRender/Artifacts/.
 * Returns { id: absoluteFilePath } map for updating SQLite disk_path.
 */
export async function writeBuiltInDocsToDisk(workspace) {
  if (!workspace) return {};
  const artifactsDir = getArtifactsDir();
  try {
    await fs.mkdir(artifactsDir, { recursive: true });
  } catch (err) {
    console.error('[mdSync] cannot create Artifacts dir:', err);
    return {};
  }

  const files = [...walkBuiltInFiles(workspace)];
  const diskPaths = {};

  await Promise.all(files.map(async (file) => {
    const safeName = sanitizeFilename(file.name);
    const filePath = path.join(artifactsDir, `${safeName}.md`);
    try {
      await fs.writeFile(filePath, file.content ?? '', 'utf8');
      diskPaths[file.id] = filePath;
    } catch (err) {
      console.error(`[mdSync] write failed for ${filePath}:`, err);
    }
  }));

  return diskPaths;
}
