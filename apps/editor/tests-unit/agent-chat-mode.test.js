import { describe, expect, it } from 'vitest';
import {
  AGENT_SESSION_MODES,
  CHAT_MODE_ALLOWED_TOOLS,
  CHAT_MODE_SYSTEM_PROMPT,
  appendModeSystemMessage,
  resolveAgentTurnMode,
} from '../renderer/src/core/agent/chatMode.js';
import {
  createSession,
  resolveLocalAgentSession,
} from '../renderer/src/core/agent/sessionUtils.js';

describe('agent 会话模式', () => {
  it('新会话默认是聊天模式', () => {
    expect(createSession().mode).toBe(AGENT_SESSION_MODES.CHAT);
  });

  it('聊天模式不带当前稿件，只开放只读工具', () => {
    const config = resolveAgentTurnMode({ mode: AGENT_SESSION_MODES.CHAT });
    expect(config.includeActiveDoc).toBe(false);
    expect(config.allowedTools).toEqual(CHAT_MODE_ALLOWED_TOOLS);
    expect(config.allowedTools).not.toContain('write_active_doc');
    expect(config.systemPrompt).toBe(CHAT_MODE_SYSTEM_PROMPT);
  });

  it('写作模式保留现有上下文与工具行为', () => {
    expect(resolveAgentTurnMode({ mode: AGENT_SESSION_MODES.WRITE })).toMatchObject({
      includeActiveDoc: true,
      allowedTools: null,
      systemPrompt: '',
    });
  });

  it('聊天会话里显式运行 skill 时沿用 skill 白名单', () => {
    const skillTools = ['read_active_doc', 'create_agent_artifact'];
    expect(resolveAgentTurnMode({
      mode: AGENT_SESSION_MODES.CHAT,
      allowedTools: skillTools,
      isSkillRun: true,
    })).toMatchObject({
      mode: AGENT_SESSION_MODES.WRITE,
      includeActiveDoc: true,
      allowedTools: skillTools,
      systemPrompt: '',
    });
  });

  it('聊天说明作为 system message 追加，不改原历史', () => {
    const history = [{ role: 'user', content: '聊聊选题' }];
    const next = appendModeSystemMessage(history, CHAT_MODE_SYSTEM_PROMPT);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ role: 'system', content: CHAT_MODE_SYSTEM_PROMPT });
    expect(history).toHaveLength(1);
  });

  it('本机 agent 切换会话模式时不续接旧会话', () => {
    const session = {
      agentId: 'codex',
      externalSessionId: 'thread-1',
      externalSessionMode: AGENT_SESSION_MODES.CHAT,
      messages: [{ role: 'user', text: '聊聊' }],
    };
    expect(resolveLocalAgentSession(session, 'codex', AGENT_SESSION_MODES.CHAT))
      .toMatchObject({ externalSessionId: 'thread-1', switched: false });
    expect(resolveLocalAgentSession(session, 'codex', AGENT_SESSION_MODES.WRITE))
      .toMatchObject({ externalSessionId: '', switched: false });
  });
});
