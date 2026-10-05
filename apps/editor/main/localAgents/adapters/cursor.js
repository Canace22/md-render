/**
 * Cursor 适配器：`agent -p --output-format stream-json`，prompt 走 stdin。
 * 不支持追加系统提示 → 拼在 prompt 开头；MCP 通过工作目录的 .cursor/mcp.json 注入（见 mcpConfig.js）。
 * 注意：Cursor 的 result.result 会把所有 assistant 文字串起来，最终答复取最后一次工具调用之后的文字。
 */
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
  textFromContent,
  toolInfo,
} from './common.js';

const LABEL = 'Cursor';
const TOOL_CALL_SUFFIX = 'ToolCall';
const EDIT_TOOLS = new Set(['editToolCall', 'writeToolCall', 'deleteToolCall']);
const READ_TOOLS = new Set(['readToolCall', 'globToolCall', 'grepToolCall', 'lsToolCall']);
const SEARCH_TOOLS = new Set(['webSearchToolCall', 'webFetchToolCall']);
const SILENT_TOOLS = new Set(['updateTodosToolCall', 'todoToolCall', 'askQuestionToolCall']);
const PERMISSION_PATTERN = /permission|denied|not allowed|unauthorized|rejected/i;

/** MCP 在工作目录 .cursor/mcp.json 里注入，运行前由 handler 写好 */
export const MCP_VIA_WORKSPACE_FILE = true;

export const buildArgs = ({ prompt, model = '', sessionId = '', safeMode = false, readOnly = false, cwd = '', systemPrompt = '', contextText = '' }) => {
  const args = ['-p', '--output-format', 'stream-json', '--trust', '--approve-mcps'];
  if (cwd) args.push('--workspace', cwd);
  if (readOnly) args.push('--mode', 'ask');
  else if (!safeMode) args.push('--force');
  if (model) args.push('--model', model);
  if (sessionId) args.push('--resume', sessionId);
  return { args, stdin: composePrompt({ prompt, systemPrompt, contextText, sessionId }) };
};

const firstToolEntry = (event) => Object.entries(event.tool_call ?? {})
  .find(([key, value]) => key.endsWith(TOOL_CALL_SUFFIX) && value && typeof value === 'object') ?? null;

const describeMcp = (args = {}) => {
  const server = args.providerIdentifier || args.serverName || args.server || '';
  const rawName = String(args.toolName || args.name || '');
  const name = rawName.replace(new RegExp(`^${MD_RENDER_MCP_SERVER}[-_.:]+`), '');
  return server === MD_RENDER_MCP_SERVER || rawName !== name
    ? toolInfo(TOOL_KINDS.MCP, name)
    : toolInfo(TOOL_KINDS.OTHER, [server, rawName].filter(Boolean).join('.') || 'mcp');
};

export const describeCursorTool = (key, call = {}) => {
  if (SILENT_TOOLS.has(key)) return null;
  const args = call.args ?? call.arguments ?? {};
  if (EDIT_TOOLS.has(key)) return toolInfo(TOOL_KINDS.EDIT, key, args.path);
  if (key === 'shellToolCall') return toolInfo(TOOL_KINDS.COMMAND, key, args.command);
  if (READ_TOOLS.has(key)) return toolInfo(TOOL_KINDS.READ, key, args.path || args.globPattern || args.pattern);
  if (SEARCH_TOOLS.has(key)) return toolInfo(TOOL_KINDS.SEARCH, key, args.url || args.query || args.searchTerm);
  if (key === 'mcpToolCall') return describeMcp(args);
  return toolInfo(TOOL_KINDS.OTHER, key);
};

const isCallOk = (call = {}) => {
  const result = call.result;
  if (!result) return true;
  if (result.success) return true;
  if (result.permissionDenied || result.rejected) return false;
  return !result.error;
};

const isPermissionDenied = (call = {}) => {
  const result = call.result ?? {};
  return Boolean(result.permissionDenied || result.rejected) || PERMISSION_PATTERN.test(JSON.stringify(result.error ?? ''));
};

export const createParser = () => {
  const state = createParserState();
  let deniedCount = 0;

  const handleToolCall = (event) => {
    const entry = firstToolEntry(event);
    if (!entry) return [];
    const [key, call] = entry;
    const tool = describeCursorTool(key, call);
    if (!tool) return [];
    if (event.subtype === 'started') return [startTool(state, event.call_id, tool)];
    if (event.subtype !== 'completed') return [];
    if (isPermissionDenied(call)) deniedCount += 1;
    return finishTool(state, event.call_id, tool, isCallOk(call));
  };

  const handleResult = (event) => {
    if (event.session_id) state.sessionId = event.session_id;
    if (event.is_error || (event.subtype && event.subtype !== 'success')) {
      return [errorEvent(state, event.error?.message || event.result || `${LABEL} 执行失败`)];
    }
    const text = state.lastText || (typeof event.result === 'string' ? event.result : '');
    const note = deniedCount ? `\n\n> 安全模式拒绝了 ${deniedCount} 个操作，可在设置里关闭安全模式后重试。` : '';
    return [doneEvent(state, `${text}${note}`)];
  };

  const parseLine = (line) => {
    const event = parseJsonLine(line);
    if (!event) return [];
    if (event.type === 'system' && event.subtype === 'init') {
      state.sessionId = event.session_id ?? '';
      return state.sessionId ? [{ type: 'session', sessionId: state.sessionId }] : [];
    }
    if (event.type === 'assistant') return appendText(state, textFromContent(event.message?.content));
    if (event.type === 'tool_call') return handleToolCall(event);
    if (event.type === 'result') return handleResult(event);
    if (event.type === 'error') {
      state.lastError = event.message || event.error?.message || String(event.error ?? '');
      return [];
    }
    return [];
  };

  const finish = (exit) => finishWithoutResult(state, { ...exit, label: LABEL });
  return { parseLine, finish, state };
};

export default { id: 'cursor', label: LABEL, buildArgs, createParser, mcpViaWorkspaceFile: MCP_VIA_WORKSPACE_FILE };
