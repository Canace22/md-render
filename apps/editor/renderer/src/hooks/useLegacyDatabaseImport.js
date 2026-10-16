import { useEffect, useState } from 'react';
import { databaseHasLegacyImport } from '../services/databaseBridge.js';
import {
  flushDesktopStatePersistence,
  useEditorStore,
} from '../store/useEditorStore.js';
import { getTodayDateKey } from '../utils/dailyWorkspace.js';

export const LEGACY_IMPORT_NOTICE_STORAGE_KEY = 'md-renderer-tauri-electron-migration-notice-dismissed-v2';
const LEGACY_IMPORT_DAILY_PENDING_KEY = 'md-renderer-tauri-electron-import-daily-pending-v1';

let dailyCompletionPromise = null;

const waitForStoreHydration = () => {
  if (useEditorStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = useEditorStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
};

const completeImportedDailyDate = () => {
  if (window.localStorage.getItem(LEGACY_IMPORT_DAILY_PENDING_KEY) !== 'true') {
    return Promise.resolve(false);
  }
  if (dailyCompletionPromise) return dailyCompletionPromise;

  dailyCompletionPromise = (async () => {
    await waitForStoreHydration();
    useEditorStore.getState().setDailyCurrentDate(getTodayDateKey());
    await flushDesktopStatePersistence();
    window.localStorage.removeItem(LEGACY_IMPORT_DAILY_PENDING_KEY);
    return true;
  })().finally(() => {
    dailyCompletionPromise = null;
  });
  return dailyCompletionPromise;
};

export const markLegacyImportReloadPending = () => {
  window.localStorage.setItem(LEGACY_IMPORT_NOTICE_STORAGE_KEY, 'true');
  window.localStorage.setItem(LEGACY_IMPORT_DAILY_PENDING_KEY, 'true');
};

export function useLegacyDatabaseImportStatus() {
  const [imported, setImported] = useState(null);

  useEffect(() => {
    let cancelled = false;
    databaseHasLegacyImport()
      .then((value) => {
        if (!cancelled) setImported(Boolean(value));
      })
      .catch((error) => {
        console.error('[tauri] 读取 Electron 数据交接状态失败:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return imported;
}

export function useCompleteImportedDailyDate() {
  useEffect(() => {
    completeImportedDailyDate().catch((error) => {
      console.error('[tauri] 导入后切换到今日速记失败:', error);
    });
  }, []);
}
