import { describe, expect, it } from 'vitest';
import { countWords } from '../src/utils/wordCount.js';
import { filterWorkspace } from '../src/store/workspaceUtils.js';

describe('countWords', () => {
  it('counts CJK characters one by one', () => {
    expect(countWords('你好世界')).toBe(4);
  });

  it('counts english words, not letters', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('mixes cjk and english', () => {
    expect(countWords('我用 React 写代码')).toBe(6); // 我用写代码=5 + React=1
  });

  it('ignores markdown syntax and code blocks', () => {
    const md = '# 标题\n\n```js\nconsole.log(1)\n```\n\n正文内容';
    // 标题=2 + 正文内容=4 ；代码块被剔除
    expect(countWords(md)).toBe(6);
  });

  it('returns 0 for empty or nullish', () => {
    expect(countWords('')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });
});

const sampleWorkspace = {
  id: 'root',
  type: 'folder',
  name: '工作区',
  children: [
    { id: 'f1', type: 'file', name: '日记.md', content: '今天天气不错' },
    {
      id: 'd1',
      type: 'folder',
      name: '小说',
      children: [
        { id: 'f2', type: 'file', name: '第一章.md', content: '沈临川来到青石城' },
        { id: 'f3', type: 'file', name: '大纲.md', content: '主线剧情' },
      ],
    },
  ],
};

const fileNames = (node) => {
  if (!node) return [];
  if (node.type === 'file') return [node.name];
  return (node.children ?? []).flatMap(fileNames);
};

describe('filterWorkspace', () => {
  it('returns original tree when keyword empty', () => {
    expect(filterWorkspace(sampleWorkspace, '')).toBe(sampleWorkspace);
    expect(filterWorkspace(sampleWorkspace, '   ')).toBe(sampleWorkspace);
  });

  it('matches by file name', () => {
    const result = filterWorkspace(sampleWorkspace, '日记');
    expect(fileNames(result)).toEqual(['日记.md']);
  });

  it('matches by file content', () => {
    const result = filterWorkspace(sampleWorkspace, '青石城');
    expect(fileNames(result)).toEqual(['第一章.md']);
  });

  it('keeps parent folder path of matched files', () => {
    const result = filterWorkspace(sampleWorkspace, '青石城');
    const novelFolder = result.children.find((c) => c.id === 'd1');
    expect(novelFolder).toBeTruthy();
    expect(novelFolder.children.map((c) => c.name)).toEqual(['第一章.md']);
  });

  it('returns null when nothing matches', () => {
    expect(filterWorkspace(sampleWorkspace, '不存在的词')).toBeNull();
  });

  it('is case-insensitive for english', () => {
    const ws = {
      id: 'root', type: 'folder', name: 'r',
      children: [{ id: 'a', type: 'file', name: 'README.md', content: '' }],
    };
    expect(fileNames(filterWorkspace(ws, 'readme'))).toEqual(['README.md']);
  });
});
