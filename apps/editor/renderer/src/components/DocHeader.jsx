import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { countWords } from '../utils/wordCount.js';
import DraftMetaPanel from './DraftMetaPanel.jsx';
import KnowledgeMetaPanel from './KnowledgeMetaPanel.jsx';
import TagBar from './TagBar.jsx';

export default function DocHeader({
  selectedFile,
  allFiles,
  onTagsChange,
  onKnowledgeMetaChange,
  onOpenFile,
  onRestoreVersion,
  titleEditable = true,
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
  const [metaOpen, setMetaOpen] = useState(false);
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
          {titleEditable && isTitleEditing ? (
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
          ) : titleEditable ? (
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
          ) : (
            <span>{selectedFile?.name ?? '未命名'}</span>
          )}
          {selectedFile && (
            <span className="right-area-doc-wordcount" data-testid="doc-wordcount">
              {wordCount} 字
            </span>
          )}
        </div>
        {selectedFile && (
          <button
            type="button"
            className={`doc-meta-toggle${metaOpen ? ' is-open' : ''}`}
            onClick={() => setMetaOpen((o) => !o)}
            title={metaOpen ? '收起元数据' : '展开元数据'}
          >
            <ChevronDown size={13} strokeWidth={2} className="doc-meta-toggle-icon" />
            <span>元数据</span>
          </button>
        )}
      </div>
      {selectedFile && metaOpen && (
        <>
          <TagBar
            tags={selectedFile.tags ?? []}
            onChange={(nextTags) => onTagsChange?.(selectedFile.id, nextTags)}
          />
          <DraftMetaPanel
            selectedFile={selectedFile}
            allFiles={allFiles}
            onDraftMetaChange={onKnowledgeMetaChange}
            onOpenFile={onOpenFile}
          />
          <KnowledgeMetaPanel
            selectedFile={selectedFile}
            allFiles={allFiles}
            onKnowledgeMetaChange={onKnowledgeMetaChange}
            onOpenFile={onOpenFile}
            onRestoreVersion={onRestoreVersion}
          />
        </>
      )}
    </div>
  );
}
