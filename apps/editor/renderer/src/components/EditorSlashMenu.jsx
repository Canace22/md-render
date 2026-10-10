import { useCallback } from 'react';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useBlockNoteEditor,
} from '@blocknote/react';
import { pickImageFiles } from '../hooks/useEditorImageUpload.js';
import { pickCommonBlockItems } from '../utils/slashMenuItems.js';

/**
 * 主编辑器斜杠菜单：只放常用块。引用文档改用「@」，见 EditorDocLinks。
 * onInsertImages(editor, files) 由父组件提供，和粘贴截图走同一套上传/回填流程。
 */

const withImagePicker = (items, onInsertImages) => items.map((item) => (
  item.key !== 'image' ? item : {
    ...item,
    subtext: '也可以直接粘贴截图',
    onItemClick: async (editor) => {
      const files = await pickImageFiles();
      if (files.length > 0) await onInsertImages(editor, files);
    },
  }
));

function EditorSlashMenu({ onInsertImages }) {
  const editor = useBlockNoteEditor();

  const getItems = useCallback(async (query) => {
    const blocks = withImagePicker(pickCommonBlockItems(getDefaultReactSlashMenuItems(editor)), onInsertImages);
    // onItemClick 统一绑定当前 editor，避免各条目自己去拿
    return filterSuggestionItems(blocks, query)
      .map((item) => ({ ...item, onItemClick: () => item.onItemClick(editor) }));
  }, [editor, onInsertImages]);

  return <SuggestionMenuController triggerCharacter="/" getItems={getItems} />;
}

export default EditorSlashMenu;
