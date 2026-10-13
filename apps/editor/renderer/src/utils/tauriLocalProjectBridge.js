import { getDesktopRuntimeKind } from '../services/desktopBridge.js';

const TAURI_READ_ONLY_MOUNT_PREFIX = 'tauri-ro:v1:';

const invokeTauri = async (command, payload) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, payload);
};

export const isTauriRuntime = () => getDesktopRuntimeKind() === 'tauri';

export const isTauriReadOnlyMountId = (value) => (
  typeof value === 'string' && value.startsWith(TAURI_READ_ONLY_MOUNT_PREFIX)
);

export async function openLocalProject() {
  return invokeTauri('select_read_only_projects');
}

export async function readLocalProjectFileContent({ mountId, relativePath }) {
  if (!isTauriReadOnlyMountId(mountId)) {
    throw new Error('无效的 Tauri 只读项目标识');
  }

  const result = await invokeTauri('read_read_only_project_file', {
    mountId,
    relativePath,
  });
  if (result?.ok === false) {
    throw new Error(result.error || '读取本地文件失败');
  }
  return result;
}

export async function revokeReadOnlyProject(mountId) {
  if (!isTauriReadOnlyMountId(mountId)) return;
  await invokeTauri('revoke_read_only_project', { mountId });
}
