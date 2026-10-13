import { useState } from 'react';
import { DatabaseBackup, Loader2 } from 'lucide-react';
import { message } from 'antd';
import { getDesktopRuntimeKind } from '../services/desktopBridge.js';
import { importLegacyDatabase } from '../services/databaseBridge.js';
import { flushTauriCloseDrains } from '../services/desktopCloseBridge.js';
import {
  beginDesktopMutationBarrier,
  endDesktopMutationBarrier,
  freezeDesktopMutations,
} from '../services/desktopMutationBarrier.js';
import {
  pauseDesktopStatePersistence,
  resumeDesktopStatePersistence,
} from '../store/useEditorStore.js';

export default function TauriDataMigrationSettings() {
  const [importing, setImporting] = useState(false);

  if (getDesktopRuntimeKind() !== 'tauri') return null;

  const handleImport = async () => {
    const confirmed = window.confirm(
      '导入会先备份 Tauri 当前数据，再把你选中的 Electron 数据库复制到 Tauri 私有目录。\n\n'
      + '不会修改源数据库。请先完全退出 Electron 正式版，再选择 knowledge.db 原文件，或退出后复制出的完整副本。不要在 Electron 运行时只复制单个 .db 文件，否则可能缺少 WAL 中尚未合并的最新内容。\n\n是否继续？',
    );
    if (!confirmed) return;

    setImporting(true);
    let pendingSave = null;
    let shouldRestorePending = false;
    let mutationBarrier = null;
    let keepBarrierUntilReload = false;
    try {
      mutationBarrier = beginDesktopMutationBarrier('导入旧数据');
      await flushTauriCloseDrains();
      freezeDesktopMutations(mutationBarrier);
      pendingSave = await pauseDesktopStatePersistence();
      shouldRestorePending = true;
      const result = await importLegacyDatabase();
      if (result?.cancelled) {
        return;
      }
      if (!result?.ok) {
        throw new Error(result?.error || '数据导入失败');
      }
      shouldRestorePending = false;
      message.success(
        `已导入 ${result.documents ?? 0} 篇文档和 ${result.versions ?? 0} 条历史版本，正在重新加载。`,
      );
      keepBarrierUntilReload = true;
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      console.error('[tauri] 导入 Electron 数据失败:', error);
      message.error(error?.message || '数据导入失败');
    } finally {
      if (shouldRestorePending) {
        resumeDesktopStatePersistence(pendingSave);
      }
      if (!keepBarrierUntilReload) {
        endDesktopMutationBarrier(mutationBarrier);
      }
      setImporting(false);
    }
  };

  return (
    <div className="settings-group">
      <div className="settings-group-title">Electron 数据交接</div>
      <div className="settings-platform-hint">
        完全退出 Electron 后，选择旧版 knowledge.db 原文件或完整副本。Tauri 会导入文档、双链和版本历史，源文件保持不变。
      </div>
      <div className="settings-action-list">
        <button
          type="button"
          className="settings-action-btn"
          onClick={handleImport}
          disabled={importing}
        >
          {importing
            ? <Loader2 className="settings-btn-spinner" size={16} />
            : <DatabaseBackup size={16} strokeWidth={1.6} />}
          <span>{importing ? '正在校验并导入…' : '选择并导入 Electron 数据'}</span>
        </button>
      </div>
    </div>
  );
}
