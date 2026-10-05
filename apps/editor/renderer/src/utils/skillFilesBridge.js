/**
 * 内容库 skill 文件的 IPC 客户端。Web 版暂无内容库 skill（只用内置），返回空列表。
 */

const getSkillsApi = () => (typeof window !== 'undefined' ? window.electronAPI?.skills : null);

export const isVaultSkillsSupported = () => typeof getSkillsApi()?.list === 'function';

/** @returns {Promise<Array<object>>} 内容库 skill 的原始记录 */
export async function fetchVaultSkillEntries() {
  if (!isVaultSkillsSupported()) return [];
  const result = await getSkillsApi().list();
  if (!result?.ok) throw new Error(result?.error || '读取内容库 skill 失败');
  return result.entries || [];
}

/** 内容库 skill 目录有变化时回调；返回取消订阅函数 */
export function onVaultSkillsChanged(callback) {
  const api = getSkillsApi();
  if (typeof api?.onChanged !== 'function') return () => {};
  return api.onChanged(callback);
}

const callSkillsApi = async (method, payload) => {
  const api = getSkillsApi();
  if (typeof api?.[method] !== 'function') throw new Error('当前环境不支持内容库 skill');
  const result = await api[method](payload);
  if (!result?.ok) throw new Error(result?.error || '操作 skill 文件失败');
  return result;
};

/** 写一个内容库 skill；已存在且不覆盖时返回 existed=true */
export const writeVaultSkill = (payload) => callSkillsApi('write', payload);

/** 用系统默认程序打开内容库里的 skill 文件 */
export const openVaultSkillFile = (skillPath) => callSkillsApi('open', { skillPath });
