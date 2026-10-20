/**
 * 本地 agent 客户端（L1-7 / L1-9 / L1-10）：和 runAgent 同签名、同返回值。
 *
 * 一整轮交给本机 CLI（Codex / Claude Code / Cursor）跑：
 *   runLocalAgent → IPC local-agent:run → 主进程 spawn → JSONL → 统一事件 → 这里转成 runAgent 的 onEvent。
 * agent 自己的改文件 / 跑命令也映射成 tool_start / tool_done，并写进活动记录。
 * md-render 工具（mcp）走控制桥，活动记录由桥那边记，这里不重复记。
 */

import { getLocalAgent } from '@shared/localAgents.js';
import { ENGINE_RULES } from './agentEngine.js';
import { AGENT_INSTRUCTIONS } from './appKnowledge.js';
import { recordToolActivity } from './activityLog.js';
import { formatTaskContextPacket } from './taskContext.js';
import { getToolLabel } from './toolRegistry.js';
import { findNodeById } from '../../store/workspaceUtils.js';

const LABEL_TARGET_MAX = 40;
/** 只有改动类步骤进活动记录 */
const LOGGED_KINDS = new Set(['edit', 'command']);

// 本地 agent 和 app 内 AI 的差异：能直接读写工作目录里的文件、跑命令
const LOCAL_AGENT_RULES = [
  '你运行在用户本机，当前工作目录是用户的本地项目或 md-render 内容库，可以直接读写其中的文件、运行命令。',
  '工作目录里的 .md 文件改完就会同步到 md-render；不在工作目录里的 md-render 内容（当前打开的文档、速记、白板等）用 md-render 工具读写。',
  '删除文件、批量改动前先说明要做什么。',
].join('\n');

export const hasLocalAgentBridge = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.localAgent?.run === 'function';

/** 系统提示：和 app 内 AI 同源（ENGINE_RULES + AGENT_INSTRUCTIONS），再加本地 agent 的说明 */
export const buildLocalAgentSystemPrompt = () => [ENGINE_RULES, AGENT_INSTRUCTIONS, LOCAL_AGENT_RULES].join('\n\n');

const baseName = (target) => String(target ?? '').split(/[\\/]/).filter(Boolean).pop() || String(target ?? '');

