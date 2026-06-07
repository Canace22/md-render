import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarClock, Clock, FileText, GitBranch,
  Link, Link2, PackageSearch, Plus, Shapes, Tag, X,
} from 'lucide-react';
import {
  getKnowledgeNodeTypeLabel,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
} from '../store/workspaceUtils.js';
import { PUBLISHING_PLATFORM_OPTIONS } from '../utils/publishingPlatforms.js';

/* ── constants ─────────────────────────────────────────────── */

const DEFAULT_STATUS_OPTIONS = [
  { value: 'idea', label: '选题中' },
  { value: 'drafting', label: '写作中' },
  { value: 'review', label: '待审阅' },
  { value: 'scheduled', label: '待发布' },
  { value: 'published', label: '已发布' },
];

/* ── pure helpers ──────────────────────────────────────────── */

const hasElectronDb = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.db === 'object';

const formatVersionDate = (ts) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

const normalizePlatforms = (file) => {
  const value = file?.targetPlatforms ?? file?.platforms ?? [];
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
};

const buildPlatformPatch = (current, value) =>
  current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

const buildVisiblePlatformOptions = (platformOptions, currentPlatforms) => {
  const baseOptions = Array.isArray(platformOptions) ? platformOptions : [];
  const knownValues = new Set(baseOptions.map((option) => option.value));
  const extraOptions = currentPlatforms
    .filter((value) => !knownValues.has(value))
    .map((value) => ({ value, label: value }));
  return [...baseOptions, ...extraOptions];
};

const getCurrentStatus = (file) => file?.draftStatus ?? file?.status ?? 'drafting';

const getStatusLabel = (options, value) =>
  options.find((o) => o.value === value)?.label ?? value;

const normalizeSourceMaterials = (file, filesById) => {
  const value = file?.sourceMaterials ?? file?.sourceMaterialIds ?? [];
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') {
      const linked = filesById.get(item);
      return { key: item, label: linked?.name ?? item, linkedFileId: linked?.id ?? null, tone: linked ? 'linked' : 'plain' };
    }
    if (!item || typeof item !== 'object') return null;
    const linkedId = item.fileId ?? item.documentId ?? item.id ?? null;
    const linked = linkedId ? filesById.get(linkedId) : null;
    return {
      key: linkedId ?? item.url ?? item.title ?? `source-${index}`,
      label: item.title ?? item.name ?? linked?.name ?? '未命名素材',
      linkedFileId: linked?.id ?? null,
      tone: item.url ? 'external' : linked ? 'linked' : 'plain',
    };
  }).filter(Boolean);
};

/* ── main component ────────────────────────────────────────── */

