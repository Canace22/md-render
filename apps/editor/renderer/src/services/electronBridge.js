import { getDesktopPlatform } from './desktopBridge.js';
import {
  databaseGetBacklinks,
  databaseGetGraph,
  databaseGetVersionContent,
  databaseGetVersions,
  databaseSaveVersionSnapshot,
  databaseSearch,
  hasDatabaseBridge,
} from './databaseBridge.js';
import {
  isTauriAiBridgeAvailable,
  tauriAiExecTool,
  tauriAiExtractAttachmentText,
  tauriAiListTools,
  tauriAiReadUrl,
  tauriAiSearchKnowledge,
} from './tauriAiBridge.js';

export const getElectronAPI = () => (
  typeof window !== 'undefined' ? window.electronAPI : null
);

export const getPlatform = () => getDesktopPlatform();

export const hasDbBridge = () => hasDatabaseBridge();

export const hasAiToolBridge = () => (
  typeof getElectronAPI()?.ai?.execTool === 'function'
  || isTauriAiBridgeAvailable()
);

export const hasAiKnowledgeBridge = () => (
  typeof getElectronAPI()?.ai?.searchKnowledge === 'function'
  || isTauriAiBridgeAvailable()
);

export const hasAiUrlReaderBridge = () => (
  typeof getElectronAPI()?.ai?.readUrl === 'function'
  || isTauriAiBridgeAvailable()
);

export const hasAiAttachmentTextBridge = () => (
  typeof getElectronAPI()?.ai?.extractAttachmentText === 'function'
  || isTauriAiBridgeAvailable()
);

export const hasDiagnosticsBridge = () => (
  typeof getElectronAPI()?.diagnostics?.getSnapshot === 'function'
);

export const hasFilePickerBridge = () => (
  typeof getElectronAPI()?.pickFile === 'function'
  && typeof getElectronAPI()?.pickSavePath === 'function'
);

export const hasCoverImagePicker = () => (
  typeof getElectronAPI()?.selectCoverImage === 'function'
);

export const dbSearch = (query) => databaseSearch(query);
export const dbGetGraph = () => databaseGetGraph();
export const dbGetBacklinks = (docId) => databaseGetBacklinks(docId);
export const dbGetVersions = (docId) => databaseGetVersions(docId);
export const dbGetVersionContent = (versionId) => databaseGetVersionContent(versionId);
export const dbSaveVersionSnapshot = (docId, content) => (
  databaseSaveVersionSnapshot(docId, content)
);

export const selectCoverImage = () => getElectronAPI()?.selectCoverImage?.();
export const saveBinaryAsset = (payload) => getElectronAPI()?.saveBinaryAsset?.(payload);
export const copyImageToClipboardNative = (src) => getElectronAPI()?.copyImageToClipboard?.(src);
export const pickFile = (payload) => getElectronAPI()?.pickFile?.(payload);
export const pickSavePath = (payload) => getElectronAPI()?.pickSavePath?.(payload);

export const aiExecTool = (payload) => (
  getElectronAPI()?.ai?.execTool?.(payload)
  ?? (isTauriAiBridgeAvailable() ? tauriAiExecTool(payload) : undefined)
);
export const aiListTools = (payload) => (
  getElectronAPI()?.ai?.listTools?.(payload)
  ?? (isTauriAiBridgeAvailable() ? tauriAiListTools(payload) : undefined)
);
export const aiSearchKnowledge = (payload) => (
  getElectronAPI()?.ai?.searchKnowledge?.(payload)
  ?? (isTauriAiBridgeAvailable() ? tauriAiSearchKnowledge(payload) : undefined)
);
export const aiReadUrl = (payload) => (
  getElectronAPI()?.ai?.readUrl?.(payload)
  ?? (isTauriAiBridgeAvailable() ? tauriAiReadUrl(payload) : undefined)
);
export const aiExtractAttachmentText = (payload) => (
  getElectronAPI()?.ai?.extractAttachmentText?.(payload)
  ?? (isTauriAiBridgeAvailable() ? tauriAiExtractAttachmentText(payload) : undefined)
);

export const getDiagnosticsSnapshot = (payload) => (
  getElectronAPI()?.diagnostics?.getSnapshot?.(payload)
);

export const getUpdaterBridge = () => getElectronAPI()?.updater ?? null;

export const onMenuSelectAll = (callback) => {
  const api = getElectronAPI();
  if (typeof api?.on !== 'function') return () => {};
  return api.on('menu-select-all', callback);
};
