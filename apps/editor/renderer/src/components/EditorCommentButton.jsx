import { useCallback } from 'react';
import { message } from 'antd';
import { MessageSquarePlus } from 'lucide-react';
import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react';
import { useEditorStore } from '../store/useEditorStore.js';
import { captureCommentAnchor } from '../utils/commentAnchors.js';

const ICON_SIZE = 16;

/** 选区工具栏最前面的「评论」按钮（参照 Claude Cowork）：记下选区锚点，在右侧面板写评论 */
export default function EditorCommentButton() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const fileId = useEditorStore((state) => state.selectedId);
  const startCommentDraft = useEditorStore((state) => state.startCommentDraft);

  const handleClick = useCallback(() => {
    const anchor = captureCommentAnchor(editor);
    if (!anchor) {
      message.info('请选中一段文字再评论');
      return;
    }
    startCommentDraft(fileId, anchor);
  }, [editor, fileId, startCommentDraft]);

  if (!Components || !fileId) return null;

  return (
    <Components.FormattingToolbar.Button
      className="bn-button editor-comment-toolbar-button"
      label="评论"
      mainTooltip="评论"
      icon={<MessageSquarePlus size={ICON_SIZE} />}
      onClick={handleClick}
    />
  );
}
