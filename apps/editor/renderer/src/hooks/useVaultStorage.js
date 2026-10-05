import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/useEditorStore.js';
import { parseDailyWorkspace } from '../../../shared/migration/dailyFormat.js';
import { parseCanvasFiles } from '../../../shared/migration/canvasFormat.js';
import {
  ensureVaultDocIds,
  fetchMigrationState,
  isVaultSupported,
  readVaultCanvasFiles,
  readVaultDailyFiles,
  writeVaultText,
} from '../utils/vaultBridge.js';
import { buildCanvasFileMap, buildDailyFileMap, dailyFilesToMap, diffFileMaps } from '../utils/vaultFileSync.js';
import { onLocalProjectDiskChanged } from '../utils/localProjectBridge.js';
import { recordToolActivity } from '../core/agent/activityLog.js';

const WRITE_DEBOUNCE_MS = 400;
const ENSURE_IDS_DEBOUNCE_MS = 1500;

const sameMaps = (a, b) => diffFileMaps(a, b).length === 0 && diffFileMaps(b, a).length === 0;

/** 防抖写回：只写内容变了的文件，写过的内容记进 cache，回声不会被当成外部改动 */
function createFileWriter(cacheRef, label) {
  let timer = null;
  let pending = null;
  const flush = async () => {
    timer = null;
    const next = pending;
    pending = null;
    const writes = diffFileMaps(cacheRef.current, next);
    cacheRef.current = next;
    for (const write of writes) {
      try {
        await writeVaultText(write.relativePath, write.content);
      } catch (error) {
        console.error(`[vault] ${label} 写入失败:`, write.relativePath, error);
      }
    }
  };
  return {
    schedule: (fileMap) => {
      pending = fileMap;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    cancel: () => timer && clearTimeout(timer),
  };
}

/**
 * 数据层文件化的运行时（app 级）：
 * - 读迁移状态，决定 Daily / 白板 / 编辑部记忆 / 内置文档是否以内容库文件为准
 * - 已迁移的 Daily、白板：启动时从文件加载，之后的改动防抖写回文件（旧存储仍同步一份，方便回滚）
 * - 内容库在 app 外被改：重读 Daily / 白板；外部新建的 Markdown 补 frontmatter id
 */
export function useVaultStorage() {
  const vaultStorage = useEditorStore((s) => s.vaultStorage);
  const dailyCacheRef = useRef(new Map());
  const canvasCacheRef = useRef(new Map());

  // 1. 迁移状态
  useEffect(() => {
    if (!isVaultSupported()) return;
    fetchMigrationState()
      .then((state) => useEditorStore.getState().setMigrationState(state))
      .catch((error) => console.warn('[vault] 读取迁移状态失败:', error?.message));
  }, []);

  // 2. Daily：加载 + 写回
  useEffect(() => {
    if (!vaultStorage.daily) return undefined;
    let cancelled = false;
    const writer = createFileWriter(dailyCacheRef, 'Daily');
    const load = async () => {
      const files = await readVaultDailyFiles();
      if (cancelled) return;
      const fileMap = dailyFilesToMap(files);
      if (sameMaps(dailyCacheRef.current, fileMap)) return; // 自己刚写的，不算外部改动
      dailyCacheRef.current = fileMap;
      const currentDate = useEditorStore.getState().dailyWorkspace?.currentDate;
      useEditorStore.getState().applyDailyWorkspaceFromFiles(parseDailyWorkspace(files, currentDate));
      dailyCacheRef.current = buildDailyFileMap(useEditorStore.getState().dailyWorkspace);
    };
    load().catch((error) => console.error('[vault] 读取 Daily 失败:', error));
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.dailyWorkspace !== prev.dailyWorkspace) writer.schedule(buildDailyFileMap(state.dailyWorkspace));
    });
    const offDisk = onLocalProjectDiskChanged(() => { load().catch(() => {}); });
    return () => {
      cancelled = true;
      writer.cancel();
      unsubscribe();
      offDisk?.();
    };
  }, [vaultStorage.daily]);

  // 3. 白板：加载 + 写回
  useEffect(() => {
    if (!vaultStorage.canvas) return undefined;
    let cancelled = false;
    const writer = createFileWriter(canvasCacheRef, '白板');
    const load = async () => {
      const files = await readVaultCanvasFiles();
      if (cancelled) return;
      const { canvasState, errors } = parseCanvasFiles(files);
      if (errors.length) {
        console.warn('[vault] 白板文件有误，保留当前白板:', errors);
        return;
      }
      const fileMap = buildCanvasFileMap(canvasState);
      if (sameMaps(canvasCacheRef.current, fileMap)) return;
      canvasCacheRef.current = fileMap;
      useEditorStore.getState().setWorkspaceCanvas(canvasState);
    };
    load().catch((error) => console.error('[vault] 读取白板失败:', error));
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      const next = state.workspace?.canvasState;
      if (next !== prev.workspace?.canvasState) writer.schedule(buildCanvasFileMap(next));
    });
    const offDisk = onLocalProjectDiskChanged(() => { load().catch(() => {}); });
    return () => {
      cancelled = true;
      writer.cancel();
      unsubscribe();
      offDisk?.();
    };
  }, [vaultStorage.canvas]);

  // 4. 内置文档已迁：外部新建的 Markdown 补 id（启动时一次，之后随磁盘变化防抖）
  useEffect(() => {
    if (!vaultStorage.docs) return undefined;
    let timer = null;
    const run = () => {
      ensureVaultDocIds()
        .then((fixed) => fixed.forEach((relativePath) => recordToolActivity({
          who: 'external', name: 'ensure_doc_id', args: { id: relativePath }, result: `补写 frontmatter id：${relativePath}`,
        })))
        .catch((error) => console.warn('[vault] 补写 id 失败:', error?.message));
    };
    run();
    const offDisk = onLocalProjectDiskChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ENSURE_IDS_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      offDisk?.();
    };
  }, [vaultStorage.docs]);
}
