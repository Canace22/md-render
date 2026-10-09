import { describe, expect, it } from 'vitest';
import { buildLocalEntryPath } from '../renderer/src/utils/localEntryPath.js';

describe('buildLocalEntryPath', () => {
  it('拼接根目录与相对路径', () => {
    expect(buildLocalEntryPath({ projectRootPath: '/Users/a/MdRender', relativePath: '笔记/技术报告.md' }))
      .toBe('/Users/a/MdRender/笔记/技术报告.md');
  });

  it('去掉多余的首尾斜杠', () => {
    expect(buildLocalEntryPath({ projectRootPath: '/root/', relativePath: '/a.md' })).toBe('/root/a.md');
  });

  it('Windows 根路径沿用反斜杠', () => {
    expect(buildLocalEntryPath({ projectRootPath: 'C:\\docs', relativePath: 'notes/a.md' }))
      .toBe('C:\\docs\\notes\\a.md');
  });

  it('没有相对路径时返回根目录，非本地节点返回空串', () => {
    expect(buildLocalEntryPath({ projectRootPath: '/root' })).toBe('/root');
    expect(buildLocalEntryPath({ name: 'a.md' })).toBe('');
    expect(buildLocalEntryPath(null)).toBe('');
  });

  it('文件夹节点返回文件夹路径；Web 版合成根路径返回空串', () => {
    expect(buildLocalEntryPath({ projectRootPath: '/root', relativePath: '笔记/游戏设计' }))
      .toBe('/root/笔记/游戏设计');
    expect(buildLocalEntryPath({ projectRootPath: 'webfs:MdRender:abc', relativePath: 'a.md' })).toBe('');
  });
});
