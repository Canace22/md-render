import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import DocMetaPanel from './DocMetaPanel.jsx';

/**
 * 文档标题块 —— 下沉进纸面，与正文同列。
 *
 * 标题下保留所属目录，后面紧跟一个轻量的「元数据」文字开关（不再推到最右）；
 * 字数与字符数统一由底部状态栏展示。
 */
export default function DocHeader({
  selectedFile,
  parentLabel,
  allFiles,
  platformOptions,
  onTagsChange,
  onKnowledgeMetaChange,
  onFrontmatterPropertyChange,
  onOpenFile,
  onOpenVersionHistory,
  readOnly = false,
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
          {parentLabel && <span className="doc-title-meta-sep">·</span>}
          <button
            type="button"
            className={`doc-meta-inline${metaOpen ? ' is-open' : ''}`}
            onClick={() => setMetaOpen((o) => !o)}
            title={metaOpen ? '收起元数据' : '展开元数据'}
          >
            <span>元数据</span>
            <ChevronDown size={12} strokeWidth={2} className="doc-meta-inline-icon" />
          </button>
        </div>
      )}
      {selectedFile?.frontmatterError && (
        <div className="doc-frontmatter-error" role="note">
          这篇文档开头的元数据（frontmatter）格式有误，现在只按正文读取，标签、状态等属性没有生效；在文件里修好后会自动恢复。
        </div>
      )}
      {selectedFile && metaOpen && (
        <DocMetaPanel
          selectedFile={selectedFile}
          allFiles={allFiles}
          platformOptions={platformOptions}
          onMetaChange={onKnowledgeMetaChange}
          onFrontmatterPropertyChange={onFrontmatterPropertyChange}
          onTagsChange={onTagsChange}
          onOpenFile={onOpenFile}
          onOpenVersionHistory={onOpenVersionHistory}
          disabled={readOnly}
        />
      )}
    </header>
  );
}
