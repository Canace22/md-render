const getElectronAPI = () => (
  typeof window !== 'undefined' ? window.electronAPI : null
);

const COMPILED_RUNTIME = typeof __MD_RENDER_DESKTOP_RUNTIME__ === 'string'
  ? __MD_RENDER_DESKTOP_RUNTIME__
  : 'web';

const COMPILED_TAURI_PLATFORM = typeof __MD_RENDER_TAURI_PLATFORM__ === 'string'
  ? __MD_RENDER_TAURI_PLATFORM__
  : '';

export const getDesktopRuntimeKind = () => {
  if (getElectronAPI()) return 'electron';
  return COMPILED_RUNTIME === 'tauri' ? 'tauri' : 'web';
};

export const getDesktopPlatform = () => {
  const electronPlatform = getElectronAPI()?.platform;
  if (electronPlatform) return electronPlatform;
  return getDesktopRuntimeKind() === 'tauri' ? COMPILED_TAURI_PLATFORM : '';
};

export const getDesktopRuntimeInfo = async () => {
  const runtime = getDesktopRuntimeKind();
  const platform = getDesktopPlatform();

  if (runtime === 'electron') {
    const version = await getElectronAPI()?.invoke?.('get-app-version');
    return { runtime, platform, version: version || '' };
  }

  if (runtime === 'tauri') {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('runtime_info');
  }

  return { runtime, platform, version: '' };
};
