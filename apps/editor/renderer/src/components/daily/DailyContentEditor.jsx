import { lazy, Suspense, useCallback } from 'react';
import { Button, Input } from 'antd';

/**
 * 今日速记的内容编辑区（富文本 + 保存/取消按钮）。
 * 今日记录与待办池共用，保证两处输入体验一致。
 */

// BlockNote 依赖 DOM，node 环境（vitest 静态渲染）加载不了；
// lazy 只在真正渲染时才发起 import，所以静态渲染路径永远不会碰到它。
const DailyRichTextEditor = lazy(() => import('./DailyRichTextEditor.jsx'));

const canUseDOM = typeof window !== 'undefined'
  && typeof window.document?.createElement === 'function';

const EDITOR_HINT = '选中文字可加粗 / 变色，输入 “/” 插入列表，回车换行，⌘/Ctrl + Enter 保存';

function DailyContentEditor({
  editorKey,
  text,
  richText,
  placeholder,
  onChange,
  onSave,
  onCancel,
}) {
  const canSave = Boolean(text?.trim());

  const handlePlainChange = useCallback((event) => {
    onChange({ text: event.target.value, richText: [] });
  }, [onChange]);

  const handlePlainKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && text?.trim()) {
      event.preventDefault();
      onSave();
    }
  }, [onCancel, onSave, text]);

  // 富文本 chunk 还没到（或没有 DOM）时的降级输入框：至少能换行
  const plainEditor = (
    <Input.TextArea
      autoFocus
      value={text}
      placeholder={placeholder}
      autoSize={{ minRows: 1, maxRows: 8 }}
      onChange={handlePlainChange}
      onKeyDown={handlePlainKeyDown}
    />
  );

  return (
    <div className="daily-notebook-item-editor-row">
      <div className="daily-notebook-item-editor-input">
        {canUseDOM ? (
          <Suspense fallback={plainEditor}>
            <DailyRichTextEditor
              key={editorKey}
              text={text}
              richText={richText}
              placeholder={placeholder}
              onChange={onChange}
              onSubmit={onSave}
              onCancel={onCancel}
            />
          </Suspense>
        ) : plainEditor}
        <p className="daily-notebook-editor-hint">{EDITOR_HINT}</p>
      </div>
      <div className="daily-notebook-item-editor-actions">
        <Button type="primary" size="small" disabled={!canSave} onClick={onSave}>
          保存
        </Button>
        {canSave ? (
          <Button size="small" onClick={onCancel}>
            取消
          </Button>
        ) : (
          <Button size="small" danger onClick={onCancel}>
            删除
          </Button>
        )}
      </div>
    </div>
  );
}

export default DailyContentEditor;
