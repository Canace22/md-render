/**
 * 适配器公用：把各家 agent 的 JSONL 统一成 md-render 的事件。
 *
 * 统一事件（main → renderer）：
 *   { type: 'session', sessionId }                       拿到外部会话 id（续会话用）
 *   { type: 'assistant_text', text }                     agent 的文字
 *   { type: 'tool_start', callId, tool }                 tool = { kind, name, target }
 *   { type: 'tool_done', callId, tool, ok }
 *   { type: 'done', finalText, sessionId }
 *   { type: 'error', message, auth }                     auth=true 表示疑似未登录
 * kind：edit 改文件 / command 跑命令 / read 读文件 / search 搜索 / mcp md-render 工具 / other
 */

export const TOOL_KINDS = Object.freeze({
  EDIT: 'edit',
  COMMAND: 'command',
  READ: 'read',
  SEARCH: 'search',
  MCP: 'mcp',
  OTHER: 'other',
});

export const MD_RENDER_MCP_SERVER = 'md-render';
const TARGET_MAX_CHARS = 200;
const AUTH_ERROR_PATTERN = /\/login|not logged in|log ?in required|authenticat|invalid api key|api key|oauth|unauthorized|\b401\b|credential/i;

export const isAuthError = (text) => AUTH_ERROR_PATTERN.test(String(text ?? ''));

export const clipTarget = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > TARGET_MAX_CHARS ? `${text.slice(0, TARGET_MAX_CHARS - 1)}…` : text;
};

export const toolInfo = (kind, name, target = '') => ({ kind, name: String(name ?? ''), target: clipTarget(target) });

export const parseJsonLine = (line) => {
  const text = String(line ?? '').trim();
  if (!text.startsWith('{')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const textFromContent = (content) => (Array.isArray(content) ? content : [])
  .filter((part) => part?.type === 'text' && part.text)
  .map((part) => part.text)
  .join('\n');

/**
 * 解析器状态：记住在途工具（tool_done 要带上 tool 信息）、最后一段文字、会话 id、是否已结束。
 * lastText 是「最后一次工具调用之后」的文字，作为最终答复。
 */
export const createParserState = () => ({
  sessionId: '',
  calls: new Map(),
  lastText: '',
  finished: false,
  lastError: '',
});

export const startTool = (state, callId, tool) => {
  state.calls.set(callId, tool);
  state.lastText = '';
  return { type: 'tool_start', callId, tool };
};

/** 结束工具；没见过 start 的（有的 agent 只发 completed）先补一条 start */
export const finishTool = (state, callId, tool, ok) => {
  const known = state.calls.get(callId);
  const events = known ? [] : [startTool(state, callId, tool)];
  state.calls.delete(callId);
  events.push({ type: 'tool_done', callId, tool: known ?? tool, ok: Boolean(ok) });
  return events;
};

export const appendText = (state, text) => {
  if (!text) return [];
  state.lastText = state.lastText ? `${state.lastText}\n\n${text}` : text;
  return [{ type: 'assistant_text', text }];
};

export const doneEvent = (state, finalText) => {
  state.finished = true;
  return { type: 'done', finalText: String(finalText ?? '').trim(), sessionId: state.sessionId };
};

export const errorEvent = (state, message) => {
  state.finished = true;
  const text = String(message ?? '').trim() || '本地 agent 执行失败';
  return { type: 'error', message: text, auth: isAuthError(text) };
};

const STDERR_TAIL_CHARS = 600;

/** 进程退出但没收到结束事件：按退出码 / stderr 兜底 */
export const finishWithoutResult = (state, { code, signal, stderr = '', label }) => {
  if (state.finished) return [];
  const tail = String(stderr).trim().slice(-STDERR_TAIL_CHARS);
  if (code === 0 && !signal && state.lastText) return [doneEvent(state, state.lastText)];
  const reason = state.lastError || tail || `${label} 异常退出（${signal || code}）`;
  return [errorEvent(state, reason)];
};

/**
 * 不支持追加系统提示的 agent：把规则拼在 prompt 开头。
 * 续会话时规则已在对方的历史里，只带本轮上下文，省 token。
 */
export const composePrompt = ({ prompt, systemPrompt = '', contextText = '', sessionId = '' }) => {
  const preamble = [sessionId ? '' : systemPrompt, contextText]
    .filter((part) => String(part ?? '').trim())
    .join('\n\n');
  return preamble ? `${preamble}\n\n---\n\n${prompt}` : String(prompt ?? '');
};
