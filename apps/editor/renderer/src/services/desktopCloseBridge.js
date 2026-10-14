import { getDesktopRuntimeKind } from './desktopBridge.js';
import {
  beginDesktopMutationBarrier,
  endDesktopMutationBarrier,
  freezeDesktopMutations,
} from './desktopMutationBarrier.js';

let nextHandlerId = 0;
let nextDrainId = 0;
let activeCloseHandler = null;
let closeListenerPromise = null;
const closeDrains = new Map();

export const registerTauriCloseDrain = (drain) => {
  if (getDesktopRuntimeKind() !== 'tauri' || typeof drain !== 'function') return () => {};
  const drainId = ++nextDrainId;
  closeDrains.set(drainId, drain);
  return () => closeDrains.delete(drainId);
};

export const flushTauriCloseDrains = async () => {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const drain of [...closeDrains.values()]) {
      await drain();
    }
  }
};

const ensureCloseListener = () => {
  if (closeListenerPromise) return closeListenerPromise;

  closeListenerPromise = (async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    let closeInProgress = false;
    let destroying = false;

    await appWindow.onCloseRequested(async (event) => {
      if (destroying || !activeCloseHandler) return;
      event.preventDefault();
      if (closeInProgress) return;

      const handler = activeCloseHandler;
      closeInProgress = true;
      let mutationBarrier = null;
      try {
        mutationBarrier = beginDesktopMutationBarrier('安全退出');
        await handler.beforeClose({
          freezeMutations: () => freezeDesktopMutations(mutationBarrier),
        });
        destroying = true;
        await appWindow.destroy();
      } catch (error) {
        endDesktopMutationBarrier(mutationBarrier);
        closeInProgress = false;
        destroying = false;
        handler.onError?.(error);
      }
    });
  })().catch((error) => {
    closeListenerPromise = null;
    throw error;
  });

  return closeListenerPromise;
};

export const listenForTauriClose = async ({ beforeClose, onError }) => {
  if (getDesktopRuntimeKind() !== 'tauri') return () => {};

  const handlerId = ++nextHandlerId;
  activeCloseHandler = { handlerId, beforeClose, onError };
  try {
    await ensureCloseListener();
  } catch (error) {
    if (activeCloseHandler?.handlerId === handlerId) activeCloseHandler = null;
    throw error;
  }

  return () => {
    if (activeCloseHandler?.handlerId === handlerId) activeCloseHandler = null;
  };
};
