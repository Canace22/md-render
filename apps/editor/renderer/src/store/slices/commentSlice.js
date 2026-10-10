import {
  addThread,
  appendReply,
  createCommentThread,
  updateThread,
} from '../../utils/commentThreads.js';

/**
 * 文档评论：commentThreads 持久化（按 fileId 分组），其余是面板的运行时状态。
 * commentDraft = { fileId, anchor }：点了选区工具栏「评论」、还没提交的那条。
 */
export const createCommentSlice = (set, get) => ({
  commentThreads: {},
  commentsPanelOpen: false,
  commentDraft: null,
  activeCommentId: null,

  setCommentsPanelOpen: (open) => set({ commentsPanelOpen: Boolean(open) }),

  setActiveCommentId: (threadId) => set({ activeCommentId: threadId || null }),

  startCommentDraft: (fileId, anchor) => {
    if (!fileId || !anchor) return;
    set({ commentDraft: { fileId, anchor }, commentsPanelOpen: true, activeCommentId: null });
  },

  cancelCommentDraft: () => set({ commentDraft: null }),

  /** 提交草稿为新线程；成功返回线程 id */
  submitCommentDraft: (body) => {
    const { commentDraft, commentThreads } = get();
    if (!commentDraft) return null;
    const thread = createCommentThread(commentDraft.anchor, body);
    if (!thread) return null;
    set({
      commentThreads: addThread(commentThreads, commentDraft.fileId, thread),
      commentDraft: null,
      activeCommentId: thread.id,
    });
    return thread.id;
  },

  replyCommentThread: (fileId, threadId, body) => {
    set({
      commentThreads: updateThread(get().commentThreads, fileId, threadId, (thread) => appendReply(thread, body)),
    });
  },

  setCommentThreadResolved: (fileId, threadId, resolved) => {
    const now = new Date().toISOString();
    set((state) => ({
      commentThreads: updateThread(state.commentThreads, fileId, threadId, (thread) => ({
        ...thread,
        resolved: Boolean(resolved),
        updatedAt: now,
      })),
      activeCommentId: resolved && state.activeCommentId === threadId ? null : state.activeCommentId,
    }));
  },

  deleteCommentThread: (fileId, threadId) => {
    set((state) => ({
      commentThreads: updateThread(state.commentThreads, fileId, threadId, () => null),
      activeCommentId: state.activeCommentId === threadId ? null : state.activeCommentId,
    }));
  },
});
