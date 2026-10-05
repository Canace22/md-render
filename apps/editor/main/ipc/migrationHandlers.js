import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const GIT_TIMEOUT_MS = 120000;
const AGENTS_MD = 'AGENTS.md';
const HANDSHAKE_FILE = 'agent-bridge.json';

/** 开发环境下仓库里的 mcp-bridge 入口（打包版不带，返回空，界面里让用户自己填路径） */
const findMcpBridgeEntry = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../server/mcp-bridge/index.js'),
    path.resolve(here, '../../../../server/mcp-bridge/index.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
};

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
  app,
  getMainWindow,
  openPath = async () => '',
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
    const state = await rollbackMigration({ vaultRoot: getVaultRoot(), markIgnored: markLocalProjectWriteIgnored });
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

  // 外部新建的 Markdown 补 frontmatter id（内置文档迁到文件后才做）
  ipcMain.handle('vault:ensure-ids', wrap(async () => {
    if (!isStepOnFilesCached('docs')) return { fixed: [] };
    const vaultRoot = getVaultRoot();
    // 活动日志由 renderer 记（同时刷新活动页）
    const fixed = await ensureFrontmatterIds(vaultRoot, { markIgnored: markLocalProjectWriteIgnored });
    return { fixed };
  }));

  // M-base-2：从当前工作区重建索引
  ipcMain.handle('db:rebuild-index', wrap(async ({ workspaceJson }) => {
    rebuildIndexFromWorkspace(JSON.parse(workspaceJson));
    return {};
  }));

  // 设置 → 外部 agent 接入（U8）：内容库路径、MCP 配置要用的路径
  ipcMain.handle('vault:agent-info', wrap(async () => {
    const vaultRoot = getVaultRoot();
    return {
      vaultRoot,
      agentsMdPath: path.join(vaultRoot, AGENTS_MD),
      agentsMdExists: fs.existsSync(path.join(vaultRoot, AGENTS_MD)),
      mcpBridgeEntry: findMcpBridgeEntry(),
      handshakePath: app ? path.join(app.getPath('userData'), HANDSHAKE_FILE) : '',
    };
  }));

  // 打开内容库根目录或 AGENTS.md（只允许这两个）
  ipcMain.handle('vault:open', wrap(async ({ target }) => {
    const vaultRoot = getVaultRoot();
    const targetPath = target === 'agents-md' ? path.join(vaultRoot, AGENTS_MD) : vaultRoot;
    const error = await openPath(targetPath);
    if (error) throw new Error(error);
    return {};
  }));

  return { getState: getMigrationStateCache };
}
