import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileText, Link2, NotebookPen, PackageSearch } from 'lucide-react';
import { PUBLISHING_PLATFORM_OPTIONS } from '../utils/publishingPlatforms.js';

const DEFAULT_STATUS_OPTIONS = [
  { value: 'idea', label: '选题中' }, { value: 'drafting', label: '写作中' }, { value: 'review', label: '待审阅' },
  { value: 'scheduled', label: '待发布' }, { value: 'published', label: '已发布' },
];

const normalizePlatforms = (selectedFile) => {
  const value = selectedFile?.targetPlatforms ?? selectedFile?.platforms ?? [];
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return value ? [value] : [];
};

const normalizeRelatedDocs = (selectedFile, filesById) => {
  return (selectedFile?.relatedIds ?? [])
    .map((id) => filesById.get(id))
    .filter(Boolean);
};

const normalizeSourceMaterials = (selectedFile, filesById) => {
  const value = selectedFile?.sourceMaterials ?? selectedFile?.sourceMaterialIds ?? [];
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const linkedFile = filesById.get(item);
        return {
          key: item,
          label: linkedFile?.name ?? item,
          linkedFileId: linkedFile?.id ?? null,
          tone: linkedFile ? 'linked' : 'plain',
        };
      }

      if (!item || typeof item !== 'object') return null;

      const linkedId = item.fileId ?? item.documentId ?? item.id ?? null;
      const linkedFile = linkedId ? filesById.get(linkedId) : null;

      return {
        key: linkedId ?? item.url ?? item.title ?? `source-${index}`,
        label: item.title ?? item.name ?? linkedFile?.name ?? '未命名素材',
        linkedFileId: linkedFile?.id ?? null,
        tone: item.url ? 'external' : linkedFile ? 'linked' : 'plain',
      };
    })
    .filter(Boolean);
};

const buildVisiblePlatformOptions = (platformOptions, currentPlatforms) => {
  const baseOptions = Array.isArray(platformOptions) ? platformOptions : [];
  const knownValues = new Set(baseOptions.map((option) => option.value));
  const extraOptions = currentPlatforms
    .filter((value) => !knownValues.has(value))
    .map((value) => ({ value, label: value }));
  return [...baseOptions, ...extraOptions];
};

const buildPlatformPatch = (currentPlatforms, value) => {
  if (currentPlatforms.includes(value)) {
    return currentPlatforms.filter((item) => item !== value);
  }
  return [...currentPlatforms, value];
};

const getCurrentStatusValue = (selectedFile) => {
  return selectedFile?.draftStatus ?? selectedFile?.status ?? 'drafting';
};

const getStatusLabel = (statusOptions, value) => {
  return statusOptions.find((option) => option.value === value)?.label ?? value;
};

