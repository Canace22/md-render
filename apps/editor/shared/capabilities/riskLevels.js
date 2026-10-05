/**
 * 工具风险分级：按「可不可逆」分，不按工具名一个个开白名单。
 *
 * - read：只读，直接执行
 * - navigation：只切界面，直接执行
 * - reversible：新建 / 追加 / 改元数据 / 移动 / 重命名，直接执行并记活动日志（有 git 兜底）
 * - proposal：覆盖或删除，生成提案等用户确认（propose_edit / write_active_doc / delete_workspace_items）
 * - destructive：不走提案的破坏性操作（重建、清空白板），只给 app 内 AI 用
 * - environment：改运行环境（安全修复），保持确认 → 复检 → 回滚，只给 app 内 AI 用
 *
 * app 内 AI 和 MCP 共用这一份；MCP 只开放前四级。
 */

export const RISK_LEVELS = Object.freeze({
  READ: 'read',
  NAVIGATION: 'navigation',
  REVERSIBLE: 'reversible',
  PROPOSAL: 'proposal',
  DESTRUCTIVE: 'destructive',
  ENVIRONMENT: 'environment',
});

const { READ, NAVIGATION, REVERSIBLE, PROPOSAL, DESTRUCTIVE, ENVIRONMENT } = RISK_LEVELS;

export const TOOL_RISKS = Object.freeze({
  read_doc: READ,
  read_active_doc: READ,
  get_active_doc_meta: READ,
  read_doc_by_id: READ,
  list_docs: READ,
  search_docs: READ,
  search_external_knowledge: READ,
  list_recent_docs: READ,
  get_workspace_brief: READ,
  get_daily_overview: READ,
  recall_related_docs: READ,
  read_editorial_memory: READ,
  inspect_app_health: READ,
  get_proposal_status: READ,
  render_platform_html: READ,
  list_skills: READ,

  open_surface: NAVIGATION,
  open_canvas: NAVIGATION,
  open_workspace_item: NAVIGATION,

  create_new_doc: REVERSIBLE,
  create_content_entry: REVERSIBLE,
  create_agent_artifact: REVERSIBLE,
  create_folder: REVERSIBLE,
  add_daily_entry: REVERSIBLE,
  add_todo_entry: REVERSIBLE,
  append_canvas_cards: REVERSIBLE,
  update_doc_meta: REVERSIBLE,
  move_workspace_item: REVERSIBLE,
  rename_workspace_item: REVERSIBLE,
  update_editorial_memory: REVERSIBLE,

  propose_edit: PROPOSAL,
  write_active_doc: PROPOSAL,
  delete_workspace_items: PROPOSAL,

  replace_canvas: DESTRUCTIVE,
  clear_canvas: DESTRUCTIVE,

  apply_safe_repair: ENVIRONMENT,
});

/** 对外（MCP 等外部 agent）开放的级别 */
export const EXTERNAL_RISK_LEVELS = Object.freeze(new Set([READ, NAVIGATION, REVERSIBLE, PROPOSAL]));

/** 没登记的工具（如 server 脚本工具）按 environment 处理：不对外 */
export const getToolRisk = (name) => TOOL_RISKS[String(name ?? '').trim()] || ENVIRONMENT;

export const isExternallyAllowed = (name) => EXTERNAL_RISK_LEVELS.has(getToolRisk(name));

/** 需要记活动日志的级别（读和导航不记，避免刷屏） */
export const shouldLogActivity = (name) => ![READ, NAVIGATION].includes(getToolRisk(name));
