import { useCallback } from 'react';
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorState,
} from '@blocknote/react';
import {
  EditorInlineRewriteButtons,
  EditorInlineRewriteProvider,
} from './EditorInlineRewrite.jsx';
import EditorCommentButton from './EditorCommentButton.jsx';

/** 与 BlockNote ColorStyleButton 工具栏色标尺寸对齐 */
const COLOR_ICON_SIZE = 20;
/** 与 BlockNote 色板菜单项色标尺寸对齐 */
const COLOR_SWATCH_SIZE = 16;
/** Mantine Toolbar 的 focus trap 需要延后把焦点交回编辑器 */
const FOCUS_RESTORE_DELAY_MS = 0;
export const COLOR_NAMES = Object.freeze([
  'default',
  'gray',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
]);

const restoreEditorFocus = (editor) => {
  window.setTimeout(() => {
    editor.focus();
  }, FOCUS_RESTORE_DELAY_MS);
};

const hasColorStyle = (editor, kind) => {
  const styleName = kind === 'text' ? 'textColor' : 'backgroundColor';
  const spec = editor.schema.styleSchema[styleName];
  return spec?.type === styleName && spec?.propSchema === 'string';
};

export function ColorIcon({ textColor, backgroundColor, size = COLOR_SWATCH_SIZE }) {
  return (
    <div
      className="bn-color-icon"
      data-background-color={backgroundColor || 'default'}
      data-text-color={textColor || 'default'}
      style={{
        pointerEvents: 'none',
        fontSize: `${size * 0.75}px`,
        height: `${size}px`,
        lineHeight: `${size}px`,
        textAlign: 'center',
        width: `${size}px`,
      }}
    >
      A
    </div>
  );
}

function ColorStyleSplitButton({ kind }) {
  const Components = useComponentsContext();
  const dict = useDictionary();
  const editor = useBlockNoteEditor();
  const styleInSchema = hasColorStyle(editor, kind);
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor.isEditable || !hasColorStyle(currentEditor, kind)) {
        return undefined;
      }
      const blocks = currentEditor.getSelection()?.blocks
        || [currentEditor.getTextCursorPosition().block];
      if (!blocks.find((block) => block.content !== undefined)) {
        return undefined;
      }
      const styles = currentEditor.getActiveStyles();
      return kind === 'text'
        ? (styles.textColor || 'default')
        : (styles.backgroundColor || 'default');
    },
  });

  const setColor = useCallback((color) => {
    if (!styleInSchema) return;
    const styles = kind === 'text'
      ? { textColor: color }
      : { backgroundColor: color };
    if (color === 'default') editor.removeStyles(styles);
    else editor.addStyles(styles);
    restoreEditorFocus(editor);
  }, [editor, kind, styleInSchema]);

  if (!Components || state === undefined) return null;

  const isText = kind === 'text';
  const tooltip = isText
    ? dict.color_picker.text_title
    : dict.color_picker.background_title;

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          data-test={isText ? 'text-color' : 'background-color'}
          label={tooltip}
          mainTooltip={tooltip}
          icon={
            <ColorIcon
              textColor={isText ? state : undefined}
              backgroundColor={isText ? undefined : state}
              size={COLOR_ICON_SIZE}
            />
          }
        />
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-color-picker-dropdown">
        {COLOR_NAMES.map((color) => (
          <Components.Generic.Menu.Item
            key={`${kind}-color-${color}`}
            onClick={() => setColor(color)}
            data-test={`${kind === 'text' ? 'text' : 'background'}-color-${color}`}
            icon={
              <ColorIcon
                textColor={isText ? color : undefined}
                backgroundColor={isText ? undefined : color}
                size={COLOR_SWATCH_SIZE}
              />
            }
            checked={state === color}
          >
            {dict.color_picker.colors[color]}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

function EditorFormattingToolbar() {
  // 「评论」放最前面，与 Claude Cowork 的选区工具栏一致
  const items = [<EditorCommentButton key="commentButton" />];
  for (const item of getFormattingToolbarItems()) {
    if (item.key === 'colorStyleButton') {
      items.push(
        <ColorStyleSplitButton key="textColorButton" kind="text" />,
        <ColorStyleSplitButton key="backgroundColorButton" kind="background" />,
      );
      continue;
    }
    items.push(item);
  }

  items.push(<EditorInlineRewriteButtons key="inlineRewriteButtons" />);

  return <FormattingToolbar>{items}</FormattingToolbar>;
}

export default function EditorFormattingToolbarController({
  enableAiRewrite = false,
  selectionSkillIds = new Set(),
}) {
  const toolbar = <FormattingToolbarController formattingToolbar={EditorFormattingToolbar} />;
  if (!enableAiRewrite) return toolbar;
  return (
    <EditorInlineRewriteProvider enabledSkillIds={selectionSkillIds}>
      {toolbar}
    </EditorInlineRewriteProvider>
  );
}
