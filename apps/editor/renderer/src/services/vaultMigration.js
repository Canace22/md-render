/**
 * 数据层文件化的编排（renderer 侧）：组装旧数据 → 交给主进程迁移 → 切换运行时；以及切回旧存储。
 * 依赖 store 和 IPC 客户端，不依赖 React。
 */

import { useEditorStore } from '../store/useEditorStore.js';
import { findAgentMetaFile } from '../store/workspaceUtils.js';
import { EDITORIAL_MEMORY_DOC_NAME } from '../core/agent/editorialMemory.js';
import { EDITORIAL_MEMORY_PATH } from '@shared/migration/memoryMerge.js';
import { normalizeDailyWorkspace } from '../utils/dailyWorkspace.js';
import { ensureMdRenderWorkspace } from '../utils/localProjectBridge.js';
import {
  executeVaultMigration,
  fetchMigrationState,
  planVaultMigration,
  readVaultText,
  rebuildVaultIndex,
  rollbackVaultMigration as rollbackOnDisk,
} from '../utils/vaultBridge.js';

const LOCAL_STORAGE_PREFIX = 'md-renderer';
const BUILTIN_DOCS_RELATIVE_PATH = 'Projects/内置文档';
const MEMORY_FILE_NAMES = new Set([EDITORIAL_MEMORY_DOC_NAME, `${EDITORIAL_MEMORY_DOC_NAME}.md`]);

/** 内置文档的正文：BlockNote 旧格式先转成 Markdown（转换函数由调用方注入） */
const convertWorkspace = (node, toMarkdown) => {
  if (!node) return node;
  if (node.type === 'file' && !node.projectRootPath) {
    return { ...node, content: toMarkdown(node.content ?? '') };
  }
  if (Array.isArray(node.children)) {
    return { ...node, children: node.children.map((child) => convertWorkspace(child, toMarkdown)) };
  }
  return node;
};

/** 所有「编辑部记忆」副本：.agent 下的排第一，散落在别处的随后 */
export const collectMemoryContents = (workspace) => {
  const primary = findAgentMetaFile(workspace, EDITORIAL_MEMORY_DOC_NAME);
  const others = [];
  const walk = (node) => {
    if (node?.type === 'file' && MEMORY_FILE_NAMES.has(node.name) && node.id !== primary?.id) others.push(node.content ?? '');
    (node?.children ?? []).forEach(walk);
  };
  walk(workspace);
  return [primary?.content ?? '', ...others].filter((text) => text.trim());
};

const exportLocalStorage = () => {
  const result = {};
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LOCAL_STORAGE_PREFIX)) result[key] = window.localStorage.getItem(key);
    }
  } catch {
    // 拿不到就算了：数据库备份里也有同样的数据
  }
  return result;
};

/** 组装交给主进程的旧数据 */
export const buildMigrationPayload = (state, { toMarkdown = (text) => text } = {}) => ({
  workspace: convertWorkspace(state.workspace, toMarkdown),
  dailyWorkspace: normalizeDailyWorkspace(state.dailyWorkspace, state.dailyWorkspace?.currentDate),
  canvasState: state.workspace?.canvasState ?? null,
  memoryContents: collectMemoryContents(state.workspace),
  localStorageExport: exportLocalStorage(),
});

export const previewVaultMigration = ({ toMarkdown }) =>
  planVaultMigration(buildMigrationPayload(useEditorStore.getState(), { toMarkdown }));

const refreshProjectsMount = async () => {
  const result = await ensureMdRenderWorkspace();
  if (result?.projectRootPath) useEditorStore.getState().hydrateProjectsWorkspace(result);
};

/**
 * 正式迁移，并把运行时切到文件：内置文档从工作区去掉（它们作为 Projects/内置文档 重新出现）、重建索引。
 */
export async function runVaultMigration({ toMarkdown }) {
  const payload = buildMigrationPayload(useEditorStore.getState(), { toMarkdown });
  const result = await executeVaultMigration(payload);
  const store = useEditorStore.getState();
  if (result.steps.includes('docs')) {
    store.removeMigratedBuiltinDocs();
    await refreshProjectsMount();
    await rebuildVaultIndex(useEditorStore.getState().workspace).catch(() => {});
  }
  useEditorStore.getState().setMigrationState(result.state);
  return result;
}

/**
 * 切回旧存储：内置文档回灌进工作区、编辑部记忆写回隐藏节点；Daily 和白板旧存储一直同步着，切回即可。
 */
export async function runVaultRollback() {
  const store = useEditorStore.getState();
  const { vaultStorage, workspace } = store;
  if (vaultStorage.memory) {
    const content = await readVaultText(EDITORIAL_MEMORY_PATH);
    if (content?.trim()) store.upsertAgentMetaFile({ name: EDITORIAL_MEMORY_DOC_NAME, content });
  }
  if (vaultStorage.docs) {
    const folder = (workspace.children ?? []).find((child) => child.relativePath === BUILTIN_DOCS_RELATIVE_PATH);
    store.restoreBuiltinDocsFromDisk(folder);
  }
  const { state } = await rollbackOnDisk();
  useEditorStore.getState().setMigrationState(state);
  await refreshProjectsMount();
  return state;
}

export const reloadMigrationState = async () => {
  const state = await fetchMigrationState();
  useEditorStore.getState().setMigrationState(state);
  return state;
};
