/**
 * 迁移预演：只读扫描内容库 + renderer 交来的旧数据，算出要写哪些文件、改哪些名、哪里有冲突。
 * 预演和正式执行共用这份计划（正式执行前会再算一次，保证用的是最新数据）。
 */

import fsp from 'fs/promises';
import path from 'path';
import { hashContent } from '../../shared/capabilities/contentHash.js';
import { BUILTIN_DOCS_DIR, planBuiltinDocsMigration, sanitizeFileName } from '../../shared/migration/docsPlan.js';
import { parseFrontmatterDocument } from '../../shared/frontmatterDocument.js';
import {
  findDailyRoundTripMismatches,
  parseDailyEntry,
  parseTodoPool,
  serializeDailyEntry,
  serializeDailyWorkspace,
  serializeTodoPool,
  TODO_FILE_NAME,
} from '../../shared/migration/dailyFormat.js';
import { serializeCanvasState } from '../../shared/migration/canvasFormat.js';
import { EDITORIAL_MEMORY_PATH, mergeEditorialMemories } from '../../shared/migration/memoryMerge.js';
import { MIGRATION_STEPS, readTextIfExists, resolveVaultPath } from './vaultFiles.js';

const ARTIFACTS_DIR = 'Artifacts';
export const LEGACY_ARTIFACTS_DIR = '.agent/migration/legacy-artifacts';
const SKIP_DIRS = new Set(['node_modules']);
const MARKDOWN_RE = /\.(md|markdown)$/i;
const BYTES_PER_MB = 1024 * 1024;

/**
 * 扫内容库：Markdown 文件名（避让重名）、总体积（决定要不要 git 初始化）、
 * 内置文档目录里已迁过的 frontmatter id（重复执行时沿用原路径）
 */
export async function scanVault(vaultRoot) {
  const names = [];
  const idPaths = {};
  let totalBytes = 0;
  let fileCount = 0;
  const walk = async (dir) => {
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        fileCount += 1;
        totalBytes += (await fsp.stat(full)).size;
        if (!MARKDOWN_RE.test(entry.name)) continue;
        const relativePath = path.relative(vaultRoot, full).split(path.sep).join('/');
        if (relativePath.startsWith(`${BUILTIN_DOCS_DIR}/`)) {
          const id = parseFrontmatterDocument(await fsp.readFile(full, 'utf8')).frontmatter.id;
          if (typeof id === 'string' && id) {
            idPaths[id] = relativePath;
            continue;
          }
        }
        names.push({ name: entry.name.replace(MARKDOWN_RE, ''), relativePath });
      }
    }
  };
  await walk(vaultRoot);
  return { names, idPaths, totalBytes, fileCount };
}

/* ── 各步计划 ─────────────────────────────────────────────── */

async function planMemory(vaultRoot, memoryContents = []) {
  const existing = await readTextIfExists(resolveVaultPath(vaultRoot, EDITORIAL_MEMORY_PATH));
  const sources = [existing, ...memoryContents].filter((text) => String(text ?? '').trim());
  if (!sources.length) return { files: [], skipped: '没有编辑部记忆' };
  const merged = mergeEditorialMemories(sources);
  return {
    files: [{ relativePath: EDITORIAL_MEMORY_PATH, content: merged.content }],
    entryCount: merged.entryCount,
    duplicateCount: merged.duplicateCount,
    copyCount: memoryContents.length,
  };
}

/** Daily：已有同名日记就按 id 合并（以 app 里的为准，补上文件里独有的条目），绝不丢数据 */
async function planDaily(vaultRoot, dailyWorkspace) {
  if (!dailyWorkspace) return { files: [], skipped: '没有 Daily 数据' };
  const mismatches = findDailyRoundTripMismatches(dailyWorkspace);
  const files = [];
  const merged = [];
  for (const file of serializeDailyWorkspace(dailyWorkspace)) {
    const existing = await readTextIfExists(resolveVaultPath(vaultRoot, file.relativePath));
    if (existing == null || existing === file.content) {
      files.push(file);
      continue;
    }
    merged.push(file.relativePath);
    files.push({ relativePath: file.relativePath, content: mergeDailyFile(file, existing) });
  }
  return { files, mismatches, merged, dayCount: files.length - 1 };
}

