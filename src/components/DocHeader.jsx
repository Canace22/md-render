export default function DocHeader({
  selectedFile,
  mode,
  toggleMode,
  novelPanelOpen,
  toggleNovelPanel,
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

  return (
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
      </div>
      <div className="right-area-actions">
        <button
          type="button"
          className={`novel-mode-toggle ${mode === 'novel' ? 'active' : ''}`}
          data-testid="toggle-novel-mode"
          onClick={toggleMode}
        >
          {mode === 'novel' ? '退出小说模式' : '小说模式'}
        </button>
        {mode === 'novel' && (
          <button
            type="button"
            className="novel-panel-toggle"
            data-testid="toggle-novel-panel"
            onClick={toggleNovelPanel}
          >
            {novelPanelOpen ? '收起助手' : '展开助手'}
          </button>
        )}
      </div>
    </div>
  );
}
