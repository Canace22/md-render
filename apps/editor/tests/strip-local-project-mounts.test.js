import { describe, expect, it } from 'vitest';
import {
  stripLocalProjectMounts,
  createDefaultWorkspace,
} from '../renderer/src/store/workspaceUtils.js';

const makeLocalMount = (projectRootPath, name = '项目') => ({
  id: `project:${projectRootPath}`,
  type: 'folder',
  name,
  localProjectRoot: true,
  projectRootPath,
  children: [],
});

const makeNormalFolder = (id, name) => ({
  id,
  type: 'folder',
  name,
  children: [],
});

const makeNormalFile = (id, name) => ({
  id,
  type: 'file',
  name,
  content: '',
});

describe('stripLocalProjectMounts', () => {
  // 1. 传 projectRootPath 时只移除匹配的挂载
  it('只移除匹配 projectRootPath 的本地项目挂载', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeLocalMount('/path/A', '项目A'),
        makeLocalMount('/path/B', '项目B'),
        makeNormalFile('f1', '文件1'),
      ],
    };
    const result = stripLocalProjectMounts(ws, '/path/A');
    expect(result.children).toHaveLength(2);
    expect(result.children.map((c) => c.name)).toEqual(['项目B', '文件1']);
  });

  // 2. 不传 projectRootPath 时移除所有本地项目挂载（向后兼容）
  it('不传 projectRootPath 时移除所有本地项目挂载', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeLocalMount('/path/A'),
        makeLocalMount('/path/B'),
        makeNormalFile('f1', '文件1'),
      ],
    };
    const result = stripLocalProjectMounts(ws);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('f1');
  });

  // 3. 没有匹配的挂载时不影响其他子节点
  it('没有匹配挂载时保持 children 不变', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeLocalMount('/path/A'),
        makeNormalFile('f1', '文件1'),
      ],
    };
    const result = stripLocalProjectMounts(ws, '/path/NONEXISTENT');
    expect(result.children).toHaveLength(2);
  });

  // 4. workspace.children 为空或不存在时安全返回
  it('workspace 无 children 时原样返回', () => {
    const ws = { id: 'root', type: 'folder' };
    expect(stripLocalProjectMounts(ws, '/path/A')).toBe(ws);
  });

  // 5. workspace 为 null 时安全返回
  it('workspace 为 null 时返回 null', () => {
    expect(stripLocalProjectMounts(null, '/path/A')).toBeNull();
  });

  // 6. 多个挂载只移除一个
  it('多个不同路径挂载 + 普通节点混合时精确移除', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeNormalFolder('d1', '文件夹1'),
        makeLocalMount('/path/A', '项目A'),
        makeNormalFile('f1', '文件1'),
        makeLocalMount('/path/B', '项目B'),
        makeLocalMount('/path/C', '项目C'),
      ],
    };
    const result = stripLocalProjectMounts(ws, '/path/B');
    expect(result.children).toHaveLength(4);
    expect(result.children.map((c) => c.name)).toEqual([
      '文件夹1', '项目A', '文件1', '项目C',
    ]);
  });

  // 7. 相同 projectRootPath 多个挂载全部移除
  it('相同 projectRootPath 的多个挂载全部移除', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeLocalMount('/path/A', '项目A-1'),
        makeLocalMount('/path/A', '项目A-2'),
        makeNormalFile('f1', '文件1'),
      ],
    };
    const result = stripLocalProjectMounts(ws, '/path/A');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('f1');
  });

  // 8. 非 localProjectRoot 节点即使有 projectRootPath 也不被移除
  it('非 localProjectRoot 节点不被移除', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        { id: 'f1', type: 'file', name: '文件1', projectRootPath: '/path/A' },
        makeLocalMount('/path/A'),
      ],
    };
    const result = stripLocalProjectMounts(ws, '/path/A');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('f1');
  });

  // 9. 模拟 bug 场景：hydrateProjectsWorkspace 调用时不丢失用户导入的目录
  it('hydrate MdRender 时不丢失用户导入的本地目录', () => {
    const mdRenderPath = '/Users/test/Documents/MdRender';
    const userImportedPath = '/Users/test/Desktop/my-notes';
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeNormalFile('f1', '示例文档.md'),
        makeLocalMount(userImportedPath, 'my-notes'),
      ],
    };
    // hydrate 用 MdRender 路径调用 strip
    const result = stripLocalProjectMounts(ws, mdRenderPath);
    // 用户导入的目录应该保留
    expect(result.children).toHaveLength(2);
    expect(result.children.some((c) => c.name === 'my-notes')).toBe(true);
  });

  // 10. 空 projectRootPath 字符串等同于不传
  it('空字符串 projectRootPath 等同于移除所有', () => {
    const ws = {
      ...createDefaultWorkspace(),
      children: [
        makeLocalMount('/path/A'),
        makeNormalFile('f1', '文件1'),
      ],
    };
    const result = stripLocalProjectMounts(ws, '');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('f1');
  });
});
