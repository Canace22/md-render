/**
 * 选区浮动工具栏：复制 / 剪切 / 粘贴
 * mousedown 上 preventDefault，避免点击工具栏时编辑器失焦导致选区丢失。
 *
 * 通用机制，无业务语义。
 */

import React, { useCallback } from 'react';
import { useComponentsContext, useBlockNoteEditor } from '@blocknote/react';
import { Copy, Scissors, ClipboardPaste } from 'lucide-react';
import { message } from 'antd';
import { showClipboardActionMessage } from '../utils/clipboardFeedback.js';

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const SHORTCUT_COPY = IS_MAC ? '⌘C' : 'Ctrl+C';
const SHORTCUT_CUT = IS_MAC ? '⌘X' : 'Ctrl+X';
const SHORTCUT_PASTE = IS_MAC ? '⌘V' : 'Ctrl+V';

/** 浮动工具栏内图标字号，与同条工具栏上文样式按钮对齐 */
const CLIPBOARD_ICON_SIZE = 16;

export const ClipboardFormattingToolbarButtons: React.FC = () => {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();

  const preserveEditorSelection = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleCopy = useCallback(() => {
    try {
      if (document.execCommand('copy')) {
        return;
      }
    } catch {
      // 走剪贴板 API
    }

    const text = window.getSelection()?.toString() ?? '';
    if (!text.trim()) {
      message.warning('没有可复制的文本');
      return;
    }

    void navigator.clipboard.writeText(text).then(
      () => showClipboardActionMessage('copy'),
      () => message.error('复制失败'),
    );
  }, []);

  const handleCut = useCallback(() => {
    try {
      if (document.execCommand('cut')) {
        return;
      }
    } catch {
      // ignore
    }
    message.warning(`剪切未完成，可使用快捷键 ${SHORTCUT_CUT}`);
  }, []);

  const handlePaste = useCallback(() => {
    void (async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          message.warning('剪贴板为空');
          return;
        }
        editor.focus();
        editor.pasteText(text);
        showClipboardActionMessage('paste');
      } catch {
        message.warning(`粘贴失败，请尝试快捷键 ${SHORTCUT_PASTE}`);
      }
    })();
  }, [editor]);

  return (
    <>
      <span
        className="script-formatting-toolbar-clipboard-button-wrap"
        onMouseDownCapture={preserveEditorSelection}
      >
        <Components.FormattingToolbar.Button
          mainTooltip="复制"
          secondaryTooltip={SHORTCUT_COPY}
          onClick={handleCopy}
        >
          <Copy size={CLIPBOARD_ICON_SIZE} aria-hidden />
        </Components.FormattingToolbar.Button>
      </span>
      <span
        className="script-formatting-toolbar-clipboard-button-wrap"
        onMouseDownCapture={preserveEditorSelection}
      >
        <Components.FormattingToolbar.Button
          mainTooltip="剪切"
          secondaryTooltip={SHORTCUT_CUT}
          onClick={handleCut}
        >
          <Scissors size={CLIPBOARD_ICON_SIZE} aria-hidden />
        </Components.FormattingToolbar.Button>
      </span>
      <span
        className="script-formatting-toolbar-clipboard-button-wrap"
        onMouseDownCapture={preserveEditorSelection}
      >
        <Components.FormattingToolbar.Button
          mainTooltip="粘贴"
          secondaryTooltip={SHORTCUT_PASTE}
          onClick={handlePaste}
        >
          <ClipboardPaste size={CLIPBOARD_ICON_SIZE} aria-hidden />
        </Components.FormattingToolbar.Button>
      </span>
    </>
  );
};
