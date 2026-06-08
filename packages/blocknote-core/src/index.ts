/**
 * @narrative/blocknote-core
 *
 * 通用 BlockNote 编辑器壳（与剧本业务解耦）。
 * 仅提供编辑器机制（schema 组装、菜单/工具栏扩展点、查找、剪贴板、
 * 焦点/选中/全选/右键等基础能力）；剧本领域知识由业务侧经 props 注入。
 */

// 查找栏
export { FindBar } from './components/FindBar.js';

// 剪贴板浮动按钮（复制/剪切/粘贴）
export { ClipboardFormattingToolbarButtons } from './components/ClipboardFormattingToolbarButtons.js';

// 通用底部工具栏（数据驱动）
export { EditorToolbar } from './components/EditorToolbar.js';
export type {
  EditorToolbarProps,
  EditorToolbarEntry,
  ToolbarButtonItem,
} from './components/EditorToolbar.js';

// 块插入 / 建议过滤机制
export {
  stringToBlockContent,
  insertOrUpdateBlock,
  insertNewBlockOnly,
  filterSuggestionItemsByQuery,
} from './utils/editorBlockInsert.js';
export type {
  BlockContentItem,
  InsertBlockSpec,
  BlockInsertEditorLike,
  InsertOrUpdateOptions,
} from './utils/editorBlockInsert.js';

// 剪贴板操作反馈（机制）
export {
  showClipboardActionMessage,
  resetClipboardActionMessageDedupe,
} from './utils/clipboardFeedback.js';
export type { ClipboardAction } from './utils/clipboardFeedback.js';
export { useClipboardFeedback } from './hooks/useClipboardFeedback.js';

// 键盘 / 选区机制
export {
  isSelectAllShortcut,
  resolveBlockInlineContentRange,
  shouldPromoteBlockSelectionToFullSelection,
} from './utils/keyboardSelection.js';
export type {
  ISelectAllShortcutLike,
  IBlockInlineContentRange,
} from './utils/keyboardSelection.js';

// Schema 组装机制
export { buildSchema } from './schema/buildSchema.js';
export type {
  BuildSchemaInput,
  CustomInlineContentSpecs,
} from './schema/buildSchema.js';
