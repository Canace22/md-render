/**
 * 内容库 .agent/ 数据（提案、活动日志）的 IPC 客户端。
 * Web 版没有内容库：写入静默跳过，读取返回空，提案只存在内存里。
 */

const getApi = () => (typeof window !== 'undefined' ? window.electronAPI?.agentData : null);

export const isAgentDataSupported = () => typeof getApi()?.appendActivity === 'function';

const call = async (method, ...args) => {
  const api = getApi();
  if (typeof api?.[method] !== 'function') return null;
  const result = await api[method](...args);
  if (!result?.ok) throw new Error(result?.error || 'agent 数据读写失败');
  return result;
};

export const saveProposalFile = (proposal) => call('writeProposal', proposal);

export async function fetchProposalFiles() {
  return (await call('listProposals'))?.proposals ?? [];
}

export const saveActivityEntry = (entry) => call('appendActivity', entry);

export async function fetchActivityEntries({ dateKey, limit } = {}) {
  return (await call('readActivity', { dateKey, limit }))?.entries ?? [];
}