const clip = (text, max = LABEL_TARGET_MAX) => {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

/** 步骤标签：改文件 xxx.md / 运行命令 / 读文件 / 搜索 / md-render 工具的中文名 */
export const getLocalToolLabel = (tool = {}) => {
  const target = tool.target ?? '';
  switch (tool.kind) {
    case 'edit': return target ? `改文件 ${clip(baseName(target))}` : '改文件';
    case 'command': return target ? `运行命令 ${clip(target)}` : '运行命令';
    case 'read': return target ? `读文件 ${clip(baseName(target))}` : '读文件';
    case 'search': return target ? `搜索 ${clip(target)}` : '搜索';
    case 'mcp': return getToolLabel(tool.name);
    default: return tool.name || '工具';
  }
};

/** tool_done 的 result：失败给 { ok:false } 让面板标红；成功给空串 */
const toToolResult = (ok, tool) => (ok ? '' : JSON.stringify({ ok: false, error: `${getLocalToolLabel(tool)} 失败` }));

/** 改动类步骤写活动记录，来源标注 agent 名 */
export const recordLocalToolActivity = ({ agentLabel, tool, ok }) => {
  if (!LOGGED_KINDS.has(tool?.kind)) return null;
  const name = tool.kind === 'edit' ? 'local_agent_edit_file' : 'local_agent_run_command';
  const summary = `${agentLabel} ${getLocalToolLabel(tool)}`;
  return recordToolActivity({
    who: 'local-agent',
    client: agentLabel,
    name,
    args: tool.kind === 'edit' ? { path: tool.target } : {},
    result: ok ? summary : JSON.stringify({ ok: false, error: `${summary} 失败` }),
  });
};

const collectMountedRoots = (node, roots = []) => {
  if (!node) return roots;
  if (node.localProjectRoot && node.projectRootPath) roots.push(node);
  (node.type === 'folder' ? node.children ?? [] : []).forEach((child) => collectMountedRoots(child, roots));
  return roots;
};

/**
 * 本地 agent 的项目目录（L1-2）：选中的文档在哪个挂载的本地项目里就用哪个；
 * 只挂了一个项目就用它；否则返回空串，由主进程退回内容库根目录。
 */
export const pickAgentProjectRoot = (workspace, selectedId) => {
  const roots = collectMountedRoots(workspace);
  const owner = selectedId ? roots.find((root) => findNodeById(root, selectedId)) : null;
  if (owner) return owner.projectRootPath;
  return roots.length === 1 ? roots[0].projectRootPath : '';
};

/** 把 renderer 的会话历史追加一轮，供切回 API 服务商时复用 */
const appendHistory = (history, userInput, finalText) => [
  ...history,
  { role: 'user', content: String(userInput ?? '') },
  { role: 'assistant', content: finalText },
];

let runSeq = 0;
const nextRunId = () => `local-${Date.now()}-${(runSeq += 1)}`;

/**
 * 把主进程事件翻译成 runAgent 的事件；返回 true 表示这一轮结束。
 * 纯逻辑（不碰 IPC），方便单测。
 */
export const createLocalEventTranslator = ({ agentLabel, onEvent, onActivity = recordLocalToolActivity }) => {
  const state = { step: 0, sessionId: '', finalText: '', error: null, notice: '', cwd: '' };
  const handle = (event = {}) => {
    switch (event.type) {
      case 'run_info':
        state.cwd = event.cwd ?? '';
        state.notice = event.notice ?? '';
        return false;
      case 'session':
        state.sessionId = event.sessionId || state.sessionId;
        return false;
      case 'assistant_text':
        onEvent({ type: 'assistant_text', text: event.text });
        return false;
      case 'tool_start':
        state.step += 1;
        onEvent({ type: 'tool_start', callId: event.callId, name: event.tool?.name, label: getLocalToolLabel(event.tool), step: state.step, tool: event.tool });
        return false;
      case 'tool_done':
        onActivity({ agentLabel, tool: event.tool, ok: event.ok });
        onEvent({
          type: 'tool_done',
          callId: event.callId,
          name: event.tool?.name,
          label: getLocalToolLabel(event.tool),
          step: state.step,
          args: JSON.stringify({ target: event.tool?.target ?? '' }),
          result: toToolResult(event.ok, event.tool),
          tool: event.tool,
        });
        return false;
      case 'done':
        state.sessionId = event.sessionId || state.sessionId;
        state.finalText = event.finalText ?? '';
        onEvent({ type: 'done', finalText: state.finalText });
        return true;
      case 'error':
        state.error = event;
        return true;
      default:
        return false;
    }
  };
  return { handle, state };
};

const NETWORK_HINT = '请求被拒绝或连不上服务，多半是代理没生效：确认 ~/.zshrc 或 ~/.zprofile 里导出了 https_proxy，然后完全退出 md-render 再打开';

/** 报错文案：疑似网络/代理问题附代理指引，疑似没登录附登录指引 */
export const formatLocalAgentError = (agentId, error) => {
  const agent = getLocalAgent(agentId);
  const message = String(error?.message ?? error ?? '').trim() || `${agent?.label ?? '本地 agent'} 执行失败`;
  if (error?.network) return `${message}\n\n${NETWORK_HINT}`;
  return error?.auth && agent?.loginHint ? `${message}\n\n${agent.loginHint}` : message;
};

/**
 * 运行一轮本地 agent。
 * @param {object} params           同 runAgent；config 换成本地 agent 的配置
 * @param {object} params.config    { agentId, model, effort, safeMode, externalSessionId, projectRoot }
 * @returns {Promise<{ finalText: string, history: Array, externalSessionId: string, cwd: string }>}
 */
export const runLocalAgent = async ({
  userInput,
  history = [],
  config,
  onEvent = () => {},
  signal,
  taskContext = null,
  allowedTools = null,
  modeSystemPrompt = '',
}) => {
  if (!hasLocalAgentBridge()) throw new Error('本地 agent 只在桌面版可用');
  if (signal?.aborted) throw new Error('已取消');
  const api = window.electronAPI.localAgent;
  const agentId = config?.agentId;
  const agentLabel = getLocalAgent(agentId)?.label ?? agentId;
  const runId = nextRunId();
  const translator = createLocalEventTranslator({ agentLabel, onEvent });

  const unsubscribe = api.onEvent((payload) => {
    if (payload?.runId === runId) translator.handle(payload.event);
  });
  const onAbort = () => { api.cancel({ runId }); };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await api.run({
      runId,
      agentId,
      prompt: String(userInput ?? ''),
      model: config?.model || '',
      effort: config?.effort || '',
      sessionId: config?.externalSessionId || '',
      safeMode: Boolean(config?.safeMode),
      readOnly: Boolean(config?.readOnly),
      projectRoot: config?.projectRoot || '',
      systemPrompt: [buildLocalAgentSystemPrompt(), modeSystemPrompt]
        .filter((part) => String(part ?? '').trim())
        .join('\n\n'),
      contextText: formatTaskContextPacket(taskContext),
      allowedTools,
    });
    if (signal?.aborted || res?.cancelled) throw new Error('已取消');
    if (!res?.ok) throw new Error(res?.error || `${agentLabel} 启动失败`);
    const { state } = translator;
    if (state.error) throw new Error(formatLocalAgentError(agentId, state.error));
    const finalText = state.notice ? `${state.finalText}\n\n> ${state.notice}` : state.finalText;
    return {
      finalText,
      history: appendHistory(history, userInput, finalText),
      externalSessionId: state.sessionId,
      cwd: state.cwd || res.cwd || '',
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    unsubscribe?.();
  }
};
