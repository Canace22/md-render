/**
 * 本地 agent IPC（L0-5）：检测、模型列表、运行一轮、停止。
 *
 * 运行时事件走 `local-agent:event`（{ runId, event }），invoke 本身在进程退出后才返回。
 * 主进程只负责拼参数、起进程、转事件；会话、UI、活动记录都在 renderer。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HANDSHAKE_FILE_NAME } from '../agentBridge.js';
import { getMdRenderRootPath } from '../localProject.js';
import { getAdapter } from '../localAgents/adapters/index.js';
import { detectLocalAgents, getDetectedAgent } from '../localAgents/detect.js';
import {
  buildMcpLaunchConfig,
  findMcpBridgeScript,
  writeCursorMcpConfig,
} from '../localAgents/mcpConfig.js';
import { listLocalAgentModels } from '../localAgents/models.js';
import { startLocalAgentRun } from '../localAgents/runner.js';
import { getAgentEnv } from '../localAgents/shellEnv.js';
import { resolveWorkDir } from '../localAgents/workDir.js';

export const LOCAL_AGENT_EVENT_CHANNEL = 'local-agent:event';

const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));
// effort 会拼进 Codex 的 `-c key="value"`，只放行纯小写单词（low / xhigh / max …）
const EFFORT_PATTERN = /^[a-z]+$/;

/** 在途运行：runId → { cancel, done } */
const activeRuns = new Map();

/** 退出 app 前停掉所有本地 agent 进程 */
export const cancelAllLocalAgentRuns = () => Promise.all(
  [...activeRuns.values()].map((run) => run.cancel().catch(() => {})),
);

const wrap = (fn) => async (event, payload = {}) => {
  try {
    return { ok: true, ...(await fn(payload, event)) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};

const buildLaunch = ({ app, allowedTools }) => buildMcpLaunchConfig({
  execPath: process.execPath,
  scriptPath: findMcpBridgeScript({ isPackaged: app?.isPackaged, mainDir: MAIN_DIR }),
  bridgeFile: app ? path.join(app.getPath('userData'), HANDSHAKE_FILE_NAME) : '',
  allowedTools,
});

/** Cursor 只能从工作目录的 .cursor/mcp.json 读 MCP；写失败不阻断本轮，给一条提示 */
const prepareMcp = async ({ adapter, cwd, launch }) => {
  if (!launch) return { mcpLaunch: null, notice: '没找到 md-render MCP 脚本，本轮 agent 用不了 md-render 工具' };
  if (!adapter.mcpViaWorkspaceFile) return { mcpLaunch: launch, notice: '' };
  const written = await writeCursorMcpConfig(cwd, launch);
  return { mcpLaunch: null, notice: written.ok ? '' : written.error };
};

export function registerLocalAgentHandlers({
  ipcMain,
  app,
  getVaultRoot = getMdRenderRootPath,
}) {
  ipcMain.handle('local-agent:detect', wrap(async ({ refresh = false }) => ({
    agents: await detectLocalAgents({ refresh: Boolean(refresh) }),
  })));

  ipcMain.handle('local-agent:models', wrap(async ({ id }) => {
    const detected = await getDetectedAgent(id);
    return listLocalAgentModels({ id, binPath: detected?.path ?? '' });
  }));

  ipcMain.handle('local-agent:run', wrap(async (payload, event) => {
    const { runId, agentId, projectRoot = '', allowedTools = null } = payload;
    if (!runId) throw new Error('缺少 runId');
    if (activeRuns.has(runId)) throw new Error('这一轮已经在运行');
    const adapter = getAdapter(agentId);
    if (!adapter) throw new Error(`还不支持 ${agentId}`);
    const detected = await getDetectedAgent(agentId);
    if (!detected?.path) throw new Error(`没检测到 ${adapter.label}，请在设置里重新检测`);

    const workDir = resolveWorkDir({ projectRoot, vaultRoot: getVaultRoot() });
    if (!workDir.ok) throw new Error(workDir.error);
    const { cwd } = workDir;
    const { mcpLaunch, notice } = await prepareMcp({ adapter, cwd, launch: buildLaunch({ app, allowedTools }) });
    const effort = EFFORT_PATTERN.test(String(payload.effort ?? '')) ? payload.effort : '';
    const { args, stdin } = adapter.buildArgs({ ...payload, effort, cwd, mcpLaunch });

    const send = (agentEvent) => {
      if (!event.sender.isDestroyed()) event.sender.send(LOCAL_AGENT_EVENT_CHANNEL, { runId, event: agentEvent });
    };
    send({ type: 'run_info', cwd, cwdSource: workDir.source, notice });

    const run = startLocalAgentRun({
      command: detected.path,
      args,
      cwd,
      env: await getAgentEnv(),
      stdin,
      parser: adapter.createParser(),
      onEvent: send,
    });
    activeRuns.set(runId, run);
    try {
      return { ...(await run.done), cwd };
    } finally {
      activeRuns.delete(runId);
    }
  }));

  ipcMain.handle('local-agent:cancel', wrap(async ({ runId }) => {
    const run = activeRuns.get(runId);
    if (run) await run.cancel();
    return { cancelled: Boolean(run) };
  }));
}
