import { useCallback, useMemo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import { buildSchema } from '@narrative/blocknote-core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { normalizeRichText, plainTextToRichText, richTextToPlainText } from '../../utils/dailyRichText.js';
import { useEditorStore } from '../../store/useEditorStore.js';

/**
 * 今日速记条目的富文本输入框（BlockNote）。
 *
 * 只在浏览器里按需加载（由 DailyItemRow 用 React.lazy 挂载）：
 * @blocknote/* 依赖 DOM，node 环境（vitest 静态渲染）跑不动。
 */

// 速记是短内容，只开放段落 + 三种列表；标题/引用/代码块/表格/图片这些
// 一律不给（存储层也只认这几类，避免出现「能写进去、渲染不出来」的块）。
// 名称对齐 @blocknote/core 的 defaultBlockSpecs；排除后只剩
// paragraph / bulletListItem / numberedListItem / checkListItem
const DAILY_EXCLUDED_BLOCKS = Object.freeze([
  'heading', 'quote', 'codeBlock', 'table', 'image', 'video', 'audio', 'file',
  'divider', 'toggleListItem',
]);

const DAILY_SCHEMA = buildSchema({
  blockSpecs: {},
  excludeDefaultBlocks: DAILY_EXCLUDED_BLOCKS,
});

const EMPTY_BLOCK = { type: 'paragraph', content: [] };

const resolveInitialContent = (richText, text) => {
  const blocks = normalizeRichText(richText);
  if (blocks.length > 0) return blocks;
  const fromText = plainTextToRichText(text);
  // BlockNote 不接受空的 initialContent 数组
  return fromText.length > 0 ? fromText : [EMPTY_BLOCK];
};

function DailyRichTextEditor({ richText, text, placeholder, onChange, onSubmit, onCancel }) {
  // 只在挂载时取一次初值：编辑器是非受控的，之后靠 onChange 往上抛，
  // 避免「父级回填 → 光标跳动」的受控循环。切换编辑对象时由父级用 key 重挂。
  const initialContent = useMemo(
    () => resolveInitialContent(richText, text),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const theme = useEditorStore((state) => state.theme);

  // 占位文案走 dictionary（BlockNote 的官方入口），不用顶层 placeholders 选项
  const dictionary = useMemo(() => ({
    ...zh,
    placeholders: { ...zh.placeholders, emptyDocument: placeholder, default: placeholder },
  }), [placeholder]);

  const editor = useCreateBlockNote({
    dictionary,
    schema: DAILY_SCHEMA,
    initialContent,
  });

  const handleChange = useCallback(() => {
    const blocks = normalizeRichText(editor.document);
    onChange?.({ richText: blocks, text: richTextToPlainText(blocks) });
  }, [editor, onChange]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel?.();
      return;
    }
    // 回车用来换行/新建列表项，保存改用 ⌘/Ctrl + Enter
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      onSubmit?.();
    }
  }, [onCancel, onSubmit]);

  return (
    <div className="daily-notebook-rich-editor" onKeyDownCapture={handleKeyDown}>
      <BlockNoteView
        editor={editor}
        theme={theme === 'dark' ? 'dark' : 'light'}
        autoFocus
        formattingToolbar
        linkToolbar
        slashMenu
        sideMenu={false}
        filePanel={false}
        emojiPicker={false}
        onChange={handleChange}
      />
    </div>
  );
}

export default DailyRichTextEditor;
