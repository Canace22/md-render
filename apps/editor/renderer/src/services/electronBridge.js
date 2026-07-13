export const getElectronAPI = () => (
  typeof window !== 'undefined' ? window.electronAPI : null
);

export const getPlatform = () => getElectronAPI()?.platform ?? '';

export const hasDbBridge = () => typeof getElectronAPI()?.db === 'object';

export const hasAiToolBridge = () => (
  typeof getElectronAPI()?.ai?.execTool === 'function'
);

export const hasAiKnowledgeBridge = () => (
  typeof getElectronAPI()?.ai?.searchKnowledge === 'function'
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

export const dbSearch = (query) => getElectronAPI()?.db?.search(query);
export const dbGetGraph = () => getElectronAPI()?.db?.getGraph();
export const dbGetBacklinks = (docId) => getElectronAPI()?.db?.getBacklinks(docId);
export const dbGetVersions = (docId) => getElectronAPI()?.db?.getVersions(docId);
export const dbGetVersionContent = (versionId) => getElectronAPI()?.db?.getVersionContent(versionId);

export const selectCoverImage = () => getElectronAPI()?.selectCoverImage?.();
export const saveBinaryAsset = (payload) => getElectronAPI()?.saveBinaryAsset?.(payload);
export const pickFile = (payload) => getElectronAPI()?.pickFile?.(payload);
export const pickSavePath = (payload) => getElectronAPI()?.pickSavePath?.(payload);

export const aiExecTool = (payload) => getElectronAPI()?.ai?.execTool?.(payload);
export const aiListTools = (payload) => getElectronAPI()?.ai?.listTools?.(payload);
export const aiSearchKnowledge = (payload) => getElectronAPI()?.ai?.searchKnowledge?.(payload);

export const getDiagnosticsSnapshot = (payload) => (
  getElectronAPI()?.diagnostics?.getSnapshot?.(payload)
);

export const getUpdaterBridge = () => getElectronAPI()?.updater ?? null;
