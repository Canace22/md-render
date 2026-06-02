import { Cloud } from 'lucide-react';
import { countWords } from '../utils/wordCount.js';
import TagBar from './TagBar.jsx';

export default function DocHeader({
  selectedFile,
  onOpenNotion,
  notionLinked,
  onTagsChange,
  isTitleEditing,
  titleDraft,
  titleInputWidth,
  titleInputRef,
  titleMeasureRef,
  startTitleEditing,
  commitTitleEditing,
  cancelTitleEditing,
  setTitleDraft,
}) {
  const displayName = titleDraft || selectedFile?.name || '未命名';
  const wordCount = selectedFile ? countWords(selectedFile.content) : 0;

  return (
    <div className="right-area-header-wrap">
    <div className="right-area-header">
      <div className="right-area-doc-title">
        <span
          ref={titleMeasureRef}
          className="right-area-doc-title-measure"
          aria-hidden="true"
        >
          {displayName}
        </span>
        {isTitleEditing ? (
          <input
            ref={titleInputRef}
            className="right-area-doc-title-input"
            style={{ width: `${titleInputWidth}px` }}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitleEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTitleEditing();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelTitleEditing();
              }
            }}
            aria-label="编辑文件标题"
          />
        ) : (
          <span
            className="right-area-doc-title-clickable"
            onClick={startTitleEditing}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startTitleEditing();
              }
            }}
          >
            {selectedFile?.name ?? '未命名'}
          </span>
        )}
        {selectedFile && (
          <span className="right-area-doc-wordcount" data-testid="doc-wordcount">
            {wordCount} 字
          </span>
        )}
      </div>
      <div className="right-area-actions">
        {onOpenNotion && (
          <button
            type="button"
            className={`doc-header-notion-btn ${notionLinked ? 'is-linked' : ''}`}
            data-testid="open-notion-from-header"
            onClick={onOpenNotion}
            title="Notion 同步"
          >
            <Cloud size={16} strokeWidth={1.6} />
            <span>Notion</span>
          </button>
        )}
      </div>
    </div>
    {selectedFile && (
      <TagBar
        tags={selectedFile.tags ?? []}
        onChange={(nextTags) => onTagsChange?.(selectedFile.id, nextTags)}
      />
    )}
    </div>
  );
}
