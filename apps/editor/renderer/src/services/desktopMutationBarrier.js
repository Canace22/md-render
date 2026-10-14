let activeBarrier = null;
let nextBarrierId = 0;

const setDocumentInert = (inert) => {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.inert = inert;
  if (inert) {
    document.documentElement.setAttribute('aria-busy', 'true');
  } else {
    document.documentElement.removeAttribute('aria-busy');
  }
};

export const beginDesktopMutationBarrier = (reason) => {
  if (activeBarrier) {
    throw new Error('另一个桌面数据操作正在进行，请稍后重试。');
  }
  const barrier = {
    id: ++nextBarrierId,
    reason: String(reason || '数据操作'),
    frozen: false,
  };
  activeBarrier = barrier;
  setDocumentInert(true);
  return barrier;
};

export const freezeDesktopMutations = (barrier) => {
  if (!activeBarrier || activeBarrier.id !== barrier?.id) {
    throw new Error('桌面数据保护状态已失效。');
  }
  activeBarrier.frozen = true;
};

export const endDesktopMutationBarrier = (barrier) => {
  if (!activeBarrier || activeBarrier.id !== barrier?.id) return;
  activeBarrier = null;
  setDocumentInert(false);
};

export const isDesktopMutationFrozen = () => Boolean(activeBarrier?.frozen);

export const assertDesktopMutationsAllowed = () => {
  if (!isDesktopMutationFrozen()) return;
  throw new Error(`正在${activeBarrier.reason}，已阻止新的数据修改。`);
};