const mergeById = (preferred, extra) => {
  const ids = new Set(preferred.map((item) => item.id));
  return [...preferred, ...extra.filter((item) => !ids.has(item.id))];
};

const mergeDailyFile = (file, existing) => {
  if (file.relativePath === TODO_FILE_NAME) {
    return serializeTodoPool(mergeById(parseTodoPool(file.content), parseTodoPool(existing)));
  }
  const dateKey = path.basename(file.relativePath, '.md');
  const mine = parseDailyEntry(file.content, dateKey);
  const theirs = parseDailyEntry(existing, dateKey);
  return serializeDailyEntry({ date: dateKey, items: mergeById(mine.items, theirs.items) });
};

/** 白板：目标文件已存在且内容不同就不切换这一步，避免覆盖 */
async function planCanvas(vaultRoot, canvasState) {
  if (!canvasState) return { files: [], skipped: '没有白板数据' };
  const files = serializeCanvasState(canvasState);
  const conflicts = [];
  for (const file of files) {
    const existing = await readTextIfExists(resolveVaultPath(vaultRoot, file.relativePath));
    if (existing != null && existing !== file.content) conflicts.push(file.relativePath);
  }
  return { files, conflicts, cardCount: canvasState.nodes?.length ?? 0 };
}

/** 和 mdSync 导出规则一致：sanitize(节点名) + '.md'，同名后写的覆盖先写的 */
const buildLegacyExportIndex = (workspace) => {
  const index = new Map();
  const walk = (node) => {
    if (node?.type === 'file' && !node.projectRootPath) {
      index.set(`${sanitizeFileName(node.name)}.md`, hashContent(node.content ?? ''));
    }
    (node?.children ?? []).forEach(walk);
  };
  walk(workspace);
  return index;
};

/** Artifacts/ 根目录：和数据库内容一致的是旧导出副本，挪走；其它都是真内容，原地不动 */
async function planArtifacts(vaultRoot, workspace) {
  const dir = resolveVaultPath(vaultRoot, ARTIFACTS_DIR);
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return { moves: [], kept: [] };
  }
  const exportIndex = buildLegacyExportIndex(workspace);
  const moves = [];
  const kept = [];
  for (const entry of entries) {
    if (!entry.isFile() || !MARKDOWN_RE.test(entry.name)) continue;
    const content = await fsp.readFile(path.join(dir, entry.name), 'utf8');
    const expected = exportIndex.get(entry.name);
    if (expected && expected === hashContent(content)) {
      moves.push({ from: `${ARTIFACTS_DIR}/${entry.name}`, to: `${LEGACY_ARTIFACTS_DIR}/${entry.name}` });
    } else {
      kept.push({ relativePath: `${ARTIFACTS_DIR}/${entry.name}`, reason: expected ? '和数据库里的同名文档内容不同' : '数据库里没有同名文档' });
    }
  }
  return { moves, kept };
}

/* ── 汇总 ─────────────────────────────────────────────────── */

/**
 * @param {{ payload: object, vaultRoot: string, steps?: string[] }} options
 */
export async function planMigration({ payload = {}, vaultRoot, steps = MIGRATION_STEPS }) {
  const scan = await scanVault(vaultRoot);
  const plan = { vaultRoot, steps: [...steps], scan, createdAt: new Date().toISOString() };
  if (steps.includes('memory')) plan.memory = await planMemory(vaultRoot, payload.memoryContents);
  if (steps.includes('daily')) plan.daily = await planDaily(vaultRoot, payload.dailyWorkspace);
  if (steps.includes('canvas')) plan.canvas = await planCanvas(vaultRoot, payload.canvasState);
  if (steps.includes('artifacts')) plan.artifacts = await planArtifacts(vaultRoot, payload.workspace);
  if (steps.includes('docs')) {
    // 会被挪走的 Artifacts 旧导出不算撞名
    const movedAway = new Set((plan.artifacts?.moves ?? []).map((move) => move.from));
    const existingNames = scan.names.filter((item) => !movedAway.has(item.relativePath)).map((item) => item.name);
    plan.docs = planBuiltinDocsMigration(payload.workspace, { existingNames, existingIdPaths: scan.idPaths });
  }
  plan.blockers = collectBlockers(plan);
  plan.report = buildMigrationReport(plan);
  return plan;
}

