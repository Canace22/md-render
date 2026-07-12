import { describe, expect, it } from 'vitest';
import { createAgentSlice } from '../renderer/src/store/slices/agentSlice.js';

// 用最小假 store 驱动 agentSlice：真 findNodeById + 假的跨 slice 写入方法。
// 只验证"暂存写入绑定目标文档 id"这条修复，不拉起整棵 useEditorStore。
function makeStore(initial) {
  let state = { ...initial };
  const get = () => state;
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const writes = [];
  state = {
    ...state,
    ...createAgentSlice(set, get),
    updateFileContentById: (fileId, text) => writes.push({ via: 'byId', fileId, text }),
    updateSelectedFileContent: (text) => writes.push({ via: 'selected', fileId: get().selectedId, text }),
  };
  return { get, set, writes };
}

const workspace = {
  id: 'root',
  type: 'folder',
  children: [
    { id: 'A', type: 'file', content: '原文 A' },
    { id: 'B', type: 'file', content: '原文 B' },
  ],
};

describe('agentSlice 写入目标绑定', () => {
  it('暂存后选中态漂移，仍写回暂存时的目标文档', async () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const pending = store.get().stageAgentWrite({ newText: '新文 A' });

    // 模拟 AI 期间打开了别的文档 / 用户切了文档
    store.set({ selectedId: 'B' });
    store.get().applyAgentWrite();

    await expect(pending).resolves.toBe(true);
    expect(store.writes).toEqual([{ via: 'byId', fileId: 'A', text: '新文 A' }]);
  });

  it('暂存时用目标文档的真实正文作为 diff 旧文（忽略传入的 oldText）', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    store.get().stageAgentWrite({ oldText: '过期快照', newText: '新文 A' });
    expect(store.get().agentPendingWrite).toMatchObject({ targetId: 'A', oldText: '原文 A' });
  });

  it('选中的是文件夹（无目标文件）时，回退到写当前选中', () => {
    const folderWs = { id: 'root', type: 'folder', children: [{ id: 'F', type: 'folder', children: [] }] };
    const store = makeStore({ workspace: folderWs, selectedId: 'F' });
    store.get().stageAgentWrite({ oldText: '兜底旧文', newText: '新内容' });
    expect(store.get().agentPendingWrite.targetId).toBeNull();

    store.get().applyAgentWrite();
    expect(store.writes).toEqual([{ via: 'selected', fileId: 'F', text: '新内容' }]);
  });

  it('放弃写入不落盘，Promise 解析为 false', async () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const pending = store.get().stageAgentWrite({ newText: '不要的改动' });
    store.get().discardAgentWrite();
    await expect(pending).resolves.toBe(false);
    expect(store.writes).toEqual([]);
  });
});
