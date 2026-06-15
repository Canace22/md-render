import { normalizeDailyWorkspace } from './dailyWorkspace.js';

/**
 * 工作区导入导出工具
 * 格式与 localStorage 中存储的工作区一致
 */

/**
 * 导出工作区为 JSON（包含工作区和 Daily 数据）
 */
export function exportWorkspaceToJSON(workspace, dailyWorkspace) {
  return JSON.stringify({
    workspace: workspace ?? null,
    dailyWorkspace: normalizeDailyWorkspace(dailyWorkspace, null),
  }, null, 2);
}

/**
 * 从 JSON 字符串解析工作区
 * @param {string} raw JSON 字符串
 * @returns {{ workspace: object, dailyWorkspace: object, error?: string }}
 */
export function parseWorkspaceFromJSON(raw) {
  try {
    const data = JSON.parse(raw);
    const workspace = data?.workspace ?? data;
    const dailyWorkspace = normalizeDailyWorkspace(data?.dailyWorkspace ?? null, null);
    if (!workspace || typeof workspace !== 'object') {
      return { workspace: null, dailyWorkspace, error: '无效的工作区格式' };
    }
    if (workspace.type !== 'folder' || workspace.id !== 'root') {
      return { workspace: null, dailyWorkspace, error: '工作区根节点格式不正确' };
    }
    return { workspace, dailyWorkspace };
  } catch (e) {
    return { workspace: null, dailyWorkspace: normalizeDailyWorkspace(null, null), error: 'JSON 解析失败' };
  }
}
