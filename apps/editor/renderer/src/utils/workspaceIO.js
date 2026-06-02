/**
 * 工作区导入导出工具
 * 格式与 localStorage 中存储的工作区一致
 */

/**
 * 导出工作区为 JSON（与 localStorage 格式一致）
 */
export function exportWorkspaceToJSON(workspace) {
  return JSON.stringify(workspace ?? null, null, 2);
}

/**
 * 从 JSON 字符串解析工作区
 * @param {string} raw JSON 字符串
 * @returns {{ workspace: object, error?: string }}
 */
export function parseWorkspaceFromJSON(raw) {
  try {
    const data = JSON.parse(raw);
    const workspace = data?.workspace ?? data;
    if (!workspace || typeof workspace !== 'object') {
      return { workspace: null, error: '无效的工作区格式' };
    }
    if (workspace.type !== 'folder' || workspace.id !== 'root') {
      return { workspace: null, error: '工作区根节点格式不正确' };
    }
    return { workspace };
  } catch (e) {
    return { workspace: null, error: 'JSON 解析失败' };
  }
}
