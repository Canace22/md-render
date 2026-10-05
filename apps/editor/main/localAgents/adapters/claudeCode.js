/**
 * Claude Code 适配器：`claude -p --output-format stream-json --verbose`，prompt 走 stdin。
 * 系统提示走 --append-system-prompt（每轮都带，不进 Claude 的会话历史）。
 */
import { toClaudeMcpConfig } from '../mcpConfig.js';
import {
  TOOL_KINDS,
  appendText,
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

const LABEL = 'Claude Code';
const MCP_PREFIX = 'mcp__md-render__';
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS']);
const SEARCH_TOOLS = new Set(['WebFetch', 'WebSearch']);
// 纯内部记账的工具，不进步骤列表
const SILENT_TOOLS = new Set(['TodoWrite', 'ToolSearch']);

export const buildArgs = ({ prompt, model = '', sessionId = '', safeMode = false, readOnly = false, mcpLaunch = null, systemPrompt = '', contextText = '' }) => {
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  args.push(...(readOnly
    ? ['--permission-mode', 'plan', '--tools', 'Read,Glob,Grep,LS,WebSearch,WebFetch']
    : safeMode
      ? ['--permission-mode', 'acceptEdits']
      : ['--dangerously-skip-permissions']));
  if (model) args.push('--model', model);
  if (sessionId) args.push('--resume', sessionId);
  const appended = [systemPrompt, contextText].filter((part) => String(part ?? '').trim()).join('\n\n');
  if (appended) args.push('--append-system-prompt', appended);
  // --mcp-config 是变长参数，放最后，prompt 走 stdin 不会被它吞掉
  if (mcpLaunch) args.push('--mcp-config', toClaudeMcpConfig(mcpLaunch));
  return { args, stdin: String(prompt ?? '') };
};

export const describeClaudeTool = (name, input = {}) => {
  if (SILENT_TOOLS.has(name)) return null;
  if (name.startsWith(MCP_PREFIX)) return toolInfo(TOOL_KINDS.MCP, name.slice(MCP_PREFIX.length));
  if (EDIT_TOOLS.has(name)) return toolInfo(TOOL_KINDS.EDIT, name, input.file_path || input.notebook_path);
  if (name === 'Bash') return toolInfo(TOOL_KINDS.COMMAND, name, input.command);
  if (READ_TOOLS.has(name)) return toolInfo(TOOL_KINDS.READ, name, input.file_path || input.pattern || input.path);
  if (SEARCH_TOOLS.has(name)) return toolInfo(TOOL_KINDS.SEARCH, name, input.url || input.query);
  return toolInfo(TOOL_KINDS.OTHER, name);
};

const deniedNote = (denials = []) => {
  if (!denials.length) return '';
  const names = [...new Set(denials.map((item) => item?.tool_name).filter(Boolean))];
  return `\n\n> 安全模式拒绝了 ${denials.length} 个操作${names.length ? `（${names.join('、')}）` : ''}，可在设置里关闭安全模式后重试。`;
};

export const createParser = () => {
  const state = createParserState();

  const handleAssistant = (event) => {
    const content = event.message?.content ?? [];
    const events = [];
    // 子 agent 的文字不算最终答复，但它的改文件 / 跑命令要留痕
    if (!event.parent_tool_use_id) events.push(...appendText(state, textFromContent(content)));
    content.filter((part) => part?.type === 'tool_use').forEach((part) => {
      const tool = describeClaudeTool(String(part.name ?? ''), part.input ?? {});
      if (tool) events.push(startTool(state, part.id, tool));
    });
    return events;
  };

  const handleToolResults = (event) => (event.message?.content ?? [])
    .filter((part) => part?.type === 'tool_result' && state.calls.has(part.tool_use_id))
    .flatMap((part) => finishTool(state, part.tool_use_id, state.calls.get(part.tool_use_id), !part.is_error));

  const handleResult = (event) => {
    if (event.session_id) state.sessionId = event.session_id;
    if (event.is_error || (event.subtype && event.subtype !== 'success')) {
      return [errorEvent(state, event.result || (event.errors ?? []).join('\n') || `${LABEL} 执行失败：${event.subtype}`)];
    }
    const text = typeof event.result === 'string' && event.result.trim() ? event.result : state.lastText;
    return [doneEvent(state, `${text}${deniedNote(event.permission_denials)}`)];
  };

  const parseLine = (line) => {
    const event = parseJsonLine(line);
    if (!event) return [];
    if (event.type === 'system' && event.subtype === 'init') {
      state.sessionId = event.session_id ?? '';
      return state.sessionId ? [{ type: 'session', sessionId: state.sessionId }] : [];
    }
    if (event.type === 'assistant') return handleAssistant(event);
    if (event.type === 'user') return handleToolResults(event);
    if (event.type === 'result') return handleResult(event);
    return [];
  };

  const finish = (exit) => finishWithoutResult(state, { ...exit, label: LABEL });
  return { parseLine, finish, state };
};

export default { id: 'claude', label: LABEL, buildArgs, createParser };
