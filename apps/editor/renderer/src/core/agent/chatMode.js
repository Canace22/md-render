export const AGENT_SESSION_MODES = Object.freeze({
  CHAT: 'chat',
  WRITE: 'write',
});

export const DEFAULT_AGENT_SESSION_MODE = AGENT_SESSION_MODES.CHAT;

export const CHAT_MODE_ALLOWED_TOOLS = Object.freeze([
  'read_url',
  'search_docs',
  'recall_related_docs',
  'search_external_knowledge',
  'list_recent_docs',
  'get_workspace_brief',
]);

export const CHAT_MODE_SYSTEM_PROMPT = [
  '当前会话处于聊天模式。',
  '以讨论、发散和追问为主，帮助用户澄清想法。',
  '用户没有明确要求时，不要主动给出完整成稿，也不要主动提议或尝试修改文档。',
].join('\n');

export const normalizeAgentSessionMode = (mode) => (
  mode === AGENT_SESSION_MODES.WRITE ? AGENT_SESSION_MODES.WRITE : DEFAULT_AGENT_SESSION_MODE
);

/** skill 是显式写作动作：保留它自己的工具白名单，不再叠加聊天模式限制。 */
export const resolveAgentTurnMode = ({
  mode,
  allowedTools = null,
  isSkillRun = false,
} = {}) => {
  const sessionMode = normalizeAgentSessionMode(mode);
  if (isSkillRun) {
    return {
      mode: AGENT_SESSION_MODES.WRITE,
      includeActiveDoc: true,
      allowedTools,
      systemPrompt: '',
    };
  }
  if (sessionMode === AGENT_SESSION_MODES.WRITE) {
    return {
      mode: sessionMode,
      includeActiveDoc: true,
      allowedTools,
      systemPrompt: '',
    };
  }
  return {
    mode: sessionMode,
    includeActiveDoc: false,
    allowedTools: [...CHAT_MODE_ALLOWED_TOOLS],
    systemPrompt: CHAT_MODE_SYSTEM_PROMPT,
  };
};

/** API 会话把模式说明作为 system message 插入；runAgent 返回历史时会自动剔除。 */
export const appendModeSystemMessage = (history = [], systemPrompt = '') => (
  systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...history]
    : history
);
