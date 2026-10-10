/** 把光标放到某个块末尾并滚到视野中间（导图点节点回大纲用）；块不存在就什么都不做 */
export const focusOutlineBlock = (editor, blockId) => {
  if (!editor || !blockId || !editor.getBlock(blockId)) return false;
  // 等编辑器挂到 DOM 上再聚焦
  requestAnimationFrame(() => {
    try {
      editor.setTextCursorPosition(blockId, 'end');
      editor.focus();
    } catch {
      // 图片等没有文字的块放不了光标，只滚动
    }
    const element = editor.domElement?.querySelector(`[data-id="${CSS.escape(blockId)}"]`);
    element?.scrollIntoView({ block: 'center' });
  });
  return true;
};
