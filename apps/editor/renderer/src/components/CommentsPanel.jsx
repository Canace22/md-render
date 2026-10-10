import { useCallback, useMemo, useState } from 'react';
import { Button, Input } from 'antd';
import { MessageSquare, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import useCommentHighlights from '../hooks/useCommentHighlights.js';
import CommentThreadCard, { CommentQuote, handleCommentKeyDown } from './CommentThreadCard.jsx';

const ICON_SIZE = 16;
const DRAFT_ROWS = { minRows: 2, maxRows: 8 };
const EMPTY_THREADS = [];
/** 草稿也画一层高亮：写评论时仍能看到选中的是哪段 */
const DRAFT_HIGHLIGHT_ID = '__comment-draft__';

/** 未解决的在前，各自按创建时间排 */
const sortThreads = (threads) => [...threads].sort((a, b) => (
  Number(a.resolved) - Number(b.resolved) || a.createdAt.localeCompare(b.createdAt)
));

function CommentDraftCard({ anchor, onSubmit, onCancel }) {
  const [body, setBody] = useState('');
  const submit = () => {
    if (body.trim()) onSubmit(body);
  };
  return (
    <div className="comment-thread is-active is-draft" data-testid="comment-draft">
      <CommentQuote quote={anchor.quote} />
      <Input.TextArea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => handleCommentKeyDown(event, { onSubmit: submit, onCancel })}
        placeholder="添加评论…（⌘/Ctrl + Enter 发送）"
        autoSize={DRAFT_ROWS}
      />
      <div className="comment-actions">
        <Button size="small" onClick={onCancel}>取消</Button>
        <Button size="small" type="primary" disabled={!body.trim()} onClick={submit}>评论</Button>
      </div>
    </div>
  );
}

/**
 * 文档右侧的评论面板（参照 Claude Cowork）。
 * 面板收起时仍常挂载：正文上的评论高亮和「点高亮 → 打开评论」都靠它。
 */
export default function CommentsPanel({ editor, fileId }) {
  const threads = useEditorStore((state) => state.commentThreads?.[fileId] ?? EMPTY_THREADS);
  const open = useEditorStore((state) => state.commentsPanelOpen);
  const draft = useEditorStore((state) => state.commentDraft);
  const activeId = useEditorStore((state) => state.activeCommentId);
  const {
    setCommentsPanelOpen,
    setActiveCommentId,
    submitCommentDraft,
    cancelCommentDraft,
    replyCommentThread,
    setCommentThreadResolved,
    deleteCommentThread,
  } = useEditorStore.getState();

  const activate = useCallback((threadId) => {
    if (threadId === DRAFT_HIGHLIGHT_ID) return;
    setActiveCommentId(threadId);
    setCommentsPanelOpen(true);
  }, [setActiveCommentId, setCommentsPanelOpen]);

  const showDraft = Boolean(fileId) && draft?.fileId === fileId;
  const highlightThreads = useMemo(() => (
    showDraft ? [...threads, { id: DRAFT_HIGHLIGHT_ID, anchor: draft.anchor, resolved: false }] : threads
  ), [draft, showDraft, threads]);
  const { missingIds, scrollToThread } = useCommentHighlights(
    editor,
    highlightThreads,
    showDraft ? DRAFT_HIGHLIGHT_ID : activeId,
    activate,
  );
  const sortedThreads = useMemo(() => sortThreads(threads), [threads]);

  const handleSelect = useCallback((threadId) => {
    setActiveCommentId(threadId);
    scrollToThread(threadId);
  }, [scrollToThread, setActiveCommentId]);
  const handleReply = useCallback((threadId, body) => replyCommentThread(fileId, threadId, body), [fileId, replyCommentThread]);
  const handleResolve = useCallback((threadId, resolved) => setCommentThreadResolved(fileId, threadId, resolved), [fileId, setCommentThreadResolved]);
  const handleDelete = useCallback((threadId) => deleteCommentThread(fileId, threadId), [deleteCommentThread, fileId]);

  if (!open || !fileId) return null;

  const openCount = threads.filter((thread) => !thread.resolved).length;

  return (
    <aside className="comments-panel" data-testid="comments-panel" aria-label="评论">
      <div className="comments-panel-head">
        <span className="comments-panel-title">评论{openCount > 0 ? ` · ${openCount}` : ''}</span>
        <Button
          type="text"
          size="small"
          aria-label="关闭评论面板"
          icon={<X size={ICON_SIZE} />}
          onClick={() => setCommentsPanelOpen(false)}
        />
      </div>
      <div className="comments-panel-list">
        {showDraft && (
          <CommentDraftCard
            key={`${draft.anchor.blockId}-${draft.anchor.offset}`}
            anchor={draft.anchor}
            onSubmit={submitCommentDraft}
            onCancel={cancelCommentDraft}
          />
        )}
        {!showDraft && sortedThreads.length === 0 && (
          <div className="comments-panel-empty">
            <MessageSquare size={ICON_SIZE} />
            <span>选中文字，点工具栏里的「评论」</span>
          </div>
        )}
        {sortedThreads.map((thread) => (
          <CommentThreadCard
            key={thread.id}
            thread={thread}
            active={thread.id === activeId}
            missing={missingIds.has(thread.id)}
            onSelect={handleSelect}
            onReply={handleReply}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </aside>
  );
}
