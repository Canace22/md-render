import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Plus, Shapes, Sparkles, Tag, X } from 'lucide-react';
import {
  getKnowledgeNodeTypeLabel,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
} from '../store/workspaceUtils.js';

export default function KnowledgeMetaPanel({
  selectedFile,
  allFiles,
  onKnowledgeMetaChange,
}) {
  const [summaryDraft, setSummaryDraft] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [relatedDraft, setRelatedDraft] = useState('');

  useEffect(() => {
    setSummaryDraft(selectedFile?.summary ?? '');
    setAliasDraft('');
    setRelatedDraft('');
  }, [selectedFile]);

  const filesById = useMemo(() => {
    return new Map((allFiles ?? []).map((file) => [file.id, file]));
  }, [allFiles]);

  const relatedDocs = (selectedFile?.relatedIds ?? [])
    .map((id) => filesById.get(id))
    .filter(Boolean);

  const availableRelatedDocs = (allFiles ?? []).filter((file) => {
    return file.id !== selectedFile?.id && !(selectedFile?.relatedIds ?? []).includes(file.id);
  });

  const commitSummary = () => {
    if (!selectedFile) return;
    const next = summaryDraft.trim();
    if (next === (selectedFile.summary ?? '')) return;
    onKnowledgeMetaChange?.(selectedFile.id, { summary: next });
  };

  const commitAlias = () => {
    if (!selectedFile) return;
    const nextAlias = aliasDraft.trim();
    if (!nextAlias) {
      setAliasDraft('');
      return;
    }
    const aliases = selectedFile.aliases ?? [];
    if (!aliases.includes(nextAlias)) {
      onKnowledgeMetaChange?.(selectedFile.id, { aliases: [...aliases, nextAlias] });
    }
    setAliasDraft('');
  };

  const removeAlias = (targetAlias) => {
    if (!selectedFile) return;
    onKnowledgeMetaChange?.(selectedFile.id, {
      aliases: (selectedFile.aliases ?? []).filter((alias) => alias !== targetAlias),
    });
  };

  const addRelatedDoc = () => {
    if (!selectedFile || !relatedDraft) return;
    onKnowledgeMetaChange?.(selectedFile.id, {
      relatedIds: [...(selectedFile.relatedIds ?? []), relatedDraft],
    });
    setRelatedDraft('');
  };

  const removeRelatedDoc = (targetId) => {
    if (!selectedFile) return;
    onKnowledgeMetaChange?.(selectedFile.id, {
      relatedIds: (selectedFile.relatedIds ?? []).filter((id) => id !== targetId),
    });
  };

  if (!selectedFile) return null;

  return (
    <div className="knowledge-meta-panel" data-testid="knowledge-meta-panel">
      <div className="knowledge-meta-panel-head">
        <div>
          <span className="knowledge-meta-kicker">Knowledge Entry</span>
          <h3>条目元数据</h3>
        </div>
        <span className="knowledge-meta-type-pill">
          <Shapes size={13} strokeWidth={1.7} />
          <span>{getKnowledgeNodeTypeLabel(selectedFile.nodeType)}</span>
        </span>
      </div>

      <div className="knowledge-meta-grid">
        <label className="knowledge-meta-field">
          <span className="knowledge-meta-label">条目类型</span>
          <select
            value={selectedFile.nodeType ?? 'document'}
            onChange={(event) => onKnowledgeMetaChange?.(selectedFile.id, { nodeType: event.target.value })}
          >
            {KNOWLEDGE_NODE_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="knowledge-meta-field knowledge-meta-field--summary">
          <span className="knowledge-meta-label">摘要</span>
          <textarea
            value={summaryDraft}
            placeholder="一句话概括这篇文档最核心的知识点…"
            onChange={(event) => setSummaryDraft(event.target.value)}
            onBlur={commitSummary}
          />
        </label>

        <div className="knowledge-meta-field">
          <span className="knowledge-meta-label">别名</span>
          <div className="knowledge-chip-list">
            {(selectedFile.aliases ?? []).map((alias) => (
              <span key={alias} className="knowledge-chip">
                <Tag size={12} strokeWidth={1.8} />
                <span>{alias}</span>
                <button type="button" onClick={() => removeAlias(alias)} aria-label={`删除别名 ${alias}`}>
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              className="knowledge-chip-input"
              value={aliasDraft}
              placeholder="添加别名"
              onChange={(event) => setAliasDraft(event.target.value)}
              onBlur={commitAlias}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitAlias();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setAliasDraft('');
                }
              }}
            />
          </div>
        </div>

        <div className="knowledge-meta-field">
          <span className="knowledge-meta-label">关联文档</span>
          <div className="knowledge-related-controls">
            <select
              value={relatedDraft}
              onChange={(event) => setRelatedDraft(event.target.value)}
            >
              <option value="">选择一篇文档</option>
              {availableRelatedDocs.map((file) => (
                <option key={file.id} value={file.id}>{file.name}</option>
              ))}
            </select>
            <button type="button" onClick={addRelatedDoc} disabled={!relatedDraft}>
              <Plus size={14} strokeWidth={1.8} />
              <span>关联</span>
            </button>
          </div>
          {relatedDocs.length > 0 ? (
            <div className="knowledge-chip-list">
              {relatedDocs.map((file) => (
                <span key={file.id} className="knowledge-chip knowledge-chip--related">
                  <GitBranch size={12} strokeWidth={1.8} />
                  <span>{file.name}</span>
                  <button type="button" onClick={() => removeRelatedDoc(file.id)} aria-label={`删除关联 ${file.name}`}>
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="knowledge-empty-hint">
              <Sparkles size={14} strokeWidth={1.8} />
              <span>先把相关文档连起来，图谱页才会开始像知识库。</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
