import { useMemo, useState } from 'react';
import { Drawer, message } from 'antd';
import { Check, ChevronDown, ChevronRight, ExternalLink, Inbox, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import { selectPendingProposals } from '../store/proposalSelectors.js';
import { diffLines, countDiff } from '../core/agent/lineDiff.js';
import { PROPOSAL_KINDS, summarizeProposal } from '../../../shared/capabilities/proposals.js';

const RECENT_RESOLVED_LIMIT = 10;
const STATUS_LABELS = Object.freeze({
  pending: '待确认',
  applied: '已应用',
  discarded: '已放弃',
  conflict: '有冲突，未应用',
});
const WHO_LABELS = Object.freeze({ app: 'app 内 AI', mcp: '外部 AI' });

const formatTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false });
};

function ProposalDiff({ proposal }) {
  const rows = useMemo(() => diffLines(proposal.oldText, proposal.newText), [proposal]);
  return (
    <div className="proposal-inbox__diff diff-overlay__body">
      {rows.map((row, i) => (
        <div key={i} className={`diff-overlay__line diff-overlay__line--${row.type}`}>
          <span className="diff-overlay__sign">{row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}</span>
          <span className="diff-overlay__text">{row.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

function ProposalItem({ proposal, onResolve, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const isEdit = proposal.kind === PROPOSAL_KINDS.EDIT;
  const stat = useMemo(() => (isEdit ? countDiff(diffLines(proposal.oldText, proposal.newText)) : null), [isEdit, proposal]);
  const pending = proposal.status === 'pending';

  return (
    <li className={`proposal-inbox__item is-${proposal.status}`}>
      <div className="proposal-inbox__row">
        {isEdit ? (
          <button type="button" className="proposal-inbox__toggle" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? '收起 diff' : '展开 diff'}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="proposal-inbox__toggle" />}
        <div className="proposal-inbox__main">
          <div className="proposal-inbox__title">{summarizeProposal(proposal)}</div>
          <div className="proposal-inbox__meta">
            <span>{WHO_LABELS[proposal.who] || proposal.who}</span>
            <span>{formatTime(proposal.createdAt)}</span>
            {stat && <span className="diff-overlay__add">+{stat.added}</span>}
            {stat && <span className="diff-overlay__del">−{stat.removed}</span>}
            {!pending && <span className="proposal-inbox__status">{STATUS_LABELS[proposal.status]}</span>}
          </div>
          {proposal.reason && <div className="proposal-inbox__reason">原因：{proposal.reason}</div>}
        </div>
        <div className="proposal-inbox__actions">
          {isEdit && (
            <button type="button" className="diff-overlay__btn" onClick={() => onOpen(proposal.targetId)} title="打开文档">
              <ExternalLink size={13} />
            </button>
          )}
          {pending && (
            <>
              <button type="button" className={`diff-overlay__btn diff-overlay__btn--apply${isEdit ? '' : ' is-danger'}`} onClick={() => onResolve(proposal.id, 'apply')}>
                <Check size={13} /> {isEdit ? '应用' : '删除'}
              </button>
              <button type="button" className="diff-overlay__btn" onClick={() => onResolve(proposal.id, 'discard')}>
                <X size={13} /> 放弃
              </button>
            </>
          )}
        </div>
      </div>
      {isEdit && expanded && <ProposalDiff proposal={proposal} />}
    </li>
  );
}

/**
 * 待确认收件箱：顶栏入口 + 抽屉列表，任何界面都能处理 AI（含外部 agent）提交的改动和删除。
 */
export default function ProposalInbox() {
  const [open, setOpen] = useState(false);
  const proposals = useEditorStore((s) => s.agentProposals);
  const resolveAgentProposal = useEditorStore((s) => s.resolveAgentProposal);
  const selectNode = useEditorStore((s) => s.selectNode);

  const pending = useMemo(() => selectPendingProposals({ agentProposals: proposals }), [proposals]);
  const recent = useMemo(
    () => proposals.filter((item) => item.status !== 'pending').slice(0, RECENT_RESOLVED_LIMIT),
    [proposals],
  );

  const handleResolve = (id, decision) => {
    const result = resolveAgentProposal(id, decision);
    if (!result.ok && result.error) message.warning(result.error);
    if (result.note) message.info(result.note);
  };

  const handleOpen = (targetId) => {
    selectNode(targetId);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`titlebar-inbox-toggle${pending.length ? ' has-pending' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`待确认改动 ${pending.length} 条`}
        title="待确认改动：AI 提交的改正文、删除都在这里确认"
      >
        <Inbox size={15} strokeWidth={1.7} />
        {pending.length > 0 && <span className="titlebar-inbox-count">{pending.length}</span>}
      </button>
      <Drawer
        title={`待确认改动（${pending.length}）`}
        open={open}
        onClose={() => setOpen(false)}
        width={520}
        className="proposal-inbox"
      >
        {pending.length === 0 && <div className="proposal-inbox__empty">没有待确认的改动。</div>}
        {pending.length > 0 && (
          <ul className="proposal-inbox__list">
            {pending.map((item) => <ProposalItem key={item.id} proposal={item} onResolve={handleResolve} onOpen={handleOpen} />)}
          </ul>
        )}
        {recent.length > 0 && (
          <>
            <div className="proposal-inbox__section">最近处理</div>
            <ul className="proposal-inbox__list">
              {recent.map((item) => <ProposalItem key={item.id} proposal={item} onResolve={handleResolve} onOpen={handleOpen} />)}
            </ul>
          </>
        )}
      </Drawer>
    </>
  );
}
