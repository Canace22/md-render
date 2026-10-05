import { isStepOnFiles } from '../../utils/vaultBridge.js';

const VAULT_STEPS = ['memory', 'daily', 'canvas', 'docs'];

/** 迁移状态 → 各类数据当前是否以内容库文件为准 */
export const toVaultStorage = (state) => Object.fromEntries(VAULT_STEPS.map((step) => [step, isStepOnFiles(state, step)]));

/**
 * 数据层文件化的运行时状态（内存态，不进 persist）：
 * 迁移状态、各类数据是否已切到文件、外部改动提示。
 */
export const createVaultSlice = (set) => ({
  migrationState: null,
  vaultStorage: toVaultStorage(null),
  externalChangeNotice: null,

  setMigrationState: (state) => set({ migrationState: state, vaultStorage: toVaultStorage(state) }),

  /** 当前打开的文档在 app 外被改了：{ fileId, fileName, previousContent } */
  setExternalChangeNotice: (notice) => set({ externalChangeNotice: notice || null }),
  clearExternalChangeNotice: () => set({ externalChangeNotice: null }),
});
