import { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import {
  ArrowLeft, CalendarClock, Clock, FileText, GitBranch,
  Image, Link, Link2, PackageSearch, X,
} from 'lucide-react';
import {
  KNOWLEDGE_NODE_TYPE_OPTIONS,
} from '../store/workspaceUtils.js';
import { PUBLISHING_PLATFORM_OPTIONS } from '../utils/publishingPlatforms.js';
import RelatedDocPicker from './RelatedDocPicker.jsx';

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

const hasElectronSelectCoverImage = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.selectCoverImage === 'function';

const toPreviewSrc = (value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  // local absolute path → file:// protocol for <img> preview
  if (value.startsWith('/') || /^[A-Z]:\\/i.test(value)) {
    return `file://${value}`;
  }
  return value;
};

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

const collectReusableTags = (allFiles) => {
  const counts = new Map();

  (allFiles ?? []).forEach((file) => {
    (file?.tags ?? []).forEach((tag) => {
      if (!tag) return;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};

/* ── main component ────────────────────────────────────────── */

export default function DocMetaPanel({
  selectedFile,
  allFiles = [],
  onMetaChange,
  onTagsChange,
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
  const [coverDraft, setCoverDraft] = useState('');
  const [coverError, setCoverError] = useState(false);
  const [backlinks, setBacklinks] = useState([]);
  const [versions, setVersions] = useState([]);
  const [restoringVersionId, setRestoringVersionId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setSummaryDraft(selectedFile?.summary ?? '');
    setPublishAtDraft(selectedFile?.scheduledPublishAt ?? selectedFile?.publishAt ?? '');
    setCoverDraft(selectedFile?.cover ?? '');
    setCoverError(false);
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
  const reusableTags = useMemo(
    () => collectReusableTags(allFiles).map((item) => ({ label: item.tag, value: item.tag })),
    [allFiles],
  );
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

  const commitCover = () => {
    if (!selectedFile) return;
    const next = coverDraft.trim();
    if (next === (selectedFile.cover ?? '')) return;
    onMetaChange?.(selectedFile.id, { cover: next });
  };

  const clearCover = () => {
    if (!selectedFile) return;
    setCoverDraft('');
    setCoverError(false);
    onMetaChange?.(selectedFile.id, { cover: '' });
  };

  const selectLocalCoverImage = async () => {
    if (!hasElectronSelectCoverImage()) return;
    const result = await window.electronAPI.selectCoverImage();
    if (result?.canceled || !result?.filePath) return;
    setCoverDraft(result.filePath);
    setCoverError(false);
    onMetaChange?.(selectedFile.id, { cover: result.filePath });
  };

  const handleTagsChange = (nextTags) => {
    if (!selectedFile || !onTagsChange) return;
    onTagsChange(selectedFile.id, nextTags);
  };

  const handlePlatformToggle = (value) => {
    if (!selectedFile) return;
    onMetaChange?.(selectedFile.id, { targetPlatforms: buildPlatformPatch(currentPlatforms, value) });
  };

  const addRelatedDoc = (targetId) => {
    if (!selectedFile || !targetId) return;
    onMetaChange?.(selectedFile.id, { relatedIds: [...(selectedFile.relatedIds ?? []), targetId] });
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

      {/* ── cover image ── */}
      <div className="doc-meta-field">
        <div className="doc-meta-section-head">
          <span className="doc-meta-label">
            <Image size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            封面图片
          </span>
          <span className="doc-meta-cover-actions">
            {hasElectronSelectCoverImage() && (
              <button type="button" className="doc-meta-action" onClick={selectLocalCoverImage} disabled={disabled}>选择图片</button>
            )}
            {coverDraft && (
              <button type="button" className="doc-meta-action" onClick={clearCover} disabled={disabled}>清除</button>
            )}
          </span>
        </div>
        <input
          className="doc-meta-input"
          value={coverDraft}
          placeholder="输入图片 URL 或本地路径"
          onChange={(e) => { setCoverDraft(e.target.value); setCoverError(false); }}
          onBlur={commitCover}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitCover(); }
            if (e.key === 'Escape') { e.preventDefault(); setCoverDraft(selectedFile?.cover ?? ''); setCoverError(false); }
          }}
          disabled={disabled}
        />
        {coverDraft && (
          <div className="doc-meta-cover-preview">
            {coverError ? (
              <div className="doc-meta-cover-fallback">图片加载失败</div>
            ) : (
              <img
                src={toPreviewSrc(coverDraft)}
                alt="封面预览"
                className="doc-meta-cover-thumb"
                onError={() => setCoverError(true)}
              />
            )}
          </div>
        )}
      </div>

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

      <div className="doc-meta-field">
        <span className="doc-meta-label">标签</span>
        <Select
          mode="tags"
          size="small"
          className="doc-meta-tag-select"
          value={selectedFile.tags ?? []}
          options={reusableTags}
          placeholder="选择已有标签或直接输入"
          onChange={handleTagsChange}
          disabled={disabled || !onTagsChange}
          maxTagCount="responsive"
          open={reusableTags.length > 0 ? undefined : false}
          popupClassName="doc-meta-tag-select-dropdown"
        />
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
        <RelatedDocPicker
          key={selectedFile.id}
          selectedFile={selectedFile}
          allFiles={allFiles}
          onAdd={addRelatedDoc}
          disabled={disabled}
        />
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
          <button
            type="button"
            className="doc-meta-history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <Clock size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            版本历史
            <span className="doc-meta-history-count">{versions.length}</span>
            <span className="doc-meta-history-arrow">{historyOpen ? '▲' : '▼'}</span>
          </button>
          {historyOpen && (
            <div className="doc-meta-versions-list">
              {versions.slice(0, 10).map((ver) => (
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
          )}
        </>
      )}
    </div>
  );
}
