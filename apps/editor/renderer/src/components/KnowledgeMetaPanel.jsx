import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, FileText, GitBranch, Link, Shapes, Sparkles, Tag, X } from 'lucide-react';
import RelatedDocPicker from './RelatedDocPicker.jsx';
import {
  getKnowledgeNodeTypeLabel,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
} from '../store/workspaceUtils.js';
import {
  dbGetBacklinks,
  dbGetVersionContent,
  dbGetVersions,
  hasDbBridge,
} from '../services/electronBridge.js';

const formatVersionDate = (ts) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

export default function KnowledgeMetaPanel({
  selectedFile,
  allFiles,
  onKnowledgeMetaChange,
  onOpenFile,
  onRestoreVersion,
}) {
  const [summaryDraft, setSummaryDraft] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [backlinks, setBacklinks] = useState([]);
  const [versions, setVersions] = useState([]);
  const [restoringVersionId, setRestoringVersionId] = useState(null);

  useEffect(() => {
    setSummaryDraft(selectedFile?.summary ?? '');
    setAliasDraft('');
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile?.id || !hasDbBridge()) {
      setBacklinks([]);
      return;
    }
    dbGetBacklinks(selectedFile.id)
      .then((res) => setBacklinks(res?.backlinks ?? []))
      .catch(() => setBacklinks([]));
  }, [selectedFile?.id]);

  useEffect(() => {
    if (!selectedFile?.id || !hasDbBridge()) {
      setVersions([]);
      return;
    }
    dbGetVersions(selectedFile.id)
      .then((res) => setVersions(res?.versions ?? []))
      .catch(() => setVersions([]));
  }, [selectedFile?.id]);

  const handleRestoreVersion = async (versionId) => {
    if (!hasDbBridge() || !onRestoreVersion) return;
    setRestoringVersionId(versionId);
    try {
      const res = await dbGetVersionContent(versionId);
      if (res?.ok && res.version?.content != null) {
        onRestoreVersion(res.version.content);
      }
    } finally {
      setRestoringVersionId(null);
    }
  };

  const filesById = useMemo(() => {
    return new Map((allFiles ?? []).map((file) => [file.id, file]));
  }, [allFiles]);

  const relatedDocs = (selectedFile?.relatedIds ?? [])
    .map((id) => filesById.get(id))
    .filter(Boolean);
  const sourceDocs = (selectedFile?.sourceMaterialIds ?? [])
    .map((id) => filesById.get(id))
    .filter(Boolean);

  const addRelatedDoc = (targetId) => {
    if (!selectedFile || !targetId) return;
    onKnowledgeMetaChange?.(selectedFile.id, {
      relatedIds: [...(selectedFile.relatedIds ?? []), targetId],
    });
  };

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
          <RelatedDocPicker
            key={selectedFile.id}
            selectedFile={selectedFile}
            allFiles={allFiles}
            onAdd={addRelatedDoc}
            controlsClassName="knowledge-related-controls"
            selectClassName="doc-meta-related-select"
            placeholder="搜索或选择文档…"
          />
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

        {sourceDocs.length > 0 && (
          <div className="knowledge-meta-field">
            <span className="knowledge-meta-label">来源素材</span>
            <div className="knowledge-chip-list">
              {sourceDocs.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className="knowledge-chip knowledge-chip--source"
                  onClick={() => onOpenFile?.(file.id)}
                  title={`打开来源 ${file.name}`}
                >
                  <FileText size={12} strokeWidth={1.8} />
                  <span>{file.name.replace(/\.md$/i, '')}</span>
                  <ArrowLeft size={11} strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>
        )}

        {hasDbBridge() && (
          <div className="knowledge-meta-field">
            <span className="knowledge-meta-label">
              <Link size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              反向链接
            </span>
            {backlinks.length > 0 ? (
              <div className="knowledge-chip-list">
                {backlinks.map((bl) => (
                  <button
                    key={bl.id}
                    type="button"
                    className="knowledge-chip knowledge-chip--backlink"
                    onClick={() => onOpenFile?.(bl.id)}
                    title={`打开 ${bl.name}`}
                  >
                    <FileText size={12} strokeWidth={1.8} />
                    <span>{bl.name.replace(/\.md$/i, '')}</span>
                    <ArrowLeft size={11} strokeWidth={2} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="knowledge-empty-hint">
                <span>暂无其他文档通过 [[]] 链接到这里。</span>
              </div>
            )}
          </div>
        )}

        {hasDbBridge() && versions.length > 0 && (
          <div className="knowledge-meta-field">
            <span className="knowledge-meta-label">
              <Clock size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              版本历史
            </span>
            <div className="knowledge-versions-list">
              {versions.map((ver) => (
                <div key={ver.id} className="knowledge-version-row">
                  <div className="knowledge-version-info">
                    <span className="knowledge-version-date">{formatVersionDate(ver.created_at)}</span>
                    <span className="knowledge-version-size">{ver.char_count} 字</span>
                  </div>
                  {onRestoreVersion && (
                    <button
                      type="button"
                      className="knowledge-version-restore"
                      disabled={restoringVersionId === ver.id}
                      onClick={() => handleRestoreVersion(ver.id)}
                    >
                      {restoringVersionId === ver.id ? '恢复中…' : '恢复'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
