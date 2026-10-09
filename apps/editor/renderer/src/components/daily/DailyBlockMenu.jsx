import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtensionState,
} from '@blocknote/react';
import {
  Baseline, Copy, Highlighter, ImagePlus, Smile, SquareCheckBig, SquareX, Trash2,
} from 'lucide-react';
import { getBlockIcon, isTextBlock, isTodoBlock } from '../../utils/dailyBlockMenu.js';
import { DailyColorSubMenu, DailyFormatGrid, DailyIconSubMenu } from './DailyBlockMenuParts.jsx';
import {
  addImagesAfterBlock,
  copyBlockMarkdown,
  removeBlock,
  setBlockColor,
  setBlockIcon,
  setBlockType,
  toggleBlockStyle,
  toggleBlockTodo,
} from './dailyBlockActions.js';

const MENU_ICON_SIZE = 16;

/** 菜单对应的块：按 id 实时取，改完类型/样式后高亮能跟着变 */
function useMenuBlock(editor) {
  const blockId = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block?.id });
  return useEditorState({
    editor,
    selector: ({ editor: current }) => (blockId ? current.getBlock(blockId) : undefined),
  });
}

/**
 * 今日速记的块菜单（点每行左侧拖拽手柄弹出），布局参照幕布：
 * 标题/正文、整行样式、颜色、荧光笔、图片、待办、图标、复制、删除。
 */
function DailyBlockMenu() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const block = useMenuBlock(editor);

  if (!Components || !block) return null;
  const { Item, Divider, Dropdown } = Components.Generic.Menu;
  const hasText = isTextBlock(block);
  const isTodo = isTodoBlock(block);

  return (
    <Dropdown className="bn-menu-dropdown bn-drag-handle-menu daily-block-menu">
      {hasText && (
        <>
          <DailyFormatGrid
            block={block}
            onSetType={(option) => setBlockType(editor, block, option)}
            onToggleStyle={(style) => toggleBlockStyle(editor, block, style)}
          />
          <Divider />
          <DailyColorSubMenu
            kind="text"
            icon={<Baseline size={MENU_ICON_SIZE} />}
            label="字体颜色"
            value={block.props?.textColor}
            onPick={(color) => setBlockColor(editor, block, 'text', color)}
          />
          <DailyColorSubMenu
            kind="background"
            icon={<Highlighter size={MENU_ICON_SIZE} />}
            label="荧光笔"
            value={block.props?.backgroundColor}
            onPick={(color) => setBlockColor(editor, block, 'background', color)}
          />
          <Item className="bn-menu-item" icon={<ImagePlus size={MENU_ICON_SIZE} />} onClick={() => addImagesAfterBlock(editor, block)}>
            添加图片
          </Item>
          <Item
            className="bn-menu-item"
            icon={isTodo ? <SquareX size={MENU_ICON_SIZE} /> : <SquareCheckBig size={MENU_ICON_SIZE} />}
            onClick={() => toggleBlockTodo(editor, block)}
          >
            {isTodo ? '取消待办' : '添加待办'}
          </Item>
          <DailyIconSubMenu
            icon={<Smile size={MENU_ICON_SIZE} />}
            label="添加图标"
            value={getBlockIcon(block.content)}
            onPick={(icon) => setBlockIcon(editor, block, icon)}
          />
          <Divider />
        </>
      )}
      <Item className="bn-menu-item" icon={<Copy size={MENU_ICON_SIZE} />} onClick={() => copyBlockMarkdown(block)}>
        复制主题
      </Item>
      <Item
        className="bn-menu-item daily-block-menu-danger"
        icon={<Trash2 size={MENU_ICON_SIZE} />}
        onClick={() => removeBlock(editor, block)}
      >
        删除
      </Item>
    </Dropdown>
  );
}

export default DailyBlockMenu;
