/**
 * agent 的宿主能力（host）：工具执行器只通过它读写 app。
 *
 * 从 AgentPanel 的 useMemo 搬出来，app 内 AI 和外部 agent（MCP 控制桥）共用一份：
 * - 每次调用都用 getState() 读实时状态，不再有「闭包里是本轮开始时的旧快照」的问题
 * - 不依赖 React 组件挂载：关掉 AI 面板，MCP 照样能用
 * 交互（确认框）和配置读取由调用方注入，方便单测。
 */

import {
  collectFiles,
  collectHiddenFileIds,
  findAgentMetaFile,
  findNodeById,
  getFileKnowledgeSearchText,
  AGENT_META_FOLDER_NAME,
} from '../../store/workspaceUtils.js';
import {
  EDITORIAL_MEMORY_DOC_NAME,
  MEMORY_CATEGORIES,
  appendMemoryEntry,
  findEditorialMemoryFile,
} from './editorialMemory.js';
import {
  buildActiveDocMeta,
  buildContentAssetPointer,
  buildRecentDocPointers,
  buildWorkspaceToolBrief,
} from './taskContext.js';
import {
  buildCanvasItemsFromAgentCards,
  buildCanvasSceneFromAgentGraph,
  buildExcalidrawCanvasState,
  buildExcalidrawElementsFromItems,
  countRenderableCanvasCards,
} from '../../utils/excalidrawCanvas.js';
import { getTodayDateKey, normalizeDateKey } from '../../utils/dailyWorkspace.js';
import {
  clearAiServerOverride,
  getAiServerConfiguration,
  readAiServerBase,
  saveAiServerBase,
} from './aiClient.js';
import {
  aiExecTool,
  dbSearch,
  getDiagnosticsSnapshot,
  hasAiToolBridge,
  hasDbBridge,
  hasDiagnosticsBridge,
} from '../../services/electronBridge.js';
import { buildAgentArtifactPayload } from './artifactUtils.js';
import { buildAgentHealthSnapshot, runSafeRepair } from './appSupport.js';
import { loadKnowledgeSources } from './knowledgeSources.js';
import { searchExternalKnowledge } from '../../services/externalKnowledgeService.js';
import { getSurfaceLabel } from './surfaceLabels.js';

export const CONTENT_ENTRY_PRESETS = Object.freeze({
  topic: { draftStatus: 'idea', fallbackName: '新选题' },
  draft: { draftStatus: 'drafting', fallbackName: '新稿件' },
  material: { draftStatus: 'collecting', fallbackName: '新资料单' },
  ready: { draftStatus: 'ready', fallbackName: '待发布稿' },
});

const PROPOSAL_OUTCOME_TEXT = Object.freeze({
  applied: '改动已应用到当前文档。',
  discarded: '用户放弃了这次改动，文档未变更。',
  conflict: '写入被拒绝：文档在提案之后被用户改过，请重新读取后再提交。',
});
export const describeProposalOutcome = (proposal) => PROPOSAL_OUTCOME_TEXT[proposal?.status] || '提案状态未知，文档未变更。';

const SERVER_STDOUT_MAX = 2000;
const SERVER_STDERR_MAX = 500;
const SEARCH_FALLBACK_SNIPPET = 200;
const DEFAULT_RECENT_DOCS = 4;

const toJson = (value) => JSON.stringify(value);
const cleanText = (value) => String(value ?? '').trim();

/**
 * @param {object} deps
 * @param {() => object} deps.getState 读实时 store 状态（useEditorStore.getState）
 * @param {(names: string[], reason: string) => Promise<boolean>} [deps.confirmDelete]
 * @param {(info: object) => Promise<boolean>} [deps.confirmSafeRepair]
 * @param {() => Array} [deps.getKnowledgeSources]
 * @param {(base: string) => void} [deps.onAiServerBaseChange]
 */
