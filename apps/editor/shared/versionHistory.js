/**
 * 文档版本历史（参照 Obsidian「文件恢复」）的共用常量，main 存快照、renderer 展示说明都读这里。
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** 同一文档两次自动快照的最小间隔 */
export const VERSION_SNAPSHOT_INTERVAL_MINUTES = 5;
export const VERSION_SNAPSHOT_INTERVAL_MS = VERSION_SNAPSHOT_INTERVAL_MINUTES * MINUTE_MS;

/** 快照保留天数，超期自动清理 */
export const VERSION_RETENTION_DAYS = 7;
export const VERSION_RETENTION_MS = VERSION_RETENTION_DAYS * DAY_MS;

/** 清理超期快照的节流间隔，避免每次保存都扫表 */
export const VERSION_PRUNE_INTERVAL_MS = 60 * MINUTE_MS;

/** 版本列表最多返回条数 */
export const VERSION_LIST_LIMIT = 200;
