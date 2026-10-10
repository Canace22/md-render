import { describe, expect, it } from 'vitest';
import { BUILTIN_DOCS_DIR, extractBase64Images, planBuiltinDocsMigration, rewriteWikilinks, sanitizeFileName } from '@shared/migration/docsPlan.js';
import { parseFrontmatterDocument } from '@shared/frontmatterDocument.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const workspace = {
  id: 'root',
  type: 'folder',
  children: [
    { id: 'f-a', type: 'folder', name: '工作', children: [
      { id: 'doc-1', type: 'file', name: '周报', content: '第一篇周报', tags: ['周报'], draftStatus: 'drafting' },
    ] },
    { id: 'f-b', type: 'folder', name: '个人', children: [
      { id: 'doc-2', type: 'file', name: '周报.md', content: '第二篇周报' },
    ] },
    { id: 'doc-3', type: 'file', name: '索引', content: `见 [[周报]] 和 [[周报|上周]]，还有 [[不存在]]\n\n![](data:image/png;base64,${PNG})\n![](data:image/png;base64,${PNG})`, relatedIds: ['doc-1'] },
    { id: 'doc-4', type: 'file', name: 'a/b:c', content: '' },
    { id: 'bm-1', type: 'file', name: '收藏', nodeType: 'bookmark', url: 'https://example.com', content: '' },
    { id: 'meta', type: 'folder', name: '.agent', agentMetaFolder: true, children: [{ id: 'mem', type: 'file', name: '编辑部记忆.md', content: 'x' }] },
    { id: 'disk', type: 'folder', name: 'Projects', projectRootPath: '/x', relativePath: 'Projects', children: [] },
  ],
};

const byId = (plan, id) => plan.docs.find((doc) => doc.legacyId === id);
const frontmatterOf = (doc) => parseFrontmatterDocument(doc.content).frontmatter;

describe('内置文档迁移计划', () => {
  const plan = planBuiltinDocsMigration(workspace);

  it('保留目录结构；跳过 .agent 和磁盘挂载节点', () => {
    expect(plan.folders).toEqual([`${BUILTIN_DOCS_DIR}/工作`, `${BUILTIN_DOCS_DIR}/个人`]);
    expect(plan.docs.map((d) => d.legacyId)).toEqual(['doc-1', 'doc-2', 'doc-3', 'doc-4', 'bm-1']);
    expect(byId(plan, 'doc-1').relativePath).toBe(`${BUILTIN_DOCS_DIR}/工作/周报.md`);
  });

  it('全库重名加 (2)，原名进 aliases，原 id 进 frontmatter', () => {
    const second = byId(plan, 'doc-2');
    expect(second.relativePath).toBe(`${BUILTIN_DOCS_DIR}/个人/周报 (2).md`);
    expect(frontmatterOf(second)).toMatchObject({ id: 'doc-2', aliases: ['周报'] });
    expect(plan.renames).toContainEqual({ legacyId: 'doc-2', from: '周报.md', to: second.relativePath });
  });

  it('[[周报]] 原本解析到后出现的那篇，改写成 [[周报 (2)|周报]]，显示文字不变', () => {
    const index = byId(plan, 'doc-3');
    expect(index.content).toContain('[[周报 (2)|周报]]');
    expect(index.content).toContain('[[周报 (2)|上周]]');
    expect(index.content).toContain('[[不存在]]');
    expect(plan.linkRewrites[0].rewrites).toHaveLength(2);
  });

  it('元数据进 frontmatter，关联写成新路径的 wikilink', () => {
    expect(frontmatterOf(byId(plan, 'doc-1'))).toMatchObject({ id: 'doc-1', tags: ['周报'], status: 'drafting' });
    expect(frontmatterOf(byId(plan, 'doc-3')).related).toEqual([`[[${BUILTIN_DOCS_DIR}/工作/周报]]`]);
    expect(frontmatterOf(byId(plan, 'bm-1'))).toMatchObject({ type: 'bookmark', source: 'https://example.com' });
  });

  it('两张相同的 base64 图只存一份，正文改成相对路径', () => {
    const index = byId(plan, 'doc-3');
    expect(index.assets).toHaveLength(1);
    expect(index.content).not.toContain('base64');
    expect(index.content).toContain(`](assets/${index.assets[0].fileName})`);
    expect(plan.assetStats.count).toBe(1);
  });

  it('非法文件名被清洗；和磁盘已有文件撞名也避让', () => {
    expect(byId(plan, 'doc-4').relativePath).toBe(`${BUILTIN_DOCS_DIR}/a_b_c.md`);
    const avoided = planBuiltinDocsMigration(workspace, { existingNames: ['索引'] });
    expect(byId(avoided, 'doc-3').relativePath).toBe(`${BUILTIN_DOCS_DIR}/索引 (2).md`);
  });

  it('同样输入两次得到完全相同的计划（可重复执行）', () => {
    expect(planBuiltinDocsMigration(workspace)).toEqual(plan);
  });
});

describe('小工具', () => {
  it('sanitizeFileName / rewriteWikilinks / extractBase64Images', () => {
    expect(sanitizeFileName('  ')).toBe('untitled');
    expect(rewriteWikilinks('[[A#小节]]', (n) => (n === 'A' ? 'A (2)' : null)).content).toBe('[[A (2)#小节|A]]');
    expect(extractBase64Images('data:image/bmp;base64,AAAA').assets).toEqual([]);
  });
});
