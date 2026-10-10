import { message } from 'antd';
import { blocksToMarkdown } from '../../../../shared/daily/dailyMarkdown.js';
import { insertImagesFromFiles, pickImageFiles } from '../../hooks/useEditorImageUpload.js';
import {
  getBlockTypeUpdate,
  getTodoToggleUpdate,
  setLeadingIcon,
  toggleStyleOnContent,
} from '../../utils/dailyBlockMenu.js';

/**
 * 速记块操作：块菜单（行首手柄）和斜杠菜单共用同一组动作，保证两边行为一致。
 * 每个函数都接 (editor, block)，只改这一个块。
 */

export const DAILY_IMAGE_SOURCE_ID = 'daily';

const update = (editor, block, patch) => {
  if (block && patch) editor.updateBlock(block, patch);
};

export const setBlockType = (editor, block, option) => update(editor, block, getBlockTypeUpdate(block, option));

export const toggleBlockStyle = (editor, block, style) => (
  update(editor, block, { content: toggleStyleOnContent(block.content, style) })
);

/** kind: text = 字体颜色，background = 荧光笔 */
export const setBlockColor = (editor, block, kind, color) => (
  update(editor, block, { props: kind === 'text' ? { textColor: color } : { backgroundColor: color } })
);

export const toggleBlockTodo = (editor, block) => update(editor, block, getTodoToggleUpdate(block));

export const setBlockIcon = (editor, block, icon) => (
  update(editor, block, { content: setLeadingIcon(block.content, icon) })
);

export const removeBlock = (editor, block) => block && editor.removeBlocks([block]);

/** 选图片插到这一行下面，走和粘贴截图一样的上传流程 */
export const addImagesAfterBlock = async (editor, block) => {
  const files = await pickImageFiles();
  if (!block || files.length === 0) return;
  editor.setTextCursorPosition(block, 'end');
  await insertImagesFromFiles(editor, files, editor.uploadFile, { fileId: DAILY_IMAGE_SOURCE_ID });
};

/** 这一行连同子级复制成 Markdown */
export const copyBlockMarkdown = (block) => navigator.clipboard.writeText(blocksToMarkdown([block]))
  .then(() => message.success('已复制为 Markdown'))
  .catch(() => message.error('复制失败'));
