import { useCallback } from 'react';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { SuggestionMenuController, useBlockNoteEditor } from '@blocknote/react';
import { ImagePlus, SquareCheckBig } from 'lucide-react';
import { COLOR_NAMES, ColorIcon } from '../EditorFormattingToolbar.jsx';
import { BLOCK_ICONS, BLOCK_TYPE_OPTIONS, TEXT_STYLE_KEYS } from '../../utils/dailyBlockMenu.js';
import { STYLE_META, TYPE_ICONS } from './DailyBlockMenuParts.jsx';
import {
  addImagesAfterBlock,
  setBlockColor,
  setBlockIcon,
  setBlockType,
  toggleBlockStyle,
  toggleBlockTodo,
} from './dailyBlockActions.js';

/**
 * 速记的斜杠菜单：和行首手柄菜单同一组动作（标题/正文、整行样式、待办、图片、颜色、图标）。
 * 颜色、荧光笔、图标选项多，只在输入关键字后出现（如 /红、/荧光、/图标），空查询时列表保持精简。
 */

const ICON_SIZE = 18;
const TYPE_ALIASES = {
  h1: ['h1', 'heading1', '标题', 'biaoti'],
  h2: ['h2', 'heading2', '标题', 'biaoti'],
  h3: ['h3', 'heading3', '标题', 'biaoti'],
  text: ['p', 'text', 'zhengwen', '普通'],
};
const STYLE_ALIASES = {
  bold: ['b', 'bold', 'jiacu', '粗体'],
  italic: ['i', 'italic', 'xieti'],
  underline: ['u', 'underline', 'xiahuaxian'],
  strike: ['s', 'strike', 'shanchuxian'],
};
const TEXT_COLOR_ALIASES = ['颜色', '字体颜色', 'color', 'yanse'];
const HIGHLIGHT_ALIASES = ['荧光', '荧光笔', '高亮', 'highlight', 'yingguang'];
const ICON_ALIASES = ['图标', 'icon', 'tubiao'];

/** 每个动作都作用在光标所在的那一行（斜杠和查询词已被菜单清掉） */
const onCurrentBlock = (action) => (editor) => action(editor, editor.getTextCursorPosition().block);

const buildBaseItems = () => [
  ...BLOCK_TYPE_OPTIONS.map((option) => {
    const Icon = TYPE_ICONS[option.key];
    return {
      title: option.label,
      group: '标题',
      aliases: TYPE_ALIASES[option.key],
      icon: <Icon size={ICON_SIZE} />,
      onItemClick: onCurrentBlock((editor, block) => setBlockType(editor, block, option)),
    };
  }),
  ...TEXT_STYLE_KEYS.map((style) => {
    const { icon: Icon, label } = STYLE_META[style];
    return {
      title: label,
      subtext: '整行',
      group: '格式',
      aliases: STYLE_ALIASES[style],
      icon: <Icon size={ICON_SIZE} />,
      onItemClick: onCurrentBlock((editor, block) => toggleBlockStyle(editor, block, style)),
    };
  }),
  {
    title: '添加 / 取消待办',
    group: '插入',
    aliases: ['todo', '待办', '任务', 'daiban', 'renwu', 'checkbox'],
    icon: <SquareCheckBig size={ICON_SIZE} />,
    onItemClick: onCurrentBlock(toggleBlockTodo),
  },
  {
    title: '添加图片',
    subtext: '也可以直接粘贴截图',
    group: '插入',
    aliases: ['image', '图片', 'tupian', 'img'],
    icon: <ImagePlus size={ICON_SIZE} />,
    onItemClick: onCurrentBlock(addImagesAfterBlock),
  },
];

const buildColorItems = (dict, kind) => COLOR_NAMES.map((color) => {
  const isText = kind === 'text';
  const name = dict.color_picker.colors[color];
  return {
    title: isText ? `${name}文字` : `${name}荧光笔`,
    group: isText ? '字体颜色' : '荧光笔',
    aliases: [color, name, ...(isText ? TEXT_COLOR_ALIASES : HIGHLIGHT_ALIASES)],
    icon: (
      <ColorIcon
        textColor={isText ? color : undefined}
        backgroundColor={isText ? undefined : color}
        size={ICON_SIZE}
      />
    ),
    onItemClick: onCurrentBlock((editor, block) => setBlockColor(editor, block, kind, color)),
  };
});

const buildIconItems = () => BLOCK_ICONS.map((emoji) => ({
  title: `图标 ${emoji}`,
  group: '图标',
  aliases: ICON_ALIASES,
  icon: <span className="daily-slash-emoji">{emoji}</span>,
  onItemClick: onCurrentBlock((editor, block) => setBlockIcon(editor, block, emoji)),
}));

export default function DailySlashMenu() {
  const editor = useBlockNoteEditor();

  const getItems = useCallback(async (query) => {
    const base = buildBaseItems();
    if (!query) return base;
    const searchable = [
      ...base,
      ...buildColorItems(editor.dictionary, 'text'),
      ...buildColorItems(editor.dictionary, 'background'),
      ...buildIconItems(),
    ];
    return filterSuggestionItems(searchable, query);
  }, [editor]);

  return <SuggestionMenuController triggerCharacter="/" getItems={getItems} />;
}
