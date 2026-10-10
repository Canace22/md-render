import { describe, expect, it } from 'vitest';
import { findWikilinks } from '@narrative/blocknote-core';
import {
  CURRENT_FOLDER_LABEL,
  ROOT_FOLDER_LABEL,
  collectLinkedNames,
  docFilePath,
  findDocByWikiName,
  listWorkspaceDocs,
  matchDocs,
  rankLinkableDocs,
  toWikilink,
} from '../renderer/src/utils/docMentionItems.js';

const file = (id, name, updatedAt = 0) => ({ type: 'file', id, name, updatedAt });
const folder = (id, name, children) => ({ type: 'folder', id, name, children });

// 根
// ├─ 根文档.md
// ├─ 笔记/
// │  ├─ 笔记A.md
// │  ├─ 游戏/
// │  │  ├─ 当前.md  ← 当前文档
// │  │  ├─ Chapter 01.md
// │  │  ├─ Chapter 02.md (更新)
// │  │  └─ 细节/ 细节文档.md
// │  └─ 剧情/ 剧情文档.md
// ├─ 原稿/ 原稿文档.md
// └─ .agent/ memory.md（隐藏）
const workspace = folder('root', 'Projects', [
  file('r', '根文档.md'),
  folder('notes', '笔记', [
    file('na', '笔记A.md'),
    folder('game', '游戏', [
      file('cur', '当前.md', 9),
      file('c1', 'Chapter 01.md', 1),
      file('c2', 'Chapter 02.md', 5),
      folder('detail', '细节', [file('d', '细节文档.md')]),
    ]),
    folder('plot', '剧情', [file('p', '剧情文档.md')]),
  ]),
  folder('drafts', '原稿', [file('dr', '原稿文档.md')]),
  { type: 'folder', id: 'agent', name: '.agent', agentMetaFolder: true, children: [file('h', 'memory.md')] },
]);

const entries = listWorkspaceDocs(workspace);
const ids = (items) => items.map((i) => i.file.id);

describe('@ 引用文档：排序与分组', () => {
  it('隐藏目录不出现', () => {
    expect(entries.some((e) => e.file.id === 'h')).toBe(false);
  });

  it('同目录 → 子目录 → 上一层 → 上一层的其他子目录 → 根', () => {
    expect(ids(rankLinkableDocs(entries, 'cur'))).toEqual(['c2', 'c1', 'd', 'na', 'p', 'r', 'dr']);
  });

  it('同目录标「当前目录」，其他按目录路径分组，根目录单独标出', () => {
    const groups = rankLinkableDocs(entries, 'cur').map((i) => i.group);
    expect(groups[0]).toBe(CURRENT_FOLDER_LABEL);
    expect(groups).toContain('笔记 / 游戏 / 细节');
    expect(groups).toContain(ROOT_FOLDER_LABEL);
  });

  it('已引用的文档和当前文档不出现', () => {
    const linked = collectLinkedNames('目录\n[[Chapter 01]] 和 [[剧情文档|剧情]]');
    const result = ids(rankLinkableDocs(entries, 'cur', linked));
    expect(result).not.toContain('c1');
    expect(result).not.toContain('p');
    expect(result).not.toContain('cur');
  });

  it('搜索保持就近排序，可按标题或目录名匹配', () => {
    const ranked = rankLinkableDocs(entries, 'cur');
    expect(ids(matchDocs(ranked, 'chapter'))).toEqual(['c2', 'c1']);
    expect(ids(matchDocs(ranked, '原稿'))).toEqual(['dr']);
    expect(matchDocs(ranked, '不存在')).toEqual([]);
  });
});

describe('[[双链]] 解析与跳转', () => {
  it('按名称找文档，带不带 .md 都行；找不到返回 null', () => {
    expect(findDocByWikiName(entries, 'Chapter 01')?.id).toBe('c1');
    expect(findDocByWikiName(entries, ' 原稿文档.md ')?.id).toBe('dr');
    expect(findDocByWikiName(entries, '不存在')).toBeNull();
  });

  it('插入的是去掉 .md 的双链', () => {
    expect(toWikilink({ name: '灰溪镇设计.md' })).toBe('[[灰溪镇设计]]');
  });

  it('findWikilinks 识别 [[名称]] 和 [[名称|别名]]，忽略空名', () => {
    expect(findWikilinks('[[a]] [[b|别名]] [[ ]]').map((m) => m.name)).toEqual(['a', 'b']);
  });
});

describe('docFilePath', () => {
  it('根目录 + 相对路径拼成绝对路径，多余的斜杠收掉', () => {
    expect(docFilePath({ projectRootPath: '/vault/', relativePath: '/笔记/a.md' })).toBe('/vault/笔记/a.md');
  });

  it('不在磁盘上的文档返回空串', () => {
    expect(docFilePath({ projectRootPath: '', relativePath: 'a.md' })).toBe('');
    expect(docFilePath(null)).toBe('');
  });
});
