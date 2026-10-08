import { describe, expect, it } from 'vitest';
import { keepPinnedFlags, togglePinNode, findNodeById } from '../renderer/src/store/workspaceUtils.js';

const ROOT_PATH = '/Users/test/Clippings';
const folder = (id, children = [], extra = {}) => ({ id, type: 'folder', name: id, children, ...extra });
const file = (id) => ({ id, type: 'file', name: id, content: '' });

// 模拟磁盘重新扫描：结构相同，但都是新对象，没有 pinned
const freshScan = () => folder('root', [
  folder('a', [file('a/1.md'), file('a/2.md')]),
  folder(`project:${ROOT_PATH}`, [file('c/1.md')], { localProjectRoot: true, projectRootPath: ROOT_PATH }),
]);

describe('keepPinnedFlags', () => {
  it('磁盘刷新后保留文件夹置顶', () => {
    const prev = togglePinNode(freshScan(), 'a');
    const next = keepPinnedFlags(freshScan(), prev);
    expect(findNodeById(next, 'a').pinned).toBe(true);
  });

  it('挂载的本地项目根也能置顶并在刷新后保留', () => {
    const rootId = `project:${ROOT_PATH}`;
    const prev = togglePinNode(freshScan(), rootId);
    expect(prev.children[0].id).toBe(rootId);
    const next = keepPinnedFlags(freshScan(), prev);
    expect(findNodeById(next, rootId).pinned).toBe(true);
  });

  it('保留深层文件的置顶', () => {
    const prev = togglePinNode(freshScan(), 'a/2.md');
    const next = keepPinnedFlags(freshScan(), prev);
    expect(findNodeById(next, 'a/2.md').pinned).toBe(true);
    expect(findNodeById(next, 'a/1.md').pinned).toBeUndefined();
  });

  it('取消置顶后刷新不会被带回来', () => {
    const pinned = togglePinNode(freshScan(), 'a');
    const unpinned = togglePinNode(pinned, 'a');
    const next = keepPinnedFlags(freshScan(), unpinned);
    expect(findNodeById(next, 'a').pinned).toBeFalsy();
  });

  it('没有置顶时原样返回同一引用', () => {
    const next = freshScan();
    expect(keepPinnedFlags(next, freshScan())).toBe(next);
  });
});