export default function DraftMetaPanel({
  selectedFile,
  allFiles = [],
  onDraftMetaChange,
  onOpenFile,
  onManageSourceMaterials,
  onManageRelatedDocs,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  platformOptions = PUBLISHING_PLATFORM_OPTIONS,
  disabled = false,
}) {
  const [summaryDraft, setSummaryDraft] = useState('');
  const [publishAtDraft, setPublishAtDraft] = useState('');

  useEffect(() => {
    setSummaryDraft(selectedFile?.summary ?? '');
    setPublishAtDraft(selectedFile?.scheduledPublishAt ?? selectedFile?.publishAt ?? '');
  }, [selectedFile]);

  const filesById = useMemo(() => {
    return new Map((allFiles ?? []).map((file) => [file.id, file]));
  }, [allFiles]);

  const currentPlatforms = useMemo(() => normalizePlatforms(selectedFile), [selectedFile]);
  const visiblePlatformOptions = useMemo(
    () => buildVisiblePlatformOptions(platformOptions, currentPlatforms),
    [platformOptions, currentPlatforms],
  );
  const relatedDocs = useMemo(() => normalizeRelatedDocs(selectedFile, filesById), [selectedFile, filesById]);
  const sourceMaterials = useMemo(() => normalizeSourceMaterials(selectedFile, filesById), [selectedFile, filesById]);
  const currentStatus = getCurrentStatusValue(selectedFile);

  const commitSummary = () => {
    if (!selectedFile) return;
    const nextSummary = summaryDraft.trim();
    if (nextSummary === (selectedFile.summary ?? '')) return;
    onDraftMetaChange?.(selectedFile.id, { summary: nextSummary });
  };

  const commitPublishAt = () => {
    if (!selectedFile) return;
    const nextPublishAt = publishAtDraft.trim();
    const currentPublishAt = selectedFile.scheduledPublishAt ?? selectedFile.publishAt ?? '';
    if (nextPublishAt === currentPublishAt) return;
    onDraftMetaChange?.(selectedFile.id, { scheduledPublishAt: nextPublishAt });
  };

  const handleStatusChange = (event) => {
    if (!selectedFile) return;
    onDraftMetaChange?.(selectedFile.id, { draftStatus: event.target.value });
  };

  const handlePlatformToggle = (value) => {
    if (!selectedFile) return;
    const nextPlatforms = buildPlatformPatch(currentPlatforms, value);
    onDraftMetaChange?.(selectedFile.id, { targetPlatforms: nextPlatforms });
  };

  if (!selectedFile) return null;

  return (
    <div className="draft-meta-panel" data-testid="draft-meta-panel">
      <div className="draft-meta-panel-head">
        <div className="draft-meta-panel-title-group">
          <span className="draft-meta-kicker">Draft Metadata</span>
          <h3 className="draft-meta-title">稿件元数据</h3>
        </div>
        <span className="draft-meta-status-badge">
          <NotebookPen size={13} strokeWidth={1.8} />
          <span>{getStatusLabel(statusOptions, currentStatus)}</span>
        </span>
      </div>

      <div className="draft-meta-grid">
        <label className="draft-meta-field">
          <span className="draft-meta-label">稿件状态</span>
          <select
            className="draft-meta-select"
            value={currentStatus}
            onChange={handleStatusChange}
            disabled={disabled}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="draft-meta-field">
          <span className="draft-meta-label">目标平台</span>
          <div className="draft-meta-platform-list" role="group" aria-label="选择目标平台">
            {visiblePlatformOptions.map((option) => {
              const checked = currentPlatforms.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`draft-meta-platform-chip${checked ? ' is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="draft-meta-platform-input"
                    checked={checked}
                    onChange={() => handlePlatformToggle(option.value)}
                    disabled={disabled}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <label className="draft-meta-field draft-meta-field--summary">
          <span className="draft-meta-label">摘要</span>
          <textarea
            className="draft-meta-textarea"
            value={summaryDraft}
            placeholder="一句话说清这篇稿子的核心观点、读者收益或主叙事。"
            onChange={(event) => setSummaryDraft(event.target.value)}
            onBlur={commitSummary}
            disabled={disabled}
          />
        </label>

        <label className="draft-meta-field">
          <span className="draft-meta-label">
            <CalendarClock size={13} strokeWidth={1.8} className="draft-meta-label-icon" />
            发布时间占位
          </span>
          <input
            className="draft-meta-input"
            value={publishAtDraft}
            placeholder="例如：周三 20:00 / 2026-06-18 09:00"
            onChange={(event) => setPublishAtDraft(event.target.value)}
            onBlur={commitPublishAt}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPublishAt();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setPublishAtDraft(selectedFile?.scheduledPublishAt ?? selectedFile?.publishAt ?? '');
              }
            }}
            disabled={disabled}
          />
          <div className="draft-meta-hint">先占排期位，后续再接发布日历或多平台排程。</div>
        </label>

        <div className="draft-meta-field">
          <div className="draft-meta-section-head">
            <span className="draft-meta-label">
              <PackageSearch size={13} strokeWidth={1.8} className="draft-meta-label-icon" />
              来源素材
            </span>
            <button
              type="button"
              className="draft-meta-action"
              onClick={() => onManageSourceMaterials?.(selectedFile.id)}
              disabled={disabled || !onManageSourceMaterials}
            >
              管理素材
            </button>
          </div>
          {sourceMaterials.length > 0 ? (
            <div className="draft-meta-chip-list">
              {sourceMaterials.map((item) => {
                const openable = Boolean(item.linkedFileId && onOpenFile);
                const Element = openable ? 'button' : 'span';
                return (
                  <Element
                    key={item.key}
                    type={openable ? 'button' : undefined}
                    className={`draft-meta-chip draft-meta-chip--${item.tone}`}
                    onClick={openable ? () => onOpenFile(item.linkedFileId) : undefined}
                  >
                    <span>{item.label}</span>
                  </Element>
                );
              })}
            </div>
          ) : (
            <div className="draft-meta-placeholder">
              <span>这里先挂素材占位，后续可接书签、稍后读、摘录或采访记录。</span>
            </div>
          )}
        </div>

        <div className="draft-meta-field">
          <div className="draft-meta-section-head">
            <span className="draft-meta-label">
              <Link2 size={13} strokeWidth={1.8} className="draft-meta-label-icon" />
              关联文档
            </span>
            <button
              type="button"
              className="draft-meta-action"
              onClick={() => onManageRelatedDocs?.(selectedFile.id)}
              disabled={disabled || !onManageRelatedDocs}
            >
              管理关联
            </button>
          </div>
          {relatedDocs.length > 0 ? (
            <div className="draft-meta-chip-list">
              {relatedDocs.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className="draft-meta-chip draft-meta-chip--linked"
                  onClick={() => onOpenFile?.(file.id)}
                >
                  <FileText size={12} strokeWidth={1.8} />
                  <span>{file.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="draft-meta-placeholder">
              <span>这里先挂关联文档占位，后续可接知识库条目、参考稿和历史版本稿件。</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
