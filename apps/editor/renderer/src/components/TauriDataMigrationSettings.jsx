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
      '导入不是合并：会先备份当前 Tauri 数据库，再用你选中的 Electron 数据替换当前 Tauri 数据。\n\n'
      + '如果你已经在 Tauri 预览版里写了新内容，请先另行备份。Electron 源数据库不会被修改。请完全退出 Electron 旧版后，再选择 knowledge.db 原文件或完整副本；不要在 Electron 运行时只复制单个 .db 文件，否则可能缺少 WAL 中尚未合并的最新内容。\n\n是否继续？',
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
      keepBarrierUntilReload = true;
      window.alert(
        'Electron 数据导入完成。\n\n'
        + `已用 Electron 数据替换当前 Tauri 数据，共 ${result.documents ?? 0} 篇文档和 ${result.versions ?? 0} 条历史版本。\n\n`
        + `导入前的 Tauri 数据已备份到应用数据目录，文件名为 ${result.backupFileName || 'knowledge.before-import.<timestamp>.db'}。`,
      );
      window.location.reload();
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
        导入会备份并替换当前 Tauri 数据库，不会合并两边内容。完全退出 Electron 后再选择旧版 knowledge.db；源文件保持不变。
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
