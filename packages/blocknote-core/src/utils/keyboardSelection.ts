/**
 * 键盘快捷键与选区机制（与 BlockNote / ProseMirror 对齐）。
 *
 * 通用机制，无业务语义：
 * - 全选快捷键识别
 * - 块内联内容选区范围计算
 * - 「再按一次 Ctrl+A 提升为全选」的判定
 */

import type { Node } from '@tiptap/pm/model';
import { AllSelection, TextSelection, type Transaction } from '@tiptap/pm/state';

export interface ISelectAllShortcutLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function isSelectAllShortcut(event: ISelectAllShortcutLike): boolean {
  return (event.ctrlKey || event.metaKey)
    && event.key.toLowerCase() === 'a'
    && !event.altKey
    && !event.shiftKey;
}

export interface IBlockInlineContentRange {
  from: number;
  to: number;
}

/** 在 ProseMirror 文档中定位 BlockNote 块（bnBlock 组） */
function findBnBlockById(
  doc: Node,
  blockId: string,
): { node: Node; posBeforeNode: number } | undefined {
  const root = doc.firstChild;
  if (!root) return undefined;

  let target: { node: Node; posBeforeNode: number } | undefined;
  root.descendants((node, pos) => {
    if (target) return false;
    if (!node.type.isInGroup('bnBlock') || node.attrs.id !== blockId) {
      return true;
    }
    target = { node, posBeforeNode: pos + 1 };
    return false;
  });
  return target;
}

/**
 * 计算块内联内容的选区范围（与 BlockNote setSelection 对齐）。
 */
export function resolveBlockInlineContentRange(
  doc: Node,
  blockId: string,
): IBlockInlineContentRange | null {
  const block = findBnBlockById(doc, blockId);
  if (!block || block.node.type.name !== 'blockContainer') {
    return null;
  }

  let contentBeforePos: number | null = null;
  let contentAfterPos: number | null = null;
  const bnBlockBeforePos = block.posBeforeNode;

  block.node.forEach((child, offset) => {
    if (child.type.spec.group === 'blockContent') {
      contentBeforePos = bnBlockBeforePos + offset + 1;
      contentAfterPos = contentBeforePos + child.nodeSize;
    }
  });

  if (contentBeforePos === null || contentAfterPos === null) {
    return null;
  }

  const from = contentBeforePos + 1;
  const to = contentAfterPos - 1;
  return { from, to: Math.max(from, to) };
}

export interface IKeyboardSelectionEditor {
  transact<T>(callback: (transaction: Transaction) => T): T;
  focus(): void;
}

/** 选中光标所在的最近文本块，并保持编辑器焦点。 */
export function selectCurrentTextBlockContent(editor: IKeyboardSelectionEditor): boolean {
  const selected = editor.transact((transaction) => {
    const { $anchor } = transaction.selection;
    for (let depth = $anchor.depth; depth > 0; depth -= 1) {
      if (!$anchor.node(depth).isTextblock) continue;
      transaction
        .setSelection(TextSelection.create(
          transaction.doc,
          $anchor.start(depth),
          $anchor.end(depth),
        ))
        .scrollIntoView();
      return true;
    }
    return false;
  });
  if (selected) editor.focus();
  return selected;
}

/** 选中 ProseMirror 编辑器全文，并保持编辑器焦点。 */
export function selectAllEditorContent(editor: IKeyboardSelectionEditor): boolean {
  editor.transact((transaction) => {
    transaction
      .setSelection(new AllSelection(transaction.doc))
      .scrollIntoView();
  });
  editor.focus();
  return true;
}

/**
 * 判断当前块选区是否应提升为「全选」。
 * 用于 Ctrl+A 两段式：首次选当前块，再按全选全文。
 */
export function shouldPromoteBlockSelectionToFullSelection(
  currentBlockId: string,
  selectedBlockIds: readonly string[],
  pendingBlockId: string | null,
): boolean {
  if (pendingBlockId !== currentBlockId) return false;
  if (selectedBlockIds.length === 0) return true;
  if (selectedBlockIds.length === 1) {
    return selectedBlockIds[0] === currentBlockId;
  }
  // 首次 Ctrl+A 若选区计算越界，getSelection 可能误报多块；仍以 pending 为准允许全选
  return selectedBlockIds.includes(currentBlockId);
}
