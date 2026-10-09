import { useState } from 'react';
import { Modal, message } from 'antd';
import { Database, FolderSync, RefreshCw, Undo2 } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import { rebuildVaultIndex } from '../utils/vaultBridge.js';
import { runVaultRollback } from '../services/vaultMigration.js';
import MigrationWizard from './MigrationWizard.jsx';

const ITEM_LABELS = Object.freeze({ memory: '编辑部记忆', daily: '今日速记', canvas: '灵感白板', docs: '内置文档' });

/**
 * 设置 → 数据存储：看各类数据存在哪、迁移到文件（U5 入口）、切回旧存储（M7）、从文件重建索引。
 */
export default function VaultStorageSettings({ toMarkdown }) {
  const vaultStorage = useEditorStore((s) => s.vaultStorage);
  const migrationState = useEditorStore((s) => s.migrationState);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const anyOnFiles = Object.values(vaultStorage).some(Boolean);

  const handleRollback = () => {
    Modal.confirm({
      title: '切回旧存储？',
      content: '内置文档会回到侧栏的内置区，编辑部记忆写回数据库；Projects/内置文档 目录挪到 .agent/migration/ 下保留，不删除。',
      okText: '切回旧存储',
      cancelText: '取消',
      onOk: async () => {
        setBusy(true);
        try {
          await runVaultRollback();
          message.success('已切回旧存储');
        } catch (error) {
          message.error(`切回失败：${error.message}`);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleRebuild = async () => {
    setBusy(true);
    try {
      await rebuildVaultIndex(useEditorStore.getState().workspace);
      message.success('索引已重建');
    } catch (error) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-group">
      <div className="settings-group-title">数据存储</div>
      <ul className="settings-vault-status">
        {Object.entries(ITEM_LABELS).map(([key, label]) => (
          <li key={key}>
            <span>{label}</span>
            <span className={vaultStorage[key] ? 'is-files' : ''}>{vaultStorage[key] ? '内容库文件' : '旧存储（数据库）'}</span>
          </li>
        ))}
      </ul>
      {migrationState?.rolledBackAt && !anyOnFiles && (
        <div className="settings-platform-hint">已于 {migrationState.rolledBackAt.slice(0, 10)} 切回旧存储。</div>
      )}
      <div className="settings-action-list">
        <button type="button" className="settings-action-btn" onClick={() => setWizardOpen(true)} disabled={busy}>
          <FolderSync size={16} strokeWidth={1.6} />
          <span>{anyOnFiles ? '再次迁移（补迁新内容）' : '迁移到内容库文件…'}</span>
        </button>
        {anyOnFiles && (
          <button type="button" className="settings-action-btn" onClick={handleRollback} disabled={busy}>
            <Undo2 size={16} strokeWidth={1.6} />
            <span>切回旧存储</span>
          </button>
        )}
        <button type="button" className="settings-action-btn" onClick={handleRebuild} disabled={busy}>
          {busy ? <RefreshCw className="settings-btn-spinner" size={16} /> : <Database size={16} strokeWidth={1.6} />}
          <span>从当前内容重建索引</span>
        </button>
      </div>
      <div className="settings-platform-hint">
        迁移后内容就是 ~/Documents/MdRender 下的 Markdown / JSON Canvas 文件，删掉数据库也只需要重建索引。
      </div>
      <MigrationWizard open={wizardOpen} onClose={() => setWizardOpen(false)} toMarkdown={toMarkdown} />
    </div>
  );
}
