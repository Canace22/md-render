/**
 * 剪贴板操作完成提示（复制/剪切/粘贴），带短时去重。
 *
 * 通用机制，无业务语义。
 */

import { message } from 'antd';

export type ClipboardAction = 'copy' | 'cut' | 'paste';

const CLIPBOARD_ACTION_MESSAGES: Record<ClipboardAction, string> = {
  copy: '复制完成',
  cut: '剪切完成',
  paste: '粘贴完成',
};

const DEDUPE_MS = 80;
let lastAction: ClipboardAction | null = null;
let lastShownAt = 0;

export function showClipboardActionMessage(action: ClipboardAction): void {
  const now = Date.now();
  if (lastAction === action && now - lastShownAt < DEDUPE_MS) {
    return;
  }
  lastAction = action;
  lastShownAt = now;
  message.success(CLIPBOARD_ACTION_MESSAGES[action]);
}

/** 测试用：重置去重状态 */
export function resetClipboardActionMessageDedupe(): void {
  lastAction = null;
  lastShownAt = 0;
}
