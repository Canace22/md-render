import { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Library,
  Loader2,
  MessageSquareQuote,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { buildAiContextSummary } from '../utils/aiActions.js';
import { buildTaskContextPreviewLines } from '../core/agent/taskContext.js';

/**
 * AI 助手面板顶部「稿件信息区」+「参考上下文」区。
 * - 稿件信息：复用 buildAiContextSummary，拿到标题/摘要/中文元数据行（状态/平台/标签）。
 * - 元数据缺失时优雅降级：只显示标题，并提示「未设置稿件信息」。
 * - 参考上下文：展开时按需召回相关旧文，每条可一键插入引用到当前文档。
 *
 * @param {object} props
 * @param {object|null} props.document          当前选中的文件对象（含元数据）
 * @param {object|null} [props.contextPacket]   上次发送给 agent 的上下文包摘要
 * @param {() => Promise<Array>} [props.onRecall]            触发召回，返回 [{id,title,snippet}]
 * @param {(ref: object) => void} [props.onInsertReference]  把某条旧文作为引用插入文档
 */
export default function AgentDocMeta({ document, contextPacket = null, onRecall, onInsertReference }) {
  const [contextOpen, setContextOpen] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [refs, setRefs] = useState([]);
  const [recalled, setRecalled] = useState(false);

  // 没有文档时也能渲染：buildAiContextSummary 对空入参会给出兜底标题/摘要。
  const summary = useMemo(
    () => buildAiContextSummary({ document: document ?? null }),
    [document],
  );
  const metadataLines = summary.metadataLines ?? [];
  const hasMeta = metadataLines.length > 0;
  const contextLines = useMemo(
    () => buildTaskContextPreviewLines(contextPacket),
    [contextPacket],
  );

  const runRecall = useCallback(async () => {
    if (!onRecall || recalling) return;
    setRecalling(true);
    try {
      const result = await onRecall();
      setRefs(Array.isArray(result) ? result : []);
    } finally {
      setRecalled(true);
      setRecalling(false);
    }
  }, [onRecall, recalling]);

  // 首次展开自动召回一次；之后靠「刷新」按钮重算。
  const toggleContext = useCallback(() => {
    setContextOpen((open) => {
      const next = !open;
      if (next && !recalled) runRecall();
      return next;
    });
  }, [recalled, runRecall]);

  return (
    <div className="agent-panel__doc">
      <section className="agent-panel__doc-meta">
        <div className="agent-panel__doc-title">
          <FileText size={14} />
          <span className="agent-panel__doc-title-text">当前稿件：{summary.title}</span>
        </div>
        {summary.summary && <p className="agent-panel__doc-summary">{summary.summary}</p>}
        {hasMeta ? (
          <ul className="agent-panel__doc-fields">
            {metadataLines.map((line) => (
              <li key={line} className="agent-panel__doc-field">{line}</li>
            ))}
          </ul>
        ) : (
          <p className="agent-panel__doc-empty">未设置稿件信息。</p>
        )}
      </section>

      {contextLines.length > 0 && (
        <section className="agent-panel__doc-meta">
          <div className="agent-panel__doc-title">
            <MessageSquareQuote size={14} />
            <span className="agent-panel__doc-title-text">本轮上下文</span>
          </div>
          <ul className="agent-panel__doc-fields">
            {contextLines.map((line) => (
              <li key={line} className="agent-panel__doc-field">{line}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="agent-panel__context">
        <div className="agent-panel__context-head-row">
          <button
            type="button"
            className="agent-panel__context-head"
            aria-expanded={contextOpen}
            onClick={toggleContext}
          >
            {contextOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Library size={14} />
            <span>相关旧文</span>
          </button>
          {contextOpen && onRecall && (
            <button
              type="button"
              className="agent-panel__context-refresh"
              title="重新召回相关旧文"
              disabled={recalling}
              onClick={runRecall}
            >
              {recalling ? <Loader2 size={13} className="agent-panel__spin" /> : <RefreshCw size={13} />}
            </button>
          )}
        </div>
        {contextOpen && (
          <div className="agent-panel__context-body">
            {recalling && <div className="agent-panel__context-hint">正在召回相关旧文…</div>}
            {!recalling && refs.length === 0 && (
              <div className="agent-panel__context-hint">
                {recalled ? '没有找到相关旧文。' : '展开后会显示相关旧文。'}
              </div>
            )}
            {!recalling && refs.map((ref) => (
              <div key={ref.id} className="agent-panel__ref">
                <div className="agent-panel__ref-text">
                  <span className="agent-panel__ref-title">{ref.title || '未命名'}</span>
                  {ref.snippet && <span className="agent-panel__ref-snippet">{ref.snippet}</span>}
                </div>
                {onInsertReference && (
                  <button
                    type="button"
                    className="agent-panel__ref-insert"
                    title="插入引用到当前文档"
                    onClick={() => onInsertReference(ref)}
                  >
                    <Plus size={13} /> 引用
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
