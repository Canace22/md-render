const saveSelectionRanges = (selection) => {
  if (!selection) return [];
  return Array.from({ length: selection.rangeCount }, (_, index) => (
    selection.getRangeAt(index).cloneRange()
  ));
};

const restoreSelectionRanges = (selection, ranges) => {
  if (!selection) return;
  selection.removeAllRanges();
  ranges.forEach((range) => {
    try {
      selection.addRange(range);
    } catch {
      // 原选区节点已被卸载时无法恢复，保持当前空选区即可。
    }
  });
};

/**
 * Clipboard API 不可用时的 HTML 复制降级。
 * 临时选中离屏 DOM 完成复制，最后恢复用户原有选区。
 */
export const copyHtmlWithExecCommand = (html, plainText = '') => {
  if (!html || !document.body || typeof document.execCommand !== 'function') return false;

  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.cssText = 'position:fixed;left:-9999px;top:0;';
  container.setAttribute('aria-hidden', 'true');
  container.contentEditable = 'true';
  container.tabIndex = -1;

  const selection = window.getSelection();
  const savedRanges = saveSelectionRanges(selection);
  const activeElement = document.activeElement;
  const handleCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.clearData();
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', plainText);
    event.preventDefault();
  };

  try {
    document.body.appendChild(container);
    document.addEventListener('copy', handleCopy, true);
    container.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return Boolean(document.execCommand('copy'));
  } finally {
    document.removeEventListener('copy', handleCopy, true);
    container.remove();
    activeElement?.focus?.({ preventScroll: true });
    restoreSelectionRanges(selection, savedRanges);
  }
};