export function createHost({
  getState,
  confirmDelete = async () => false,
  confirmSafeRepair = async () => false,
  getKnowledgeSources = loadKnowledgeSources,
  onAiServerBaseChange = () => {},
}) {
  const activeFileOf = (state) => findNodeById(state.workspace, state.selectedId);

  const setCanvasAndShow = (state, canvasState) => {
    state.setWorkspaceCanvas(canvasState);
    state.setSurface('canvas');
  };

  return {
    readActiveDoc: () => {
      const state = getState();
      const active = activeFileOf(state);
      return { title: active?.name ?? '', content: state.markdown ?? '' };
    },

    getActiveDocMeta: () => {
      const state = getState();
      return buildActiveDocMeta(activeFileOf(state), state.markdown ?? '');
    },

    // 不直接覆盖：生成提案，弹 diff 让用户应用/放弃。
    // wait=false（外部 AI 经 MCP 调用）时提交后立即返回，不等用户点按钮。
    writeActiveDoc: async (content, { wait = true, who = 'app', baseHash = '' } = {}) => {
      const state = getState();
      if (!state.selectedId) return '写入失败：当前没有打开的文档。请先打开一个文档。';
      const submitted = state.submitEditProposal({
        targetId: state.selectedId, newText: content, baseHash, who, tool: 'write_active_doc',
      });
      if (!submitted.ok) return submitted.error;
      if (!wait) return `已提交改动提案（${submitted.proposal.id}），等待用户确认（应用或放弃）。`;
      return describeProposalOutcome(await getState().waitForAgentProposal(submitted.proposal.id));
    },

    createNewDoc: async ({ name, content, targetPlatforms, sourceMaterialIds } = {}) => {
      const state = getState();
      const result = await state.createGeneratedFile({
        name, content, contextNodeId: state.selectedId, meta: { targetPlatforms, sourceMaterialIds },
      });
      return toJson(result?.ok
        ? { ok: true, fileId: result.fileId, name: result.name, message: '原文未改动。' }
        : { ok: false, error: result?.error || '未知错误' });
    },

    createAgentArtifact: async (args = {}) => {
      const prepared = buildAgentArtifactPayload(args);
      if (!prepared.ok) return toJson({ ok: false, error: prepared.error });
      const state = getState();
      const result = await state.createGeneratedFile({
        name: prepared.artifact.name,
        content: prepared.artifact.content,
        contextNodeId: state.selectedId,
        meta: prepared.artifact.meta,
      });
      return toJson(result?.ok
        ? {
          kind: 'agent_artifact',
          ok: true,
          artifactType: prepared.artifact.type,
          artifactLabel: prepared.artifact.label,
          fileId: result.fileId,
          name: result.name,
        }
        : { kind: 'agent_artifact', ok: false, error: result?.error || '未知错误' });
    },

    inspectAppHealth: async () => {
      const state = getState();
      const aiConfiguration = getAiServerConfiguration();
      const runtimeSnapshot = hasDiagnosticsBridge()
        ? await getDiagnosticsSnapshot({ aiProxyBase: aiConfiguration.resolved })
        : { ok: false, error: '当前不在 Electron 环境，无法读取本机运行快照。', aiProxy: { reachable: false } };
      const activeFile = activeFileOf(state);
      return buildAgentHealthSnapshot({
        runtimeSnapshot,
        aiConfiguration,
        workspaceBrief: buildWorkspaceToolBrief(state.workspace, state.selectedId),
        activeDoc: buildActiveDocMeta(activeFile, state.markdown ?? ''),
        currentSurface: getSurfaceLabel(state.surface, activeFile),
      });
    },

    applySafeRepair: async ({ repairId = '' } = {}) => {
      const result = await runSafeRepair({
        repairId,
        aiConfiguration: getAiServerConfiguration(),
        confirm: confirmSafeRepair,
        clearAiServerOverride,
        restoreAiServerOverride: saveAiServerBase,
        verify: async (nextBase) => {
          if (!hasDiagnosticsBridge()) return { aiProxy: { reachable: false } };
          return getDiagnosticsSnapshot({ aiProxyBase: nextBase });
        },
      });
      onAiServerBaseChange(readAiServerBase());
      return toJson(result);
    },

    addDailyEntry: async ({ type = 'task', text = '', dateKey = '' } = {}) => {
      const value = cleanText(text);
      if (!value) return '添加失败：内容为空。';
      const state = getState();
      const targetDateKey = normalizeDateKey(dateKey || state.dailyWorkspace?.currentDate || getTodayDateKey());
      state.addDailyItem(targetDateKey, type, value);
      state.setDailyCurrentDate(targetDateKey);
      state.setSurface('daily');
      return `已添加到 ${targetDateKey}：${type}「${value}」。`;
    },

    addTodoEntry: async ({ text = '' } = {}) => {
      const value = cleanText(text);
      if (!value) return '添加失败：待办内容为空。';
      const state = getState();
      state.addTodoItem(value);
      state.setSurface('daily');
      return `已加入待办池：${value}。`;
    },

    openCanvas: async () => {
      getState().setSurface('canvas');
      return '已切换到灵感白板。';
    },

    openSurface: async ({ surface: nextSurface = '' } = {}) => {
      const target = cleanText(nextSurface);
      if (!target) return '切换失败：目标界面为空。';
      const state = getState();
      state.setSurface(target);
      return `已切换到${getSurfaceLabel(target, activeFileOf(state))}。`;
    },

    appendCanvasCards: async ({ cards = [] } = {}) => {
      const state = getState();
      const currentExcalidraw = state.workspace?.canvasState?.excalidraw ?? {};
      const currentElements = Array.isArray(currentExcalidraw.elements) ? currentExcalidraw.elements : [];
      const startIndex = countRenderableCanvasCards(currentElements);
      const items = buildCanvasItemsFromAgentCards(cards, { startIndex });
      if (!items.length) return '添加失败：没有有效卡片。';
      setCanvasAndShow(state, buildExcalidrawCanvasState({
        elements: [...currentElements, ...buildExcalidrawElementsFromItems(items, { startIndex })],
        appState: currentExcalidraw.appState ?? {},
        files: currentExcalidraw.files ?? {},
      }));
      return `已在灵感白板添加 ${items.length} 张卡片。`;
    },

    replaceCanvas: async ({ cards = [], edges = [] } = {}) => {
      const nextCount = Array.isArray(cards) ? cards.length : 0;
      if (!nextCount) return '绘制失败：没有有效卡片。';
      const state = getState();
      const currentExcalidraw = state.workspace?.canvasState?.excalidraw ?? {};
      setCanvasAndShow(state, buildCanvasSceneFromAgentGraph({
        cards, edges, appState: currentExcalidraw.appState ?? {}, files: currentExcalidraw.files ?? {},
      }));
      return `已重建灵感白板，包含 ${nextCount} 张卡片。`;
    },

    clearCanvas: async () => {
      setCanvasAndShow(getState(), { nodes: [], edges: [], viewport: null, excalidraw: null });
      return '已清空灵感白板。';
    },

    createContentEntry: async ({
      kind = 'topic', name = '', summary = '', content = '', targetPlatforms = [], sourceMaterialIds = [],
    } = {}) => {
      const preset = CONTENT_ENTRY_PRESETS[kind] || CONTENT_ENTRY_PRESETS.topic;
      const cleanSummary = cleanText(summary);
      const finalContent = cleanText(content)
        || (cleanSummary ? `# ${name || preset.fallbackName}\n\n${cleanSummary}\n` : '');
      const state = getState();
      const result = await state.createGeneratedFile({
        name: name || preset.fallbackName,
        content: finalContent,
        contextNodeId: state.selectedId,
        meta: { draftStatus: preset.draftStatus, summary, targetPlatforms, sourceMaterialIds },
      });
      return result?.ok
        ? `已创建${kind === 'topic' ? '选题' : '内容条目'}「${result.name}」。`
        : `创建失败：${result?.error || '未知错误'}`;
    },

    readDocById: async (docId) => {
      const targetId = cleanText(docId);
      if (!targetId) return null;
      const file = collectFiles(getState().workspace).find((item) => item?.id === targetId);
      if (!file) return null;
      return { ...buildActiveDocMeta(file, file.content ?? ''), content: file.content ?? '' };
    },

    moveWorkspaceItem: async ({ id, targetFolderId } = {}) => {
      const state = getState();
      const node = findNodeById(state.workspace, id);
      if (!node) return `移动失败：未找到 id 为「${id}」的条目。`;
      const resolvedTargetId = targetFolderId === AGENT_META_FOLDER_NAME ? state.ensureAgentMetaFolder() : targetFolderId;
      const target = findNodeById(getState().workspace, resolvedTargetId);
      if (!target || target.type !== 'folder') return '移动失败：目标不是有效文件夹。';
      const ok = getState().moveNodeToFolderById(id, resolvedTargetId);
      return ok
        ? `已把「${node.name}」移动到「${target.name}」。`
        : `移动失败：「${node.name}」可能已在目标文件夹里，或该条目不支持移动（如磁盘挂载项目、目标在其子树内）。`;
    },

    renameWorkspaceItem: async ({ id, name } = {}) => {
      const state = getState();
      const node = findNodeById(state.workspace, id);
      if (!node) return `重命名失败：未找到 id 为「${id}」的条目。`;
      const ok = state.applyRename(id, name);
      return ok
        ? `已把「${node.name}」重命名为「${name}」。`
        : '重命名失败：名称无效或该条目不支持重命名（如磁盘挂载项目）。';
    },

    // wait=true（app 内 AI）：弹确认框，当面确认；wait=false（外部 agent）：生成删除提案，立即返回
    deleteWorkspaceItems: async ({ ids = [], reason = '' } = {}, { wait = true, who = 'app' } = {}) => {
      if (!wait) {
        const submitted = getState().submitDeleteProposal({ ids, reason, who, tool: 'delete_workspace_items' });
        return submitted.ok
          ? toJson({ ok: true, status: 'pending', proposalId: submitted.proposal.id, message: '已提交删除提案，等待用户在收件箱确认。' })
          : `${submitted.error}请先用 search_docs 确认 id。`;
      }
      const state = getState();
      const looked = ids.map((id) => ({ id, node: findNodeById(state.workspace, id) }));
      const found = looked.filter((item) => item.node && item.id !== 'root');
      const missing = looked.filter((item) => !item.node).map((item) => item.id);
      if (!found.length) return '删除失败：没有找到任何对应条目，请先用 search_docs 确认 id。';

      const confirmed = await confirmDelete(found.map((item) => item.node.name), reason);
      if (!confirmed) return '用户取消了删除，未做任何改动。';

      const removedNames = [];
      const failedNames = [];
      found.forEach((item) => {
        (getState().deleteNode(item.id) ? removedNames : failedNames).push(item.node.name);
      });
      return [
        removedNames.length ? `已删除 ${removedNames.length} 个条目：${removedNames.map((n) => `「${n}」`).join('、')}。` : '',
        failedNames.length ? `删除失败：${failedNames.map((n) => `「${n}」`).join('、')}（可能是磁盘挂载项目，需在侧栏手动处理）。` : '',
        missing.length ? `未找到 id：${missing.join('、')}。` : '',
      ].filter(Boolean).join(' ');
    },

    readEditorialMemory: async () => {
      const ws = getState().workspace;
      const file = findAgentMetaFile(ws, EDITORIAL_MEMORY_DOC_NAME)
        ?? findEditorialMemoryFile(collectFiles(ws)); // 兼容旧版散落在笔记区的记忆
      if (!file) return null;
      return { id: file.id, name: file.name, content: file.content ?? '' };
    },

    updateEditorialMemory: async ({ category, text } = {}) => {
      const state = getState();
      const metaFile = findAgentMetaFile(state.workspace, EDITORIAL_MEMORY_DOC_NAME);
      const legacyFile = metaFile ? null : findEditorialMemoryFile(collectFiles(state.workspace));
      const base = metaFile ?? legacyFile;
      const next = appendMemoryEntry(base?.content ?? '', { category, text, dateKey: getTodayDateKey() });
      if (!next.ok) return `更新失败：${next.error}`;

      const result = state.upsertAgentMetaFile({
        name: EDITORIAL_MEMORY_DOC_NAME,
        content: next.content,
        summary: 'AI 编辑部的长期知识库（只追加，不改写）',
      });
      if (!result?.ok) return `写入记忆失败：${result?.error || '未知错误'}`;

      const location = `${AGENT_META_FOLDER_NAME}/${EDITORIAL_MEMORY_DOC_NAME}`;
      return [
        `已把新经验追加到「${MEMORY_CATEGORIES[category]}」（${location}）。`,
        legacyFile ? '旧位置的记忆内容已并入 .agent 目录，散落的旧「编辑部记忆」文档可以删除了。' : '',
      ].filter(Boolean).join(' ');
    },

    openWorkspaceItem: async ({ id = '' } = {}) => {
      const targetId = cleanText(id);
      if (!targetId) return '打开失败：条目 id 为空。';
      const state = getState();
      const node = findNodeById(state.workspace, targetId);
      if (!node) return `打开失败：未找到 id 为「${targetId}」的条目。`;
      state.selectNode(targetId);
      return node.type === 'folder'
        ? `已打开文件夹「${node.name || '未命名'}」。`
        : `已打开文档「${node.name || '未命名'}」。`;
    },

    createFolder: async ({ name = '' } = {}) => {
      const state = getState();
      if (!state.addFolder(state.selectedId)) return '新建失败：当前位置不支持创建文件夹。';
      const nextState = getState();
      const folder = findNodeById(nextState.workspace, nextState.selectedId);
      const desiredName = cleanText(name);
      if (desiredName && folder?.id && nextState.applyRename(folder.id, desiredName)) {
        return `已创建文件夹「${desiredName}」。`;
      }
      return `已创建文件夹「${folder?.name || '新建文件夹'}」。`;
    },

    listRecentDocs: async (limit = DEFAULT_RECENT_DOCS) => {
      const state = getState();
      return buildRecentDocPointers(state.workspace, state.selectedId, limit);
    },

    getWorkspaceBrief: async () => {
      const state = getState();
      return buildWorkspaceToolBrief(state.workspace, state.selectedId);
    },

    searchDocs: async (query) => {
      const { workspace } = getState();
      // .agent 等隐藏目录里的元数据不进搜索/召回结果
      const hiddenIds = collectHiddenFileIds(workspace);
      if (hasDbBridge()) {
        const res = await dbSearch(query);
        if (!res?.ok) throw new Error(res?.error || '知识库检索失败，请稍后重试。');
        const filesById = new Map(collectFiles(workspace).map((file) => [file.id, file]));
        return (res.results ?? []).filter((r) => !hiddenIds.has(r?.id)).map((r) => {
          const node = filesById.get(r.id);
          return buildContentAssetPointer({
            ...(node ?? {}),
            ...r,
            title: r.title ?? r.name ?? node?.name ?? '未命名',
            snippet: r.snippet ?? r.excerpt ?? node?.summary ?? '',
            id: r.id ?? node?.id,
          });
        });
      }
      const q = String(query).toLowerCase();
      return collectFiles(workspace)
        .filter((f) => !hiddenIds.has(f?.id))
        .filter((f) => getFileKnowledgeSearchText(f).includes(q))
        .map((f) => buildContentAssetPointer(f, { content: String(f.content ?? '').slice(0, SEARCH_FALLBACK_SNIPPET) }));
    },

    searchExternalKnowledge: async ({ query } = {}) => searchExternalKnowledge({
      query,
      sources: getKnowledgeSources(),
      aiProxyBase: readAiServerBase(),
    }),

    /** 执行 server 端注册的脚本工具（pdf_to_docx / video_to_audio 等），返回结构化摘要 */
    execServerTool: async (toolName, args) => {
      if (!hasAiToolBridge()) {
        return toJson({ ok: false, error: 'server 工具通道不可用（需要 Electron 环境）' });
      }
      try {
        const res = await aiExecTool({ toolName, args, aiProxyBase: readAiServerBase() });
        if (!res) return toJson({ ok: false, error: 'server 无响应' });
        const summary = [];
        if (res.stdout) summary.push(String(res.stdout).slice(0, SERVER_STDOUT_MAX));
        if (res.stderr) summary.push(`[stderr] ${String(res.stderr).slice(0, SERVER_STDERR_MAX)}`);
        return toJson({ ok: Boolean(res.ok), exitCode: res.exitCode, error: res.error || null, summary: summary.join('\n') });
      } catch (err) {
        return toJson({ ok: false, error: err?.message ?? String(err) });
      }
    },
  };
}
