/**
 * 编辑器块插入机制（通用，无业务语义）。
 *
 * 把「在当前块后插入 / 空块替换 / 末尾追加 / 文档为空时 replace」这套
 * BlockNote 插入逻辑收口，供斜杠菜单、工具栏复用。不认识任何具体块类型。
 */

export type BlockContentItem = {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
};

/** 字符串 → BlockNote content 数组 */
export function stringToBlockContent(text: string): BlockContentItem[] {
  if (!text) return [];
  return [{ type: 'text', text, styles: {} }];
}

export interface InsertBlockSpec {
  type: string;
  content?: string | BlockContentItem[];
  props?: Record<string, unknown>;
}

export interface BlockInsertEditorLike {
  topLevelBlocks: Array<{ id: string; type: string; content?: unknown }>;
  getTextCursorPosition: () => { block?: { id: string; type: string; content?: unknown } } | null;
  insertBlocks: (...args: unknown[]) => Array<{ id: string; type: string }> | undefined;
  removeBlocks: (...args: unknown[]) => void;
  replaceBlocks: (...args: unknown[]) => void;
  setTextCursorPosition: (block: { id: string; type: string }, position: 'start' | 'end') => void;
  document: unknown;
}

export interface InsertOrUpdateOptions {
  onAfterInsert?: (insertedBlockId: string) => void;
}

function normalizeContent(block: InsertBlockSpec): Record<string, unknown> {
  if (typeof block.content === 'string') {
    block.content = stringToBlockContent(block.content);
  }
  return block as unknown as Record<string, unknown>;
}

function isBlockEmpty(content: unknown): boolean {
  return (
    !content ||
    (Array.isArray(content) && content.length === 0) ||
    (typeof content === 'string' && (content as string).trim() === '')
  );
}

/**
 * 若当前光标所在块为空则替换，否则在其后插入新块。
 * 用「先插入后删除」避免 ReactNodeViewRenderer 报错。
 */
export function insertOrUpdateBlock(
  editor: BlockInsertEditorLike,
  block: InsertBlockSpec,
  options?: InsertOrUpdateOptions,
): void {
  const blockPayload = normalizeContent(block);
  const afterInsert = options?.onAfterInsert;
  try {
    const currentBlock = editor.getTextCursorPosition()?.block;

    if (currentBlock && isBlockEmpty((currentBlock as { content?: unknown }).content)) {
      const blockIndex = editor.topLevelBlocks.findIndex((b) => b.id === currentBlock.id);
      editor.insertBlocks([blockPayload], currentBlock.id, 'after');
      editor.removeBlocks([currentBlock.id]);
      const blockTypeToFind = block.type;
      setTimeout(() => {
        const blocks = editor.topLevelBlocks;
        const target =
          blockIndex >= 0 && blockIndex < blocks.length
            ? blocks[blockIndex]
            : blocks.find((b) => (b as { type: string }).type === blockTypeToFind);
        if (target) {
          editor.setTextCursorPosition(target, 'end');
          afterInsert?.(target.id);
        }
      }, 0);
      return;
    }

    if (currentBlock) {
      const blockIndex = editor.topLevelBlocks.findIndex((b) => b.id === currentBlock.id);
      editor.insertBlocks([blockPayload], currentBlock.id, 'after');
      const newBlocks = editor.topLevelBlocks;
      const insertedBlock =
        blockIndex >= 0 && blockIndex + 1 < newBlocks.length
          ? newBlocks[blockIndex + 1]
          : newBlocks.find((b) => (b as { type: string }).type === block.type);
      if (insertedBlock) {
        editor.setTextCursorPosition(insertedBlock, 'end');
        afterInsert?.(insertedBlock.id);
      }
      return;
    }

    insertAtDocumentEnd(editor, blockPayload, afterInsert);
  } catch {
    insertAtDocumentEnd(editor, blockPayload, afterInsert);
  }
}

