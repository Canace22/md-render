import { useState } from 'react';
import { EditorToolbar } from '@narrative/blocknote-core';
import { Eye, Copy, ClipboardCopy, Check } from 'lucide-react';

/** 「已复制！」提示的持续时长（ms） */
const COPIED_HINT_DURATION = 2000;

/**
 * 正文右上角的悬浮动作胶囊。
 *
 * 标题 / 引用 / 列表 / 分割线等块插入交给 BlockNote 的斜杠菜单与 Markdown 快捷输入，
 * 这里只保留编辑器内部无法触发的领域动作：预览与两种复制。
 * 渲染交由 blocknote-core 的通用 EditorToolbar（数据驱动）；
 * disabled 时 onItemClick 为 no-op，外层 shell 另加 data-disabled 控制观感。
 *
 * 样式约定：**带 label 的项是主动作**（渲染成绿色实心胶囊），不带 label 的走圆形图标钮，
 * 复制反馈靠图标换成对勾 + 调用方的 message 提示，不再靠改文案。
 */
export default function EditorQuickToolbar({
  editor,
  disabled,
  onPreviewWeChat,
  onCopyWeChat,
  onCopyRichText,
  copyStyleName,
}) {
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);

  const runCopy = async (handler, markCopied) => {
    if (disabled || !handler) return;
    try {
      const ok = await handler();
      if (ok === false) return;
      markCopied(true);
      setTimeout(() => markCopied(false), COPIED_HINT_DURATION);
    } catch {
      // 错误由调用方处理
    }
  };

  const styleSuffix = copyStyleName ? `（${copyStyleName}）` : '';

  const entries = [
    {
      type: 'button',
      key: 'preview-wechat',
      button: {
        title: `预览微信格式${styleSuffix}`,
        icon: <Eye size={16} strokeWidth={1.9} />,
        skipFocusEditor: true,
        onItemClick: () => {
          if (disabled) return;
          onPreviewWeChat?.();
        },
      },
    },
    {
      type: 'button',
      key: 'copy-rich',
      button: {
        title: richCopied
          ? '已复制富文本'
          : '复制富文本内容（可粘贴到 Notion / 飞书 / Word 等）',
        icon: richCopied
          ? <Check size={16} strokeWidth={2.2} />
          : <ClipboardCopy size={16} strokeWidth={1.9} />,
        skipFocusEditor: true,
        onItemClick: () => {
          void runCopy(onCopyRichText, setRichCopied);
        },
      },
    },
    {
      type: 'button',
      key: 'copy-wechat',
      button: {
        title: `复制为微信公众号格式${styleSuffix}`,
        label: copied ? '已复制！' : '复制公众号',
        icon: copied
          ? <Check size={15} strokeWidth={2.2} />
          : <Copy size={15} strokeWidth={1.9} />,
        skipFocusEditor: true,
        onItemClick: () => {
          void runCopy(onCopyWeChat, setCopied);
        },
      },
    },
  ];

  return (
    <div
      className="editor-quick-toolbar-shell"
      data-testid="editor-quick-toolbar"
      data-disabled={disabled ? 'true' : undefined}
    >
      <EditorToolbar entries={entries} onFocusEditor={() => editor?.focus?.()} />
    </div>
  );
}
