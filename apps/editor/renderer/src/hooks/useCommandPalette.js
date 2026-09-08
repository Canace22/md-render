import { useCallback, useEffect, useState } from 'react';

/**
 * 命令面板开关 —— Cmd/Ctrl+K 唤起，再按一次关闭。
 *
 * 与 MarkdownEditor 里的 Cmd/Ctrl+J（AI 助手）同样是全局监听：
 * 编辑器聚焦时也要能唤起，所以不排除输入框来源的按键，靠 preventDefault 兜住浏览器默认行为。
 */
export default function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey
        && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  // 顶栏的「全部功能」按钮走这里：快捷键之外必须留一个看得见的入口，否则收进面板的命令没人找得到
  const show = useCallback(() => setOpen(true), []);

  return { open, close, show };
}
