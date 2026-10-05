import {
  createSession,
  deriveTitle,
  mapSession,
  removeSession,
} from '../../core/agent/sessionUtils.js';
import { normalizeAgentSessionMode } from '../../core/agent/chatMode.js';

export const createAgentSlice = (set, get) => ({
  // AI 助手会话（全局内存态，故意不进 persist：切页不丢、关 app 清空）
  agentSessions: [createSession()],
  activeAgentSessionId: null,

  // 编辑器「引用到 AI」暂存的选中文字（内存态，不进 persist）。
  aiQuotedSelection: null,
  setAiQuotedSelection: (text) => {
    const t = String(text ?? '').trim();
    set({ aiQuotedSelection: t || null });
  },
  clearAiQuotedSelection: () => set({ aiQuotedSelection: null }),

  // 从别处（如文档工具栏）请求 AI 面板运行某个 skill；面板打开后消费并清空（内存态）。
  agentSkillRequest: null,
  requestAgentSkill: (skillId) => set({ agentSkillRequest: skillId ? { skillId, requestedAt: Date.now() } : null }),
  clearAgentSkillRequest: () => set({ agentSkillRequest: null }),

  // 待确认改动已迁到 proposalSlice（提案收件箱）

  getActiveAgentSessionId: () => {
    const { agentSessions, activeAgentSessionId } = get();
    if (activeAgentSessionId && agentSessions.some((s) => s.id === activeAgentSessionId)) {
      return activeAgentSessionId;
    }
    return agentSessions[0]?.id ?? null;
  },
  createAgentSession: () => {
    const session = createSession();
    set((state) => ({
      agentSessions: [session, ...state.agentSessions],
      activeAgentSessionId: session.id,
    }));
    return session.id;
  },
  switchAgentSession: (sessionId) => set({ activeAgentSessionId: sessionId }),
  setAgentSessionMode: (sessionId, mode) => set((state) => ({
    agentSessions: mapSession(state.agentSessions, sessionId, (session) => ({
      ...session,
      mode: normalizeAgentSessionMode(mode),
    })),
  })),
  deleteAgentSession: (sessionId) => set((state) => {
    const { sessions, nextActiveId } = removeSession(
      state.agentSessions,
      sessionId,
      get().getActiveAgentSessionId(),
    );
    return { agentSessions: sessions, activeAgentSessionId: nextActiveId };
  }),
  appendAgentMessage: (sessionId, msg) => set((state) => ({
    agentSessions: mapSession(state.agentSessions, sessionId, (session) => ({
      ...session,
      messages: [...session.messages, msg],
      title: session.messages.length === 0 && msg.role === 'user'
        ? deriveTitle(msg.text)
        : session.title,
    })),
  })),
  updateAgentMessages: (sessionId, updater) => set((state) => ({
    agentSessions: mapSession(state.agentSessions, sessionId, (session) => ({
      ...session,
      messages: updater(session.messages),
    })),
  })),
  setAgentHistory: (sessionId, history) => set((state) => ({
    agentSessions: mapSession(state.agentSessions, sessionId, (session) => ({ ...session, history })),
  })),
  // 本地 agent 会话续接：记住这一轮用的 agent 和它的外部会话 id；走 API 服务商时清空
  setAgentExternalSession: (sessionId, {
    agentId = '', externalSessionId = '', mode = '',
  } = {}) => set((state) => ({
    agentSessions: mapSession(state.agentSessions, sessionId, (session) => ({
      ...session,
      agentId,
      externalSessionId,
      externalSessionMode: mode,
    })),
  })),
});