/** 有阻塞问题的步骤不执行（其余步骤照常） */
export const collectBlockers = (plan) => {
  const blockers = {};
  if (plan.daily?.mismatches?.length) blockers.daily = `${plan.daily.mismatches.length} 条 Daily 记录转换前后不一致`;
  if (plan.canvas?.conflicts?.length) blockers.canvas = `目标文件已存在且内容不同：${plan.canvas.conflicts.join('、')}`;
  return blockers;
};

const formatMb = (bytes) => `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;

export const buildMigrationReport = (plan) => {
  const lines = [`# 迁移预演报告`, '', `生成时间：${plan.createdAt}`, `内容库：${plan.vaultRoot}`, ''];
  lines.push('## 现状', '', `- 内容库已有 ${plan.scan.fileCount} 个文件，共 ${formatMb(plan.scan.totalBytes)}`, '');
  if (plan.memory) {
    lines.push('## 编辑部记忆', '', plan.memory.skipped
      ? `- ${plan.memory.skipped}`
      : `- 合并 ${plan.memory.copyCount} 份副本 → \`${EDITORIAL_MEMORY_PATH}\`，${plan.memory.entryCount} 条，去重 ${plan.memory.duplicateCount} 条（原副本不删除）`, '');
  }
  if (plan.daily) {
    lines.push('## Daily 与待办池', '', plan.daily.skipped ? `- ${plan.daily.skipped}` : `- ${plan.daily.dayCount} 天 → \`Daily/*.md\`，待办池 → \`Todo.md\``);
    plan.daily.merged?.forEach((file) => lines.push(`- \`${file}\` 已存在，按 id 合并（不丢条目）`));
    plan.daily.mismatches?.forEach((item) => lines.push(`- ⚠️ 转换不一致：${item.date} ${item.id}`));
    lines.push('');
  }
  if (plan.canvas) {
    lines.push('## 白板', '', plan.canvas.skipped ? `- ${plan.canvas.skipped}` : `- ${plan.canvas.cardCount} 张卡片 → ${plan.canvas.files.map((f) => `\`${f.relativePath}\``).join('、')}`);
    plan.canvas.conflicts?.forEach((file) => lines.push(`- ⚠️ \`${file}\` 已存在且内容不同，这一步不执行`));
    lines.push('');
  }
  if (plan.docs) {
    const already = plan.docs.docs.filter((doc) => doc.alreadyMigrated).length;
    lines.push('## 内置文档', '', `- ${plan.docs.docs.length} 篇文档、${plan.docs.folders.length} 个文件夹 → \`Projects/内置文档/\`${already ? `（其中 ${already} 篇上次已迁移，跳过）` : ''}`);
    lines.push(`- 抽出 base64 图片 ${plan.docs.assetStats.count} 张，约 ${formatMb(plan.docs.assetStats.bytes)}`);
    plan.docs.renames.forEach((item) => lines.push(`- 改名：「${item.from}」→ \`${item.to}\`（原名写进 aliases）`));
    plan.docs.linkRewrites.forEach((item) => item.rewrites.forEach((r) => lines.push(`- 链接改写：\`${item.relativePath}\` 里 [[${r.from}]] → [[${r.to}|${r.from}]]`)));
    lines.push('');
  }
  if (plan.artifacts) {
    lines.push('## Artifacts/ 旧导出', '', `- ${plan.artifacts.moves.length} 个和数据库一致的导出副本 → \`${LEGACY_ARTIFACTS_DIR}/\`（不删除）`);
    plan.artifacts.kept.forEach((item) => lines.push(`- 保留 \`${item.relativePath}\`：${item.reason}`));
    lines.push('');
  }
  const blockers = Object.entries(plan.blockers ?? {});
  lines.push('## 结论', '', blockers.length ? blockers.map(([step, reason]) => `- ⛔ ${step} 不执行：${reason}`).join('\n') : '- 可以执行', '');
  return lines.join('\n');
};
