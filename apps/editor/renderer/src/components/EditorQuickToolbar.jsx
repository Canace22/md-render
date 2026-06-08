import { useState } from 'react';
import { EditorToolbar } from '@narrative/blocknote-core';
import {
  Sparkles,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Eye,
  Copy,
  ClipboardCopy,
} from 'lucide-react';

const TOOL_ITEMS = [
  {
    key: 'heading-1',
    label: 'H1',
    icon: <Heading1 size={15} strokeWidth={1.9} />,
    block: { type: 'heading', props: { level: 1 } },
  },
  {
    key: 'heading-2',
    label: 'H2',
    icon: <Heading2 size={15} strokeWidth={1.9} />,
    block: { type: 'heading', props: { level: 2 } },
  },
  {
    key: 'quote',
    label: '引用',
    icon: <Quote size={15} strokeWidth={1.9} />,
    block: { type: 'quote', props: {} },
  },
  {
    key: 'bullet-list',
    label: '无序列表',
    icon: <List size={15} strokeWidth={1.9} />,
    block: { type: 'bulletListItem', props: {} },
  },
  {
    key: 'numbered-list',
    label: '有序列表',
    icon: <ListOrdered size={15} strokeWidth={1.9} />,
    block: { type: 'numberedListItem', props: {} },
  },
  {
    key: 'divider',
    label: '分割线',
    icon: <Minus size={15} strokeWidth={1.9} />,
    block: { type: 'divider' },
    behavior: 'insert-divider',
  },
];

const AI_TOOL_ITEMS = [
  { key: 'compress', label: '压缩' },
  { key: 'expand', label: '扩写' },
  { key: 'title', label: '标题' },
];

function isInlineBlockContent(editor, block) {
  return editor?.schema?.blockSchema?.[block?.type]?.content === 'inline';
}

function applyBlock(editor, nextBlock) {
  const cursorPosition = editor.getTextCursorPosition();
  const currentBlock = cursorPosition?.block;
  if (!currentBlock) return;

  if (isInlineBlockContent(editor, currentBlock)) {
    editor.updateBlock(currentBlock, nextBlock);
    editor.setTextCursorPosition(currentBlock, 'end');
    editor.focus();
    return;
  }

  const [insertedBlock] = editor.insertBlocks([nextBlock], currentBlock, 'after');
  if (insertedBlock) {
    editor.setTextCursorPosition(insertedBlock, 'end');
  }
  editor.focus();
}

function insertDivider(editor) {
  const cursorPosition = editor.getTextCursorPosition();
  const currentBlock = cursorPosition?.block;
  if (!currentBlock) return;

  const insertedBlocks = editor.insertBlocks(
    [{ type: 'divider' }, { type: 'paragraph' }],
    currentBlock,
    'after',
  );
  const paragraphBlock = insertedBlocks?.[1];
  if (paragraphBlock) {
    editor.setTextCursorPosition(paragraphBlock, 'start');
  }
  editor.focus();
}

/**
 * 编辑器底部快捷工具栏。
 *
 * 渲染交由 blocknote-core 的通用 EditorToolbar（数据驱动）；本组件只负责
 * 把「块插入 / AI / 复制 / 预览」这些领域动作映射成 EditorToolbar 的 entries。
 * disabled 时所有 onItemClick 变为 no-op（EditorToolbar 不感知业务禁用态）。
 */
export default function EditorQuickToolbar({
  editor,
  disabled,
  onAIAction,
  onPreviewWeChat,
  onCopyWeChat,
  onCopyRichText,
  copyStyleName,
}) {
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);

  const handleCopy = async () => {
    if (!onCopyWeChat) return;
    try {
      await onCopyWeChat();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 错误由调用方处理
    }
  };

  const handleCopyRichText = async () => {
    if (!onCopyRichText) return;
    try {
      await onCopyRichText();
      setRichCopied(true);
      setTimeout(() => setRichCopied(false), 2000);
    } catch {
      // 错误由调用方处理
    }
  };

  const handleToolClick = (item) => {
    if (!editor || disabled) return;
    if (item.behavior === 'insert-divider') {
      insertDivider(editor);
      return;
    }
    applyBlock(editor, item.block);
  };

  // 把领域动作映射为 EditorToolbar 的 entries（按钮 / 分隔线）。
  // 注：EditorToolbar 无单项 disabled，故 disabled 时 onItemClick 直接 no-op。
  const blockEntries = TOOL_ITEMS.map((item) => ({
    type: 'button',
    key: item.key,
    button: {
      title: item.label,
      label: item.label,
      icon: item.icon,
      onItemClick: () => handleToolClick(item),
    },
  }));

  const aiEntries = AI_TOOL_ITEMS.map((item) => ({
    type: 'button',
    key: `ai-${item.key}`,
    button: {
      title: `AI ${item.label}`,
      label: item.label,
      icon: <Sparkles size={15} strokeWidth={1.9} />,
      // AI 续写不聚焦编辑器，避免光标跳到文档末尾
      skipFocusEditor: true,
      onItemClick: () => {
        if (disabled) return;
        onAIAction?.(item.key);
      },
    },
  }));

  const actionEntries = [
    {
      type: 'button',
      key: 'copy-rich',
      button: {
        title: '复制富文本内容（可粘贴到其他平台）',
        label: richCopied ? '已复制！' : '复制内容',
        icon: <ClipboardCopy size={15} strokeWidth={1.9} />,
        skipFocusEditor: true,
        onItemClick: () => {
          if (disabled) return;
          void handleCopyRichText();
        },
      },
    },
    {
      type: 'button',
      key: 'preview-wechat',
      button: {
        title: `预览微信格式${copyStyleName ? `（${copyStyleName}）` : ''}`,
        label: '预览',
        icon: <Eye size={15} strokeWidth={1.9} />,
        skipFocusEditor: true,
        onItemClick: () => {
          if (disabled) return;
          onPreviewWeChat?.();
        },
      },
    },
    {
      type: 'button',
      key: 'copy-wechat',
      button: {
        title: `复制为微信公众号格式${copyStyleName ? `（${copyStyleName}）` : ''}`,
        label: copied ? '已复制！' : '复制',
        icon: <Copy size={15} strokeWidth={1.9} />,
        skipFocusEditor: true,
        onItemClick: () => {
          if (disabled) return;
          void handleCopy();
        },
      },
    },
  ];

  const entries = [
    ...blockEntries,
    { type: 'divider', key: 'sep-actions' },
    ...aiEntries,
    ...actionEntries,
  ];

  return (
    <div className="editor-quick-toolbar-shell" data-testid="editor-quick-toolbar">
      <EditorToolbar
        entries={entries}
        onFocusEditor={() => editor?.focus?.()}
      />
    </div>
  );
}
