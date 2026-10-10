import { memo, useState } from 'react';
import { Button, Input, Popconfirm, Tooltip } from 'antd';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

const ICON_SIZE = 14;
const REPLY_ROWS = { minRows: 1, maxRows: 6 };
const COMMENT_AUTHOR = '我';

export const formatCommentTime = (value) => dayjs(value).format('M月D日 HH:mm');

/** 输入框里 Cmd/Ctrl+Enter 提交、Esc 取消 */
export const handleCommentKeyDown = (event, { onSubmit, onCancel }) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    onSubmit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    onCancel?.();
  }
};

export function CommentQuote({ quote, missing = false }) {
  return (
    <div className={`comment-quote${missing ? ' is-missing' : ''}`}>
      <span className="comment-quote-text">{quote}</span>
      {missing && <span className="comment-quote-tag">原文已修改</span>}
    </div>
  );
}

function CommentReplyBox({ onReply }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim()) return;
    onReply(draft);
    setDraft('');
  };
  return (
    <div className="comment-reply" onClick={(event) => event.stopPropagation()}>
      <Input.TextArea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => handleCommentKeyDown(event, { onSubmit: submit, onCancel: () => setDraft('') })}
        placeholder="回复…"
        autoSize={REPLY_ROWS}
      />
      {draft.trim() && (
        <div className="comment-actions">
          <Button size="small" onClick={() => setDraft('')}>取消</Button>
          <Button size="small" type="primary" onClick={submit}>回复</Button>
        </div>
      )}
    </div>
  );
}

/**
 * 一条评论线程：引文 + 评论列表；激活时展开回复框。
 * 解决后变灰，可重新打开。
 */
function CommentThreadCard({
  thread,
  active,
  missing,
  onSelect,
  onReply,
  onResolve,
  onDelete,
}) {
  const stop = (event) => event.stopPropagation();
  return (
    <div
      className={`comment-thread${active ? ' is-active' : ''}${thread.resolved ? ' is-resolved' : ''}`}
      data-testid="comment-thread"
      onClick={() => onSelect(thread.id)}
    >
      <div className="comment-thread-toolbar" onClick={stop}>
        <Tooltip title={thread.resolved ? '重新打开' : '解决'}>
          <Button
            type="text"
            size="small"
            aria-label={thread.resolved ? '重新打开' : '解决'}
            icon={thread.resolved ? <RotateCcw size={ICON_SIZE} /> : <Check size={ICON_SIZE} />}
            onClick={() => onResolve(thread.id, !thread.resolved)}
          />
        </Tooltip>
        <Popconfirm title="删除这条评论？" okText="删除" cancelText="取消" onConfirm={() => onDelete(thread.id)}>
          <Button type="text" size="small" aria-label="删除" icon={<Trash2 size={ICON_SIZE} />} />
        </Popconfirm>
      </div>
      <CommentQuote quote={thread.anchor.quote} missing={missing} />
      {thread.comments.map((comment) => (
        <div className="comment-item" key={comment.id}>
          <div className="comment-meta">
            <span className="comment-author">{COMMENT_AUTHOR}</span>
            <span className="comment-time">{formatCommentTime(comment.createdAt)}</span>
          </div>
          <div className="comment-body">{comment.body}</div>
        </div>
      ))}
      {active && !thread.resolved && <CommentReplyBox onReply={(body) => onReply(thread.id, body)} />}
    </div>
  );
}

export default memo(CommentThreadCard);
