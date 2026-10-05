import { execFile } from 'node:child_process';
import { getMdRenderRootPath } from '../localProject.js';
import { backupDatabase, rebuildIndexFromWorkspace } from '../database.js';
import { planMigration } from '../migration/planMigration.js';
import { executeMigration, rollbackMigration } from '../migration/executeMigration.js';
import { ensureFrontmatterIds } from '../migration/frontmatterIds.js';
import {
  readCanvasFiles,
  readDailyFiles,
  readVaultText,
  writeVaultText,
} from '../migration/vaultFiles.js';
import { getMigrationStateCache, isStepOnFilesCached, refreshMigrationStateCache, setMigrationStateCache } from '../migration/stateCache.js';
import { appendActivityEntry, getAgentDataDir } from '../capabilities/agentDataFiles.js';
import { buildActivityEntry } from '../../shared/capabilities/activity.js';

const GIT_TIMEOUT_MS = 120000;

const runGit = (args, cwd) => new Promise((resolve, reject) => {
  execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS }, (error) => (error ? reject(error) : resolve()));
});

const gitAvailable = () => new Promise((resolve) => {
  execFile('git', ['--version'], (error) => resolve(!error));
});

const wrap = (fn) => async (_event, payload = {}) => {
  try {
    return { ok: true, ...(await fn(payload)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

/** 预演结果里去掉正文和图片，只回传给向导展示用的摘要 */
const summarizePlan = (plan) => ({
  report: plan.report,
  blockers: plan.blockers,
  steps: plan.steps,
  stats: {
    docs: plan.docs?.docs.length ?? 0,
    renames: plan.docs?.renames.length ?? 0,
    assets: plan.docs?.assetStats.count ?? 0,
    days: plan.daily?.dayCount ?? 0,
    vaultBytes: plan.scan.totalBytes,
  },
});

/**
 * 数据层文件化：迁移预演 / 执行 / 回滚，以及迁移后 Daily、白板、编辑部记忆的文件读写。
 */
export function registerMigrationHandlers({
  ipcMain,
  getMainWindow,
  markLocalProjectWriteIgnored = () => {},
  getVaultRoot = getMdRenderRootPath,
}) {
  refreshMigrationStateCache(getVaultRoot());

  ipcMain.handle('migration:state', wrap(async () => ({ state: await refreshMigrationStateCache(getVaultRoot()) })));

  ipcMain.handle('migration:plan', wrap(async ({ payload, steps }) => summarizePlan(
    await planMigration({ payload, vaultRoot: getVaultRoot(), steps }),
  )));

  ipcMain.handle('migration:execute', wrap(async ({ payload, steps }) => {
    const result = await executeMigration({
      payload,
      steps,
      vaultRoot: getVaultRoot(),
      backupDatabase,
      runGit: (await gitAvailable()) ? runGit : null,
      markIgnored: markLocalProjectWriteIgnored,
      onProgress: (progress) => getMainWindow?.()?.webContents?.send('migration:progress', progress),
    });
    setMigrationStateCache(result.state);
    return result;
  }));

  ipcMain.handle('migration:rollback', wrap(async () => {
    const state = await rollbackMigration({ vaultRoot: getVaultRoot() });
    setMigrationStateCache(state);
    return { state };
  }));

  ipcMain.handle('vault:read-text', wrap(async ({ relativePath }) => ({
    content: await readVaultText(getVaultRoot(), relativePath),
  })));

  ipcMain.handle('vault:write-text', wrap(async ({ relativePath, content }) => ({
    filePath: await writeVaultText(getVaultRoot(), relativePath, content, { onBeforeWrite: markLocalProjectWriteIgnored }),
  })));

  ipcMain.handle('vault:read-daily', wrap(async () => readDailyFiles(getVaultRoot())));
  ipcMain.handle('vault:read-canvas', wrap(async () => readCanvasFiles(getVaultRoot())));

  // 外部新建的 Markdown 补 frontmatter id（内置文档迁到文件后才做），并记活动日志
  ipcMain.handle('vault:ensure-ids', wrap(async () => {
    if (!isStepOnFilesCached('docs')) return { fixed: [] };
    const vaultRoot = getVaultRoot();
    const fixed = await ensureFrontmatterIds(vaultRoot, { markIgnored: markLocalProjectWriteIgnored });
    await Promise.all(fixed.map((relativePath) => appendActivityEntry(getAgentDataDir(vaultRoot), buildActivityEntry({
      who: 'external', tool: 'ensure_doc_id', args: { id: relativePath }, result: `补写 frontmatter id：${relativePath}`,
    }))));
    return { fixed };
  }));

  // M-base-2：从当前工作区重建索引
  ipcMain.handle('db:rebuild-index', wrap(async ({ workspaceJson }) => {
    rebuildIndexFromWorkspace(JSON.parse(workspaceJson));
    return {};
  }));

  return { getState: getMigrationStateCache };
}
