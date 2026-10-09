// BlockNote 的 Backspace 只会把空块合并/删除到「上一个块」，
// 文档第一个块没有上一个块，所以首行空段落按 Backspace 删不掉。
// 这里补上：首行是空段落且后面还有块时，删掉它并把光标移到下一个块开头。

const hasModifier = (event) => event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

const isEmptyParagraph = (block) => block?.type === 'paragraph'
  && (!Array.isArray(block.content) || block.content.length === 0)
  && (!block.children || block.children.length === 0);

/** 返回需要删除的首行空块和光标目标块；不满足条件返回 null。 */
export const getLeadingEmptyBlockRemoval = (editor) => {
  if (!editor?.prosemirrorState?.selection?.empty) return null;

  const { block, prevBlock, nextBlock, parentBlock } = editor.getTextCursorPosition() ?? {};
  if (prevBlock || parentBlock || !nextBlock) return null;
  if (!isEmptyParagraph(block)) return null;

  return { block, nextBlock };
};

/** onKeyDownCapture 里调用；处理了返回 true。 */
export const handleLeadingEmptyBlockBackspace = (editor, event) => {
  if (event.key !== 'Backspace' || event.isComposing || hasModifier(event)) return false;

  const removal = getLeadingEmptyBlockRemoval(editor);
  if (!removal) return false;

  event.preventDefault();
  editor.transact(() => {
    editor.removeBlocks([removal.block]);
    editor.setTextCursorPosition(removal.nextBlock, 'start');
  });
  return true;
};
