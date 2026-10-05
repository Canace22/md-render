import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import { diffLines, countDiff } from '../core/agent/lineDiff.js';
import { message } from 'antd';
import { selectPendingEditForSelected } from '../store/proposalSelectors.js';

/**
 * 预览区 diff 浮层。
 *
 * 当前文档有待确认的改正文提案时，覆盖在编辑器纸面上，
 * 显示当前文档 → AI 新版的行级红绿对比；用户应用/放弃后自动消失。
 * 其它文档、删除类提案在收件箱（ProposalInbox）里处理。
 *
 * 只读 store、复用 lineDiff，不碰编辑器内核（BlockNote），零风险。
 */
export default function DiffOverlay() {
  const pending = useEditorStore(selectPendingEditForSelected);
  const resolveAgentProposal = useEditorStore((s) => s.resolveAgentProposal);
  const handleResolve = (decision) => {
    const result = resolveAgentProposal(pending.id, decision);
    if (!result.ok && result.error) message.warning(result.error);
  };

  const rows = useMemo(
    () => (pending ? diffLines(pending.oldText, pending.newText) : []),
    [pending],
  );
  const stat = useMemo(() => countDiff(rows), [rows]);

  if (!pending) return null;

  return (
    <div className="diff-overlay">
      <div className="diff-overlay__bar">
        <span className="diff-overlay__title">{pending.who === 'mcp' ? '外部 AI' : 'AI'} 想改写当前文档，确认后才会写入</span>
        <span className="diff-overlay__stat">
          <span className="diff-overlay__add">+{stat.added}</span>
          <span className="diff-overlay__del">−{stat.removed}</span>
        </span>
        <span className="diff-overlay__actions">
          <button className="diff-overlay__btn diff-overlay__btn--apply" onClick={() => handleResolve('apply')}>
            <Check size={14} /> 应用
          </button>
          <button className="diff-overlay__btn" onClick={() => handleResolve('discard')}>
            <X size={14} /> 放弃
          </button>
        </span>
      </div>
      <div className="diff-overlay__body">
        {rows.map((row, i) => (
          <div key={i} className={`diff-overlay__line diff-overlay__line--${row.type}`}>
            <span className="diff-overlay__sign">
              {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
            </span>
            <span className="diff-overlay__text">{row.text || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
