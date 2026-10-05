/**
 * 数据层文件化的 IPC 客户端：迁移向导、迁移后 Daily / 白板 / 编辑部记忆的文件读写。
 * Web 版不支持（D3：P3 只做桌面版），isVaultSupported() 为 false 时各处保持旧存储。
 */

const getApi = (name) => (typeof window !== 'undefined' ? window.electronAPI?.[name] : null);

export const isVaultSupported = () => typeof getApi('vault')?.readText === 'function';

const unwrap = async (promise, fallbackError) => {
  const result = await promise;
  if (!result?.ok) throw new Error(result?.error || fallbackError);
  return result;
};

export const fetchMigrationState = async () => {
  if (!isVaultSupported()) return null;
  return (await unwrap(getApi('migration').getState(), '读取迁移状态失败')).state;
};

export const planVaultMigration = (payload, steps) => unwrap(getApi('migration').plan(payload, steps), '迁移预演失败');
export const executeVaultMigration = (payload, steps) => unwrap(getApi('migration').execute(payload, steps), '迁移失败');
export const rollbackVaultMigration = () => unwrap(getApi('migration').rollback(), '切回旧存储失败');
export const onMigrationProgress = (callback) => getApi('migration')?.onProgress?.(callback) ?? (() => {});

export const readVaultText = async (relativePath) => (await unwrap(getApi('vault').readText(relativePath), '读取文件失败')).content;
export const writeVaultText = (relativePath, content) => unwrap(getApi('vault').writeText(relativePath, content), '写入文件失败');
export const readVaultDailyFiles = () => unwrap(getApi('vault').readDaily(), '读取 Daily 文件失败');
export const readVaultCanvasFiles = () => unwrap(getApi('vault').readCanvas(), '读取白板文件失败');
export const ensureVaultDocIds = async () => (isVaultSupported() ? (await unwrap(getApi('vault').ensureIds(), '补写 id 失败')).fixed : []);
export const rebuildVaultIndex = (workspace) => unwrap(getApi('vault').rebuildIndex(JSON.stringify(workspace)), '重建索引失败');

/** 迁移状态里某一步是否已切到文件 */
export const isStepOnFiles = (state, step) => state?.storageSource === 'files' && Boolean(state?.steps?.[step]?.done);

export const fetchVaultAgentInfo = async () => unwrap(getApi('vault').agentInfo(), '读取内容库信息失败');
export const openVaultLocation = (target) => unwrap(getApi('vault').open(target), '打开失败');
