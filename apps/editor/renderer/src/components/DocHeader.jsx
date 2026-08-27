import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import DocMetaPanel from './DocMetaPanel.jsx';

/**
 * 文档标题块 —— 下沉进纸面，与正文同列。
 *
 * 标题下保留所属目录，元数据面板收在同一行的开关里；
 * 字数与字符数统一由底部状态栏展示。
 */
export default function DocHeader({
  selectedFile,
  parentLabel,
  allFiles,
  platformOptions,
  onTagsChange,
  onKnowledgeMetaChange,
  onOpenFile,
  onRestoreVersion,
  titleEditable = true,
  isTitleEditing,
  titleDraft,
  titleInputRef,
  startTitleEditing,
  commitTitleEditing,
  cancelTitleEditing,
  setTitleDraft,
}) {
  const [metaOpen, setMetaOpen] = useState(false);
  const selectedFileDisplayName = stripFileExtension(selectedFile?.name);

  return (
    <header className="doc-title-block">
      <h1 className="right-area-doc-title">
        {titleEditable && isTitleEditing ? (
          <input
            ref={titleInputRef}
            className="doc-title-input"
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
            className="doc-title-text"
            onClick={startTitleEditing}
            role="button"
            tabIndex={0}
            title="编辑标题"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startTitleEditing();
              }
            }}
          >
            {selectedFileDisplayName}
          </span>
        ) : (
          <span className="doc-title-text is-readonly">{selectedFileDisplayName}</span>
        )}
      </h1>
      {selectedFile && (
        <div className="doc-title-meta">
          {parentLabel && <span>{parentLabel}</span>}
          <button
            type="button"
            className={`doc-meta-toggle${metaOpen ? ' is-open' : ''}`}
            onClick={() => setMetaOpen((o) => !o)}
            title={metaOpen ? '收起元数据' : '展开元数据'}
          >
            <ChevronDown size={13} strokeWidth={2} className="doc-meta-toggle-icon" />
            <span>元数据</span>
          </button>
        </div>
      )}
      {selectedFile && metaOpen && (
        <DocMetaPanel
          selectedFile={selectedFile}
          allFiles={allFiles}
          platformOptions={platformOptions}
          onMetaChange={onKnowledgeMetaChange}
          onTagsChange={onTagsChange}
          onOpenFile={onOpenFile}
          onRestoreVersion={onRestoreVersion}
        />
      )}
    </header>
  );
}
