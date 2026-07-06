import { useEffect, useState } from 'react';
import { getElectronAPI } from '../services/electronBridge.js';

/**
 * macOS Electron 窗口非全屏时，hiddenInset 标题栏的交通灯会覆盖左上角 UI。
 * 返回 true 表示需要为交通灯预留空白。
 */
export function useMacTitlebarInset() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api || api.platform !== 'darwin') return undefined;

    let disposed = false;

    const sync = async () => {
      if (typeof api.isFullScreen !== 'function') {
        if (!disposed) setActive(true);
        return;
      }
      try {
        const isFull = await api.isFullScreen();
        if (!disposed) setActive(!isFull);
      } catch {
        if (!disposed) setActive(true);
      }
    };

    sync();

    const off = typeof api.onFullScreenChange === 'function'
      ? api.onFullScreenChange((isFull) => {
        if (!disposed) setActive(!isFull);
      })
      : () => {};

    return () => {
      disposed = true;
      off();
    };
  }, []);

  return active;
}
