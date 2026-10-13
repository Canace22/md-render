import { useState, useSyncExternalStore } from 'react';
import { Alert, Button, message } from 'antd';
import {
  getDesktopPersistenceStatus,
  retryDesktopStatePersistence,
  subscribeDesktopPersistenceStatus,
} from '../store/useEditorStore.js';

export default function TauriPreviewNotice() {
  const persistence = useSyncExternalStore(
    subscribeDesktopPersistenceStatus,
    getDesktopPersistenceStatus,
    getDesktopPersistenceStatus,
  );
  const [retrying, setRetrying] = useState(false);

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

  if (persistence.status === 'recovery') {
    return (
      <Alert
        className="tauri-preview-notice"
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
        className="tauri-preview-notice"
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

  return (
    <Alert
      className="tauri-preview-notice"
      type="warning"
      showIcon
      message="Tauri 预览版 · 数据隔离"
      description="不会自动读取或覆盖正式版资料；请在设置中手动选择只读或读写打开目录，读写授权只对本次会话有效。"
    />
  );
}
