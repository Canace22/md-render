import { useCallback } from 'react';
import { exportWorkspaceToJSON, parseWorkspaceFromJSON } from '../utils/workspaceIO';
import { findNodeById } from '../store/workspaceUtils.js';
import { saveExportFile } from '../services/desktopShellBridge.js';

/**
 * 工作区操作：重命名、删除、导入、导出
 */
export function useWorkspaceActions({
  workspace,
  dailyWorkspace,
  selectedId,
  applyRename,
  deleteNode,
  importWorkspace,
}) {
  const handleRename = useCallback(
    (nodeId) => {
      const targetId = nodeId ?? selectedId;
      const node = findNodeById(workspace, targetId);
      if (!node) return;
      const nextName = window.prompt('请输入新名称', node.name);
      if (!nextName) return;
      if (!applyRename(targetId, nextName)) {
        alert('名称已存在，请换一个。');
      }
    },
    [workspace, selectedId, applyRename],
  );

  const handleDelete = useCallback(
    (nodeId) => {
      const targetId = nodeId ?? selectedId;
      if (targetId === 'root') {
        alert('根目录不能删除');
        return;
      }
      const node = findNodeById(workspace, targetId);
      if (!node) return;
      const isFolder = node.type === 'folder';
      const confirmed = window.confirm(
        `确定删除${isFolder ? '文件夹及其全部内容' : '文件'}「${node.name}」吗？`,
      );
      if (!confirmed) return;
      deleteNode(targetId);
    },
    [workspace, selectedId, deleteNode],
  );

  const handleExport = useCallback(async () => {
    const json = exportWorkspaceToJSON(workspace, dailyWorkspace);
    try {
      await saveExportFile({
        defaultName: `workspace-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        content: json,
        encoding: 'utf8',
      });
    } catch (error) {
      alert(error?.message || '导出工作区失败');
    }
  }, [workspace, dailyWorkspace]);

  const handleImport = useCallback(
    (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const { workspace: imported, dailyWorkspace: importedDailyWorkspace, error } = parseWorkspaceFromJSON(reader.result);
        if (error) {
          alert(error);
          return;
        }
        const confirmed = window.confirm('导入将替换当前工作区，是否继续？');
        if (!confirmed) return;
        importWorkspace({ workspace: imported, dailyWorkspace: importedDailyWorkspace });
      };
      reader.readAsText(file, 'UTF-8');
      event.target.value = '';
    },
    [importWorkspace],
  );

  return { handleRename, handleDelete, handleExport, handleImport };
}
