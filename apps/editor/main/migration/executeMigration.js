/**
 * 正式迁移：备份 → git 快照 → 写暂存区 → 校验 → 移到目标位置 → 写状态和报告 → git 提交。
 *
 * 原则（见 docs/ai-native-data-migration.md）：只增不删（旧数据库、localStorage 都不动），
 * 写到一半失败不会在目标目录留下半成品，可以重复执行，有阻塞问题的步骤跳过、其余照常。
 */

import fsp from 'fs/promises';
import path from 'path';
import { hashContent } from '../../shared/capabilities/contentHash.js';
import { MIGRATION_DIR, readMigrationState, resolveVaultPath, writeMigrationState, writeTextFile } from './vaultFiles.js';
import { planMigration } from './planMigration.js';

const GIT_MAX_BYTES = 200 * 1024 * 1024;
const PAYLOAD_FILE = 'payload.json';
const DB_BACKUP_FILE = 'knowledge.db';
const GIT_IDENTITY = ['-c', 'user.name=md-render', '-c', 'user.email=md-render@localhost'];

const pad2 = (n) => String(n).padStart(2, '0');
export const buildStamp = (date = new Date()) => `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

const pathExists = async (target) => {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
};

/** 计划 → 要写的文件清单。overwrite=false 的目标已存在时记冲突、不覆盖 */
export const collectWrites = (plan) => {
  const writes = [];
  const blocked = plan.blockers ?? {};
  const add = (step, files, overwrite) => {
    if (blocked[step]) return;
    files.forEach((file) => writes.push({ step, overwrite, ...file }));
  };
  if (plan.memory) add('memory', plan.memory.files, true);
  if (plan.daily) add('daily', plan.daily.files, true);
  if (plan.canvas) add('canvas', plan.canvas.files, true);
  if (plan.docs) {
    const fresh = plan.docs.docs.filter((doc) => !doc.alreadyMigrated);
    add('docs', fresh.map(({ relativePath, content }) => ({ relativePath, content })), false);
    add('docs', fresh.flatMap((doc) => doc.assets.map(({ relativePath, base64 }) => ({ relativePath, base64 }))), false);
  }
  // 同一张图可能被多篇引用：按路径去重
  const seen = new Set();
  return writes.filter((write) => (seen.has(write.relativePath) ? false : seen.add(write.relativePath)));
};

const writeOne = async (filePath, write) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  if (write.base64 != null) await fsp.writeFile(filePath, Buffer.from(write.base64, 'base64'));
  else await fsp.writeFile(filePath, write.content, 'utf8');
};

const verifyOne = async (filePath, write) => {
  if (write.base64 != null) {
    const buffer = await fsp.readFile(filePath);
    return buffer.equals(Buffer.from(write.base64, 'base64'));
  }
  return hashContent(await fsp.readFile(filePath, 'utf8')) === hashContent(write.content);
};

async function gitSnapshot(runGit, vaultRoot, message, totalBytes) {
  if (!runGit) return '没有可用的 git，跳过版本快照';
  if (totalBytes > GIT_MAX_BYTES) return '内容库超过 200 MB，跳过 git 初始化，请自行纳入版本管理';
  try {
    if (!(await pathExists(path.join(vaultRoot, '.git')))) await runGit(['init'], vaultRoot);
    await runGit(['add', '-A'], vaultRoot);
    await runGit([...GIT_IDENTITY, 'commit', '--allow-empty', '-m', message], vaultRoot);
    return `git 已提交：${message}`;
  } catch (error) {
    return `git 快照失败（不影响迁移）：${error.message}`;
  }
}

/**
 * @param {object} options
 * @param {object} options.payload           renderer 交来的旧数据（工作区、Daily、白板、记忆副本、localStorage 导出）
 * @param {string} options.vaultRoot
 * @param {string[]} [options.steps]
 * @param {(dest: string) => Promise<void>} [options.backupDatabase]
 * @param {(args: string[], cwd: string) => Promise<void>} [options.runGit]
 * @param {(absPath: string) => void} [options.markIgnored] 写文件前通知 watcher 忽略
 * @param {(progress: { phase: string, done?: number, total?: number }) => void} [options.onProgress]
 */
export async function executeMigration({
  payload, vaultRoot, steps, backupDatabase, runGit, markIgnored = () => {}, onProgress = () => {}, now = new Date(),
}) {
  const stamp = buildStamp(now);
  const log = [];
  onProgress({ phase: '预演' });
  const plan = await planMigration({ payload, vaultRoot, steps });

  // 备份
  onProgress({ phase: '备份' });
  const backupRel = `${MIGRATION_DIR}/backup-${stamp}`;
  const backupDir = resolveVaultPath(vaultRoot, backupRel);
  await writeTextFile(path.join(backupDir, PAYLOAD_FILE), JSON.stringify(payload));
  if (backupDatabase) {
    try {
      await backupDatabase(path.join(backupDir, DB_BACKUP_FILE));
      log.push(`数据库已备份到 \`${backupRel}/${DB_BACKUP_FILE}\``);
    } catch (error) {
      throw new Error(`数据库备份失败，迁移已停止：${error.message}`);
    }
  }
  log.push(await gitSnapshot(runGit, vaultRoot, `迁移前快照 ${stamp}`, plan.scan.totalBytes));

  // 写暂存区并校验
  const writes = collectWrites(plan);
  const stagingRel = `${MIGRATION_DIR}/staging-${stamp}`;
  const stagingDir = resolveVaultPath(vaultRoot, stagingRel);
  for (const [index, write] of writes.entries()) {
    await writeOne(path.join(stagingDir, write.relativePath), write);
    onProgress({ phase: '写入暂存区', done: index + 1, total: writes.length });
  }
  onProgress({ phase: '校验' });
  for (const write of writes) {
    if (!(await verifyOne(path.join(stagingDir, write.relativePath), write))) {
      throw new Error(`校验失败：${write.relativePath}，迁移已停止，目标目录未改动`);
    }
  }

  // 移到目标位置
  const conflicts = [];
  const doneSteps = new Set();
  for (const [index, write] of writes.entries()) {
    const target = resolveVaultPath(vaultRoot, write.relativePath);
    const exists = await pathExists(target);
    if (exists && !write.overwrite) {
      const same = await verifyOne(target, write);
      if (!same) conflicts.push(write.relativePath);
    } else {
      markIgnored(target);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.rename(path.join(stagingDir, write.relativePath), target);
    }
    doneSteps.add(write.step);
    onProgress({ phase: '移到内容库', done: index + 1, total: writes.length });
  }
  for (const folder of plan.docs?.folders ?? []) {
    await fsp.mkdir(resolveVaultPath(vaultRoot, folder), { recursive: true });
  }
  if (plan.docs && !plan.blockers?.docs) doneSteps.add('docs');

  // Artifacts 旧导出挪走（不删）
  for (const move of plan.artifacts?.moves ?? []) {
    const to = resolveVaultPath(vaultRoot, move.to);
    if (await pathExists(to)) continue;
    await fsp.mkdir(path.dirname(to), { recursive: true });
    markIgnored(resolveVaultPath(vaultRoot, move.from));
    await fsp.rename(resolveVaultPath(vaultRoot, move.from), to);
  }
  if (plan.artifacts) doneSteps.add('artifacts');
  await fsp.rm(stagingDir, { recursive: true, force: true });

  // 状态 + 报告 + git
  const state = await readMigrationState(vaultRoot);
  const at = now.toISOString();
  doneSteps.forEach((step) => { state.steps[step] = { done: true, at, backup: backupRel }; });
  state.storageSource = 'files';
  state.migratedAt = at;
  await writeMigrationState(vaultRoot, state);
  log.push(await gitSnapshot(runGit, vaultRoot, `迁移到文件存储 ${stamp}`, plan.scan.totalBytes));

  const reportRel = `${MIGRATION_DIR}/report-${stamp}.md`;
  const report = [
    plan.report,
    '## 执行结果',
    '',
    `- 完成的步骤：${[...doneSteps].join('、') || '无'}`,
    `- 写入文件 ${writes.length - conflicts.length} 个`,
    ...conflicts.map((file) => `- ⚠️ 冲突未覆盖：\`${file}\``),
    ...log.map((line) => `- ${line}`),
    `- 旧数据库和 localStorage 都保留未删；设置里可以「切回旧存储」`,
    '',
  ].join('\n');
  await writeTextFile(resolveVaultPath(vaultRoot, reportRel), report);
  onProgress({ phase: '完成' });

  return {
    ok: true,
    steps: [...doneSteps],
    conflicts,
    blockers: plan.blockers,
    reportPath: reportRel,
    report,
    state,
    idToPath: plan.docs?.idToPath ?? {},
  };
}

const BUILTIN_DOCS_DIR = 'Projects/内置文档';

/**
 * 切回旧存储：改状态；内置文档目录挪到 .agent/migration/rollback-<时间>/（不删），
 * 避免和回灌进数据库的内置文档在侧栏里重复。数据回灌由 renderer 完成。
 */
export async function rollbackMigration({ vaultRoot, now = new Date(), markIgnored = () => {} }) {
  const state = await readMigrationState(vaultRoot);
  const docsDir = resolveVaultPath(vaultRoot, BUILTIN_DOCS_DIR);
  if (state.steps?.docs?.done && await pathExists(docsDir)) {
    const target = resolveVaultPath(vaultRoot, `${MIGRATION_DIR}/rollback-${buildStamp(now)}/内置文档`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    markIgnored(docsDir);
    await fsp.rename(docsDir, target);
    state.rollbackDocsPath = path.relative(vaultRoot, target).split(path.sep).join('/');
  }
  state.storageSource = 'legacy';
  state.rolledBackAt = now.toISOString();
  await writeMigrationState(vaultRoot, state);
  return state;
}
