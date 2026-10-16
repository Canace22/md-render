import { getDesktopRuntimeKind } from './desktopBridge.js';
import { getUpdaterBridge as getElectronUpdaterBridge } from './electronBridge.js';

const INITIAL_CHECK_DELAY_MS = 3_000;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1_000;

const getErrorMessage = (error) => {
  if (typeof error?.message === 'string') return error.message;
  return String(error || '检查更新失败');
};

const checkTauriUpdate = async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('check_for_update');
};

const createTauriUpdaterBridge = () => ({
  onStatus(callback) {
    let disposed = false;
    let intervalId = null;

    const check = async () => {
      if (disposed) return;
      callback({ status: 'checking' });
      try {
        const result = await checkTauriUpdate();
        if (!disposed) callback(result);
      } catch (error) {
        console.warn('[updater] Tauri 检查更新失败:', error);
        if (!disposed) {
          callback({ status: 'error', message: getErrorMessage(error) });
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      check();
      intervalId = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    }, INITIAL_CHECK_DELAY_MS);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  },
});

export const getUpdaterBridge = () => {
  const electronUpdater = getElectronUpdaterBridge();
  if (electronUpdater) return electronUpdater;
  if (getDesktopRuntimeKind() !== 'tauri' || import.meta.env.DEV) return null;
  return createTauriUpdaterBridge();
};
