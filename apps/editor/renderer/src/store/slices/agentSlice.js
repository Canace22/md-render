import {
  createSession,
  deriveTitle,
  mapSession,
  removeSession,
} from '../../core/agent/sessionUtils.js';
import { findNodeById } from '../workspaceUtils.js';

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

  // AI 待确认的文档写入（内存态，不进 persist）。
  agentPendingWrite: null,
  // 在“调用写入”这一刻就把改动绑定到目标文档 id（取实时选中态）。
  // 否则应用时若选中态已漂移（AI 期间打开了别的文档 / 用户切了文档），
  // 会把改动写进错误的文档，导致上下文里的其它文档被误改。
  stageAgentWrite: ({ oldText, newText } = {}) => new Promise((resolve) => {
    const { selectedId, workspace } = get();
    const targetNode = findNodeById(workspace, selectedId);
    const isFile = targetNode?.type === 'file';
    set({
      agentPendingWrite: {
        targetId: isFile ? selectedId : null,
        oldText: isFile ? (targetNode.content ?? '') : (oldText ?? ''),
        newText: newText ?? '',
        resolve,
      },
    });
  }),
  applyAgentWrite: () => {
    const pending = get().agentPendingWrite;
    if (!pending) return;
    if (pending.targetId) {
      get().updateFileContentById(pending.targetId, pending.newText);
    } else {
      get().updateSelectedFileContent(pending.newText);
    }
    set({ agentPendingWrite: null });
    pending.resolve?.(true);
  },
  discardAgentWrite: () => {
    const pending = get().agentPendingWrite;
    if (!pending) return;
    set({ agentPendingWrite: null });
    pending.resolve?.(false);
  },

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
});