export default function DocMetaPanel({
  selectedFile,
  allFiles = [],
  onMetaChange,
  onOpenFile,
  onManageSourceMaterials,
  onManageRelatedDocs,
  onRestoreVersion,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  platformOptions = PUBLISHING_PLATFORM_OPTIONS,
  disabled = false,
}) {
  const [summaryDraft, setSummaryDraft] = useState('');
  const [publishAtDraft, setPublishAtDraft] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [relatedDraft, setRelatedDraft] = useState('');
  const [backlinks, setBacklinks] = useState([]);
  const [versions, setVersions] = useState([]);
  const [restoringVersionId, setRestoringVersionId] = useState(null);

  useEffect(() => {
    setSummaryDraft(selectedFile?.summary ?? '');
    setPublishAtDraft(selectedFile?.scheduledPublishAt ?? selectedFile?.publishAt ?? '');
    setAliasDraft('');
    setRelatedDraft('');
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile?.id || !hasElectronDb()) { setBacklinks([]); return; }
    window.electronAPI.db.getBacklinks(selectedFile.id)
      .then((res) => setBacklinks(res?.backlinks ?? []))
      .catch(() => setBacklinks([]));
  }, [selectedFile?.id]);

  useEffect(() => {
    if (!selectedFile?.id || !hasElectronDb()) { setVersions([]); return; }
    window.electronAPI.db.getVersions(selectedFile.id)
      .then((res) => setVersions(res?.versions ?? []))
      .catch(() => setVersions([]));
  }, [selectedFile?.id]);

  const filesById = useMemo(() => new Map((allFiles ?? []).map((f) => [f.id, f])), [allFiles]);
  const currentPlatforms = useMemo(() => normalizePlatforms(selectedFile), [selectedFile]);
  const visiblePlatformOptions = useMemo(
    () => buildVisiblePlatformOptions(platformOptions, currentPlatforms),
    [platformOptions, currentPlatforms],
  );
  const sourceMaterials = useMemo(() => normalizeSourceMaterials(selectedFile, filesById), [selectedFile, filesById]);
  const relatedDocs = (selectedFile?.relatedIds ?? []).map((id) => filesById.get(id)).filter(Boolean);
  const availableRelatedDocs = (allFiles ?? []).filter((f) => f.id !== selectedFile?.id && !(selectedFile?.relatedIds ?? []).includes(f.id));
  const currentStatus = getCurrentStatus(selectedFile);

  const commitSummary = () => {
    if (!selectedFile) return;
    const next = summaryDraft.trim();
    if (next === (selectedFile.summary ?? '')) return;
    onMetaChange?.(selectedFile.id, { summary: next });
  };

  const commitPublishAt = () => {
    if (!selectedFile) return;
    const next = publishAtDraft.trim();
    if (next === (selectedFile.scheduledPublishAt ?? selectedFile.publishAt ?? '')) return;
    onMetaChange?.(selectedFile.id, { scheduledPublishAt: next });
  };

  const commitAlias = () => {
    if (!selectedFile) return;
    const next = aliasDraft.trim();
    if (!next) { setAliasDraft(''); return; }
    const aliases = selectedFile.aliases ?? [];
    if (!aliases.includes(next)) {
      onMetaChange?.(selectedFile.id, { aliases: [...aliases, next] });
    }
    setAliasDraft('');
  };

  const removeAlias = (target) => {
    if (!selectedFile) return;
    onMetaChange?.(selectedFile.id, { aliases: (selectedFile.aliases ?? []).filter((a) => a !== target) });
  };

  const handlePlatformToggle = (value) => {
    if (!selectedFile) return;
    onMetaChange?.(selectedFile.id, { targetPlatforms: buildPlatformPatch(currentPlatforms, value) });
  };

  const addRelatedDoc = () => {
    if (!selectedFile || !relatedDraft) return;
    onMetaChange?.(selectedFile.id, { relatedIds: [...(selectedFile.relatedIds ?? []), relatedDraft] });
    setRelatedDraft('');
  };

  const removeRelatedDoc = (targetId) => {
    if (!selectedFile) return;
    onMetaChange?.(selectedFile.id, { relatedIds: (selectedFile.relatedIds ?? []).filter((id) => id !== targetId) });
  };

  const handleRestoreVersion = async (versionId) => {
    if (!hasElectronDb() || !onRestoreVersion) return;
    setRestoringVersionId(versionId);
    try {
      const res = await window.electronAPI.db.getVersionContent(versionId);
      if (res?.ok && res.version?.content != null) {
        onRestoreVersion(res.version.content);
      }
    } finally {
      setRestoringVersionId(null);
    }
  };

  if (!selectedFile) return null;

  return (
    <div className="doc-meta-panel" data-testid="doc-meta-panel">
      {/* ── row 1: status + type + badges ── */}
      <div className="doc-meta-row">
        <label className="doc-meta-field doc-meta-field--half">
          <span className="doc-meta-label">状态</span>
          <select
            className="doc-meta-select"
            value={currentStatus}
            onChange={(e) => onMetaChange?.(selectedFile.id, { draftStatus: e.target.value })}
            disabled={disabled}
          >
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="doc-meta-field doc-meta-field--half">
          <span className="doc-meta-label">类型</span>
          <select
            className="doc-meta-select"
            value={selectedFile.nodeType ?? 'document'}
            onChange={(e) => onMetaChange?.(selectedFile.id, { nodeType: e.target.value })}
            disabled={disabled}
          >
            {KNOWLEDGE_NODE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* ── row 2: summary ── */}
      <label className="doc-meta-field">
        <span className="doc-meta-label">摘要</span>
        <textarea
          className="doc-meta-textarea"
          value={summaryDraft}
          placeholder="一句话说清核心观点或知识点。"
          onChange={(e) => setSummaryDraft(e.target.value)}
          onBlur={commitSummary}
          disabled={disabled}
        />
      </label>

      {selectedFile.url && (
        <div className="doc-meta-field">
          <span className="doc-meta-label">
            <Link size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            来源链接
          </span>
          <div className="doc-meta-chip-list">
            <a
              className="doc-meta-chip doc-meta-chip--external doc-meta-chip-link"
              href={selectedFile.url}
              target="_blank"
              rel="noreferrer"
              title={selectedFile.url}
            >
              <span>{selectedFile.url}</span>
            </a>
          </div>
        </div>
      )}

      {/* ── row 3: aliases ── */}
      <div className="doc-meta-field">
        <span className="doc-meta-label">别名</span>
        <div className="doc-meta-chip-list">
          {(selectedFile.aliases ?? []).map((alias) => (
            <span key={alias} className="doc-meta-chip doc-meta-chip--alias">
              <Tag size={11} strokeWidth={1.8} />
              <span>{alias}</span>
              <button type="button" onClick={() => removeAlias(alias)} aria-label={`删除别名 ${alias}`}>
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            className="doc-meta-chip-input"
            value={aliasDraft}
            placeholder="+ 别名"
            onChange={(e) => setAliasDraft(e.target.value)}
            onBlur={commitAlias}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitAlias(); }
              if (e.key === 'Escape') { e.preventDefault(); setAliasDraft(''); }
            }}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="doc-meta-divider" />

      {/* ── row 4: platforms + publish time ── */}
      <div className="doc-meta-row doc-meta-row--publish">
        <div className="doc-meta-field doc-meta-field--grow">
          <span className="doc-meta-label">平台</span>
          <div className="doc-meta-platform-list" role="group" aria-label="选择目标平台">
            {visiblePlatformOptions.map((o) => {
              const checked = currentPlatforms.includes(o.value);
              return (
                <label key={o.value} className={`doc-meta-platform-chip${checked ? ' is-selected' : ''}`}>
                  <input type="checkbox" className="doc-meta-platform-input" checked={checked} onChange={() => handlePlatformToggle(o.value)} disabled={disabled} />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>
        <label className="doc-meta-field doc-meta-field--time">
          <span className="doc-meta-label">
            <CalendarClock size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            排期
          </span>
          <input
            className="doc-meta-input"
            value={publishAtDraft}
            placeholder="周三 20:00"
            onChange={(e) => setPublishAtDraft(e.target.value)}
            onBlur={commitPublishAt}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitPublishAt(); }
              if (e.key === 'Escape') { e.preventDefault(); setPublishAtDraft(selectedFile?.scheduledPublishAt ?? selectedFile?.publishAt ?? ''); }
            }}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="doc-meta-divider" />

      {/* ── row 5: source materials ── */}
      <div className="doc-meta-field">
        <div className="doc-meta-section-head">
          <span className="doc-meta-label">
            <PackageSearch size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            来源素材
          </span>
          {onManageSourceMaterials && (
            <button type="button" className="doc-meta-action" onClick={() => onManageSourceMaterials(selectedFile.id)} disabled={disabled}>管理</button>
          )}
        </div>
        {sourceMaterials.length > 0 && (
          <div className="doc-meta-chip-list">
            {sourceMaterials.map((item) => {
              const openable = Boolean(item.linkedFileId && onOpenFile);
              const El = openable ? 'button' : 'span';
              return (
                <El key={item.key} type={openable ? 'button' : undefined} className={`doc-meta-chip doc-meta-chip--${item.tone}`} onClick={openable ? () => onOpenFile(item.linkedFileId) : undefined}>
                  <span>{item.label}</span>
                </El>
              );
            })}
          </div>
        )}
      </div>

      {/* ── row 6: related docs ── */}
      <div className="doc-meta-field">
        <div className="doc-meta-section-head">
          <span className="doc-meta-label">
            <Link2 size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            关联文档
          </span>
          {onManageRelatedDocs && (
            <button type="button" className="doc-meta-action" onClick={() => onManageRelatedDocs(selectedFile.id)} disabled={disabled}>管理</button>
          )}
        </div>
        <div className="doc-meta-related-controls">
          <select value={relatedDraft} onChange={(e) => setRelatedDraft(e.target.value)} disabled={disabled}>
            <option value="">选择文档…</option>
            {availableRelatedDocs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button type="button" onClick={addRelatedDoc} disabled={!relatedDraft || disabled}>
            <Plus size={13} strokeWidth={1.8} />
          </button>
        </div>
        {relatedDocs.length > 0 && (
          <div className="doc-meta-chip-list">
            {relatedDocs.map((file) => (
              <span key={file.id} className="doc-meta-chip doc-meta-chip--linked">
                <GitBranch size={11} strokeWidth={1.8} />
                <button type="button" onClick={() => onOpenFile?.(file.id)}><span>{file.name}</span></button>
                <button type="button" onClick={() => removeRelatedDoc(file.id)} aria-label={`删除关联 ${file.name}`}><X size={11} strokeWidth={2} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── row 7: backlinks ── */}
      {hasElectronDb() && backlinks.length > 0 && (
        <div className="doc-meta-field">
          <span className="doc-meta-label">
            <Link size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            反向链接
          </span>
          <div className="doc-meta-chip-list">
            {backlinks.map((bl) => (
              <button key={bl.id} type="button" className="doc-meta-chip doc-meta-chip--backlink" onClick={() => onOpenFile?.(bl.id)} title={`打开 ${bl.name}`}>
                <FileText size={11} strokeWidth={1.8} />
                <span>{bl.name.replace(/\.md$/i, '')}</span>
                <ArrowLeft size={10} strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── row 8: version history ── */}
      {hasElectronDb() && versions.length > 0 && (
        <>
          <div className="doc-meta-divider" />
          <div className="doc-meta-field">
            <span className="doc-meta-label">
              <Clock size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
              版本历史
            </span>
            <div className="doc-meta-versions-list">
              {versions.map((ver) => (
                <div key={ver.id} className="doc-meta-version-row">
                  <span className="doc-meta-version-date">{formatVersionDate(ver.created_at)}</span>
                  <span className="doc-meta-version-size">{ver.char_count} 字</span>
                  {onRestoreVersion && (
                    <button type="button" className="doc-meta-version-restore" disabled={restoringVersionId === ver.id} onClick={() => handleRestoreVersion(ver.id)}>
                      {restoringVersionId === ver.id ? '恢复中…' : '恢复'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
