import { useState, useSyncExternalStore } from 'react';
import { Alert, Button, message } from 'antd';
import {
  getDesktopPersistenceStatus,
  retryDesktopStatePersistence,
  subscribeDesktopPersistenceStatus,
} from '../store/useEditorStore.js';
import {
  LEGACY_IMPORT_NOTICE_STORAGE_KEY,
  useCompleteImportedDailyDate,
  useLegacyDatabaseImportStatus,
} from '../hooks/useLegacyDatabaseImport.js';

export default function TauriRuntimeNotice() {
  const hasLegacyImport = useLegacyDatabaseImportStatus();
  useCompleteImportedDailyDate();
  const persistence = useSyncExternalStore(
    subscribeDesktopPersistenceStatus,
    getDesktopPersistenceStatus,
    getDesktopPersistenceStatus,
  );
  const [retrying, setRetrying] = useState(false);
  const [showMigrationNotice, setShowMigrationNotice] = useState(
    () => window.localStorage.getItem(LEGACY_IMPORT_NOTICE_STORAGE_KEY) !== 'true',
  );

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryDesktopStatePersistence();
      message.success('已重试并保存当前更改。');
    } catch (error) {
      message.error(error?.message || '重试保存失败');
    } finally {
      setRetrying(false);
    }
  };

  const handleDismissMigrationNotice = () => {
    window.localStorage.setItem(LEGACY_IMPORT_NOTICE_STORAGE_KEY, 'true');
    setShowMigrationNotice(false);
  };

  if (persistence.status === 'recovery') {
    return (
      <Alert
        className="tauri-runtime-notice"
        type="error"
        showIcon
        message="数据库已进入只读恢复模式"
        description={`${persistence.message}。当前只显示浏览器缓存副本，期间更改不会写入原数据库。可在设置中导入完整备份，或重新加载后再试。`}
        action={(
          <Button size="small" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        )}
      />
    );
  }

  if (persistence.status === 'save-error' || persistence.status === 'retrying') {
    return (
      <Alert
        className="tauri-runtime-notice"
        type="error"
        showIcon
        message="当前更改尚未保存"
        description={`${persistence.message}。更改仍保留在当前窗口内，请不要退出应用。`}
        action={(
          <Button
            danger
            size="small"
            loading={retrying || persistence.status === 'retrying'}
            onClick={handleRetry}
          >
            重试保存
          </Button>
        )}
      />
    );
  }

  if (hasLegacyImport !== false || !showMigrationNotice) return null;

  return (
    <Alert
      className="tauri-runtime-notice"
      type="info"
      showIcon
      closable
      onClose={handleDismissMigrationNotice}
      message="从 Electron 版升级？旧资料仍保留在原位置"
      description="请先完全退出 Electron 旧版，再到「设置 → Electron 数据交接」导入 knowledge.db。导入会备份并替换当前 Tauri 数据库，不会合并两边内容；Electron 源数据库不会被修改。"
    />
  );
}
