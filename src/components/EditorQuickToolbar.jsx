import { useState } from 'react';
import { Button } from 'antd';
import {
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Minus,
  AtSign,
  Quote,
  Eye,
  Copy,
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
  {
    key: 'entity-mention',
    label: '实体引用',
    icon: <AtSign size={15} strokeWidth={1.9} />,
    behavior: 'insert-entity-mention',
  },
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

export default function EditorQuickToolbar({
  editor,
  disabled,
  isNovelMode,
  onOpenEntityMention,
  onPreviewWeChat,
  onCopyWeChat,
  copyStyleName,
}) {
  const [copied, setCopied] = useState(false);

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

  const handleToolClick = (item) => {
    if (!editor || disabled) return;
    if (item.behavior === 'insert-divider') {
      insertDivider(editor);
      return;
    }
    if (item.behavior === 'insert-entity-mention') {
      onOpenEntityMention?.();
      return;
    }
    applyBlock(editor, item.block);
  };

  return (
    <div className="editor-quick-toolbar-shell" data-testid="editor-quick-toolbar">
      <div className="editor-quick-toolbar-scroller">
        {TOOL_ITEMS.filter((item) => isNovelMode || item.behavior !== 'insert-entity-mention').map((item) => (
          <Button
            key={item.key}
            className="editor-quick-toolbar-btn"
            icon={item.icon}
            disabled={disabled}
            onClick={() => handleToolClick(item)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="editor-quick-toolbar-actions">
        <div className="editor-quick-toolbar-divider" />
        <Button
          className="editor-quick-toolbar-btn"
          icon={<Eye size={15} strokeWidth={1.9} />}
          disabled={disabled}
          onClick={onPreviewWeChat}
          title={`预览微信格式${copyStyleName ? `（${copyStyleName}）` : ''}`}
        >
          预览
        </Button>
        <Button
          className={`editor-quick-toolbar-btn ${copied ? 'is-copied' : ''}`}
          icon={copied ? <Copy size={15} strokeWidth={1.9} /> : <Copy size={15} strokeWidth={1.9} />}
          disabled={disabled}
          onClick={handleCopy}
          title={`复制为微信公众号格式${copyStyleName ? `（${copyStyleName}）` : ''}`}
        >
          {copied ? '已复制！' : '复制'}
        </Button>
      </div>
    </div>
  );
}
