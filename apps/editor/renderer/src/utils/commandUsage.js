/**
 * 命令面板使用埋点 —— 记录每条命令被执行的次数。
 *
 * 只服务命令面板一个消费者，不参与跨组件状态同步，因此不进 useEditorStore；
 * 但 storage key 仍沿用 store 的 `md-renderer-*` 命名约定。
 * 数据丢了不影响功能，只是默认排序退回注册顺序，所有读写都做降级兜底。
 */

const COMMAND_USAGE_STORAGE_KEY = 'md-renderer-command-usage';

const hasStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

/** 读取全部使用次数；无痕模式 / 数据损坏时返回空对象而不是抛错 */
export const getCommandUsage = () => {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(COMMAND_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** 给一条命令的计数加一，返回累加后的完整映射 */
export const recordCommandUse = (commandId) => {
  const usage = getCommandUsage();
  if (!commandId) return usage;
  const next = { ...usage, [commandId]: (usage[commandId] ?? 0) + 1 };
  if (!hasStorage()) return next;
  try {
    window.localStorage.setItem(COMMAND_USAGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 写不进去就算了，排序退回注册顺序，不影响命令执行
  }
  return next;
};

/** 按使用次数倒序；次数相同保持注册顺序（稳定排序） */
export const sortByUsage = (commands, usage = getCommandUsage()) => {
  const list = Array.isArray(commands) ? commands : [];
  return list
    .map((command, index) => ({ command, index, count: usage[command?.id] ?? 0 }))
    .sort((a, b) => (b.count - a.count) || (a.index - b.index))
    .map((entry) => entry.command);
};

export { COMMAND_USAGE_STORAGE_KEY };
