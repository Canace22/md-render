import { useComponentsContext, useDictionary } from '@blocknote/react';
import {
  Bold, Heading1, Heading2, Heading3, Italic, Strikethrough, Type, Underline,
} from 'lucide-react';
import { COLOR_NAMES, ColorIcon } from '../EditorFormattingToolbar.jsx';
import {
  BLOCK_ICONS,
  BLOCK_TYPE_OPTIONS,
  TEXT_STYLE_KEYS,
  hasStyleOnAll,
  isBlockTypeActive,
} from '../../utils/dailyBlockMenu.js';

const TOOL_ICON_SIZE = 18;
const MENU_ICON_SIZE = 16;

export const TYPE_ICONS = { h1: Heading1, h2: Heading2, h3: Heading3, text: Type };
export const STYLE_META = {
  bold: { icon: Bold, label: '加粗' },
  italic: { icon: Italic, label: '斜体' },
  underline: { icon: Underline, label: '下划线' },
  strike: { icon: Strikethrough, label: '删除线' },
};

function ToolButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      className={`daily-block-menu-tool${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon size={TOOL_ICON_SIZE} />
    </button>
  );
}

/** 顶部两排：H1 / H2 / H3 / 正文，B / I / U / S */
export function DailyFormatGrid({ block, onSetType, onToggleStyle }) {
  return (
    <div className="daily-block-menu-grid">
      {BLOCK_TYPE_OPTIONS.map((option) => (
        <ToolButton
          key={option.key}
          icon={TYPE_ICONS[option.key]}
          label={option.label}
          active={isBlockTypeActive(block, option)}
          onClick={() => onSetType(option)}
        />
      ))}
      {TEXT_STYLE_KEYS.map((style) => (
        <ToolButton
          key={style}
          icon={STYLE_META[style].icon}
          label={STYLE_META[style].label}
          active={hasStyleOnAll(block.content, style)}
          onClick={() => onToggleStyle(style)}
        />
      ))}
    </div>
  );
}

/** 带右侧子菜单的一项 */
function SubMenu({ icon, label, children }) {
  const Components = useComponentsContext();
  return (
    <Components.Generic.Menu.Root position="right" sub>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger icon={icon}>
          {label}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown bn-color-picker-dropdown">
        {children}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

/** 字体颜色（kind=text）/ 荧光笔（kind=background） */
export function DailyColorSubMenu({ kind, icon, label, value, onPick }) {
  const Components = useComponentsContext();
  const dict = useDictionary();
  const isText = kind === 'text';
  return (
    <SubMenu icon={icon} label={label}>
      {COLOR_NAMES.map((color) => (
        <Components.Generic.Menu.Item
          key={color}
          className="bn-menu-item"
          checked={(value || 'default') === color}
          onClick={() => onPick(color)}
          icon={(
            <ColorIcon
              textColor={isText ? color : undefined}
              backgroundColor={isText ? undefined : color}
              size={MENU_ICON_SIZE}
            />
          )}
        >
          {dict.color_picker.colors[color]}
        </Components.Generic.Menu.Item>
      ))}
    </SubMenu>
  );
}

/** 行首图标：点同一个图标再点一次就是去掉 */
export function DailyIconSubMenu({ icon, label, value, onPick }) {
  return (
    <SubMenu icon={icon} label={label}>
      <div className="daily-block-menu-icons">
        {BLOCK_ICONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`daily-block-menu-icon${value === emoji ? ' is-active' : ''}`}
            title={value === emoji ? '去掉图标' : emoji}
            onClick={() => onPick(value === emoji ? '' : emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </SubMenu>
  );
}
