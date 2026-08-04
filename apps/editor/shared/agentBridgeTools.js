/**
 * Agent Bridge 安全工具白名单 —— 单一事实源。
 *
 * 「别的 AI」通过 MCP → 控制桥 → renderer 调用本 app 的工具。
 * 出于安全，只放行「只读 + 安全写 + 导航」这三类，破坏性操作一律不暴露。
 *
 * 本文件放在 shared 层，主进程（agentBridge.js，安全网关）
 * 和 renderer（bridgeListener.js，纵深防御）共用同一份名单，避免漂移。
 *
 * 工具的完整 schema 和执行逻辑仍在 renderer 的 toolRegistry.js，这里只管「哪些能对外」。
 */

/** 只读：不改动任何数据 */
export const SAFE_READ_TOOLS = Object.freeze([
  'read_active_doc',
  'get_active_doc_meta',
  'read_doc_by_id',
  'search_docs',
  'search_external_knowledge',
  'list_recent_docs',
  'get_workspace_brief',
  'get_daily_overview',
  'recall_related_docs',
  'read_editorial_memory',
  'inspect_app_health',
]);

/** 安全写：只新增，或需用户当面确认后才落地，不覆盖历史、不删除 */
export const SAFE_WRITE_TOOLS = Object.freeze([
  'create_new_doc',
  'create_content_entry',
  'create_agent_artifact',
  'create_folder',
  'add_daily_entry',
  'add_todo_entry',
  'append_canvas_cards', // 只追加卡片，不清空白板
  'write_active_doc', // 暂存 diff，需用户点「应用」才生效，安全
]);

/** 导航：只切界面，无数据副作用 */
export const SAFE_NAV_TOOLS = Object.freeze([
  'open_surface',
  'open_canvas',
  'open_workspace_item',
]);

/** 对外放行的全部工具名集合 */
export const SAFE_TOOL_NAMES = Object.freeze(
  new Set([...SAFE_READ_TOOLS, ...SAFE_WRITE_TOOLS, ...SAFE_NAV_TOOLS]),
);

/**
 * 明确拒绝的破坏性工具（仅用于文档与测试可读性，运行时以 SAFE_TOOL_NAMES 为准）。
 * 如需对外开放其中某个，请谨慎评估后加进上面对应的 SAFE_* 列表。
 */
export const BLOCKED_TOOLS = Object.freeze([
  'delete_workspace_items',
  'move_workspace_item',
  'rename_workspace_item',
  'replace_canvas',
  'clear_canvas',
  'apply_safe_repair',
  'update_editorial_memory',
]);

/** 特殊指令：拉取「安全工具」的 schema 列表（不是真实工具） */
export const LIST_TOOLS_NAME = '__list_tools__';

/** renderer 执行一次工具的超时（毫秒） */
export const INVOKE_TIMEOUT_MS = 30000;

/** 该工具是否允许对外调用 */
export const isSafeTool = (name) => SAFE_TOOL_NAMES.has(String(name ?? '').trim());

/** 从 OpenAI 风格的工具定义数组里，只保留白名单内的 */
export const filterSafeToolDefs = (defs = []) =>
  (Array.isArray(defs) ? defs : []).filter((def) => isSafeTool(def?.function?.name));

/**
 * 校验 /invoke 请求体。
 * @returns {{ok:true,name:string,args:object}|{ok:false,error:string}}
 */
export const validateInvoke = (body) => {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body 必须是 JSON 对象' };
  const name = String(body.name ?? '').trim();
  if (!name) return { ok: false, error: '缺少工具名 name' };
  if (!isSafeTool(name)) return { ok: false, error: `工具「${name}」不在安全白名单内` };
  const args = body.args && typeof body.args === 'object' ? body.args : {};
  return { ok: true, name, args };
};
