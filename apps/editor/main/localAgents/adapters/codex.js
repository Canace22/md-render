/**
 * Codex 适配器：`codex exec --json`，prompt 走 stdin（参数 `-`）。
 * 事件参考 codex exec 的 JSONL：thread.started / item.started / item.completed / turn.completed / turn.failed / error。
 */
import { toCodexConfigArgs } from '../mcpConfig.js';
import {
  MD_RENDER_MCP_SERVER,
  TOOL_KINDS,
  appendText,
  composePrompt,
  createParserState,
  doneEvent,
  errorEvent,
  finishTool,
  finishWithoutResult,
  parseJsonLine,
  startTool,
  toolInfo,
} from './common.js';

const LABEL = 'Codex';
const STDIN_PROMPT = '-';
// Codex 断线重连时会发 error 事件但还会继续，不能当成失败
const RETRY_PATTERN = /reconnect|retrying|stream disconnected/i;

export const buildArgs = ({ prompt, model = '', effort = '', sessionId = '', safeMode = false, readOnly = false, mcpLaunch = null, systemPrompt = '', contextText = '' }) => {
  const args = ['exec', '--json', '--skip-git-repo-check'];
  args.push(...(readOnly
    ? ['--sandbox', 'read-only']
    : safeMode
      ? ['--sandbox', 'workspace-write']
      : ['--dangerously-bypass-approvals-and-sandbox']));
  if (model) args.push('-m', model);
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  if (mcpLaunch) args.push(...toCodexConfigArgs(mcpLaunch));
  if (sessionId) args.push('resume', sessionId);
  args.push(STDIN_PROMPT);
  return { args, stdin: composePrompt({ prompt, systemPrompt, contextText, sessionId }) };
};

const describeItem = (item) => {
  switch (item?.type) {
    case 'command_execution':
      return toolInfo(TOOL_KINDS.COMMAND, 'shell', item.command);
    case 'file_change':
      return toolInfo(TOOL_KINDS.EDIT, 'file_change', (item.changes ?? []).map((change) => change?.path).filter(Boolean).join('、'));
    case 'mcp_tool_call':
      return item.server === MD_RENDER_MCP_SERVER
        ? toolInfo(TOOL_KINDS.MCP, item.tool)
        : toolInfo(TOOL_KINDS.OTHER, `${item.server}.${item.tool}`);
    case 'web_search':
      return toolInfo(TOOL_KINDS.SEARCH, 'web_search', item.query);
    default:
      return null;
  }
};

const isItemOk = (item) => {
  if (item.type === 'command_execution') return item.status !== 'failed' && item.status !== 'declined' && (item.exit_code ?? 0) === 0;
  if (item.type === 'mcp_tool_call') return item.status !== 'failed' && !item.error;
  return item.status !== 'failed' && item.status !== 'declined';
};

export const createParser = () => {
  const state = createParserState();

  const parseLine = (line) => {
    const event = parseJsonLine(line);
    if (!event) return [];
    const item = event.item ?? {};
    switch (event.type) {
      case 'thread.started':
        state.sessionId = event.thread_id ?? '';
        return state.sessionId ? [{ type: 'session', sessionId: state.sessionId }] : [];
      case 'item.started': {
        const tool = describeItem(item);
        return tool ? [startTool(state, item.id, tool)] : [];
      }
      case 'item.completed': {
        if (item.type === 'agent_message') return appendText(state, item.text);
        if (item.type === 'error') {
          state.lastError = item.message ?? state.lastError;
          return [];
        }
        const tool = describeItem(item);
        return tool ? finishTool(state, item.id, tool, isItemOk(item)) : [];
      }
      case 'turn.completed':
        return [doneEvent(state, state.lastText)];
      case 'turn.failed':
        return [errorEvent(state, event.error?.message || state.lastError)];
      case 'error':
        if (!RETRY_PATTERN.test(event.message ?? '')) state.lastError = event.message ?? '';
        return [];
      default:
        return [];
    }
  };

  const finish = (exit) => finishWithoutResult(state, { ...exit, label: LABEL });
  return { parseLine, finish, state };
};

export default { id: 'codex', label: LABEL, buildArgs, createParser };