function insertAtDocumentEnd(
  editor: BlockInsertEditorLike,
  blockPayload: Record<string, unknown>,
  afterInsert?: (id: string) => void,
): void {
  const topLevelBlocks = editor.topLevelBlocks;
  if (topLevelBlocks.length > 0) {
    const lastBlock = topLevelBlocks[topLevelBlocks.length - 1];
    editor.insertBlocks([blockPayload], lastBlock.id, 'after');
    const newBlocks = editor.topLevelBlocks;
    const insertedBlock = newBlocks[newBlocks.length - 1];
    if (insertedBlock) {
      editor.setTextCursorPosition(insertedBlock, 'end');
      afterInsert?.(insertedBlock.id);
    }
  } else {
    editor.replaceBlocks(editor.document, [blockPayload]);
    const newBlocks = editor.topLevelBlocks;
    const firstBlock = newBlocks.length > 0 ? newBlocks[0] : undefined;
    if (firstBlock) {
      editor.setTextCursorPosition(firstBlock, 'end');
      afterInsert?.(firstBlock.id);
    }
  }
}

/** 纯插入新块（不做空块替换，用于工具栏） */
export function insertNewBlockOnly(
  editor: BlockInsertEditorLike,
  block: InsertBlockSpec,
  options?: { skipSetCursor?: boolean },
): string | undefined {
  const blockPayload = normalizeContent(block);
  const setCursor = (insertedBlock: { id: string } | undefined) => {
    if (insertedBlock && !options?.skipSetCursor) {
      editor.setTextCursorPosition(
        insertedBlock as { id: string; type: string },
        'end',
      );
    }
    return insertedBlock?.id;
  };

  try {
    const currentBlock = editor.getTextCursorPosition()?.block;
    const topLevelBlocks = editor.topLevelBlocks;
    let insertedBlock: { id: string } | undefined;

    if (currentBlock) {
      const blockIndex = topLevelBlocks.findIndex((b) => b.id === currentBlock.id);
      editor.insertBlocks([blockPayload], currentBlock.id, 'after');
      const newBlocks = editor.topLevelBlocks;
      insertedBlock =
        blockIndex >= 0 && blockIndex + 1 < newBlocks.length
          ? newBlocks[blockIndex + 1]
          : newBlocks.find((b) => (b as { type: string }).type === block.type);
    } else if (topLevelBlocks.length > 0) {
      const lastBlock = topLevelBlocks[topLevelBlocks.length - 1];
      editor.insertBlocks([blockPayload], lastBlock.id, 'after');
      const newBlocks = editor.topLevelBlocks;
      insertedBlock = newBlocks[newBlocks.length - 1];
    } else {
      editor.replaceBlocks(editor.document, [blockPayload]);
      const newBlocks = editor.topLevelBlocks;
      insertedBlock = newBlocks.length > 0 ? newBlocks[0] : undefined;
    }
    return setCursor(insertedBlock);
  } catch {
    const topLevelBlocks = editor.topLevelBlocks;
    let insertedBlock: { id: string } | undefined;
    if (topLevelBlocks.length > 0) {
      const lastBlock = topLevelBlocks[topLevelBlocks.length - 1];
      editor.insertBlocks([blockPayload], lastBlock.id, 'after');
      const newBlocks = editor.topLevelBlocks;
      insertedBlock = newBlocks[newBlocks.length - 1];
    } else {
      editor.replaceBlocks(editor.document, [blockPayload]);
      const newBlocks = editor.topLevelBlocks;
      insertedBlock = newBlocks.length > 0 ? newBlocks[0] : undefined;
    }
    return setCursor(insertedBlock);
  }
}

/** 按 title / aliases 过滤建议项（斜杠菜单通用） */
export function filterSuggestionItemsByQuery<
  T extends { title: string; aliases?: string[] },
>(items: T[], query: string): T[] {
  if (!query || query.trim() === '') return items;
  const lowerQuery = query.toLowerCase().trim();
  return items.filter((item) => {
    if (item.title.toLowerCase().includes(lowerQuery)) return true;
    if (item.aliases && Array.isArray(item.aliases)) {
      return item.aliases.some((alias) => alias.toLowerCase().includes(lowerQuery));
    }
    return false;
  });
}
