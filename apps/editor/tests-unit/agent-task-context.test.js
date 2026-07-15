import { describe, expect, it } from 'vitest';
import {
  buildActiveDocMeta,
  buildContentAssetPointer,
  buildTaskContextPacket,
  buildTaskContextPreviewLines,
  buildWorkspaceBrief,
  formatTaskContextPacket,
} from '../renderer/src/core/agent/taskContext.js';

const createFile = (overrides = {}) => ({
  id: 'doc-1',
  type: 'file',
  name: '内容策略.md',
  content: '这是正文内容。',
  summary: '一句话摘要',
  draftStatus: 'drafting',
  nodeType: 'document',
  tags: ['AI', '内容'],
  targetPlatforms: ['wechat'],
  sourceMaterialIds: ['source-1'],
  relatedIds: ['related-1'],
  url: 'https://example.com/source',
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
});

describe('buildContentAssetPointer', () => {
  it('保留定位与专业内容元数据，不暴露正文字段', () => {
    const pointer = buildContentAssetPointer(createFile());

    expect(pointer).toMatchObject({
      id: 'doc-1',
      title: '内容策略.md',
      summary: '一句话摘要',
      status: 'drafting',
      statusLabel: '写作中',
      nodeType: 'document',
      tags: ['AI', '内容'],
      targetPlatforms: ['wechat'],
      sourceMaterialIds: ['source-1'],
      relatedIds: ['related-1'],
      url: 'https://example.com/source',
      updatedAt: 200,
    });
    expect(pointer).not.toHaveProperty('content');
  });

  it('对标题、摘要、URL 和元数据列表做有界截断', () => {
    const pointer = buildContentAssetPointer(createFile({
      name: 'T'.repeat(160),
      summary: 'S'.repeat(220),
      url: `https://example.com/${'u'.repeat(300)}`,
      tags: Array.from({ length: 12 }, (_, index) => `tag-${index}-${'x'.repeat(80)}`),
      sourceMaterialIds: Array.from({ length: 16 }, (_, index) => `source-${index}`),
    }));

    expect(pointer.title.length).toBeLessThanOrEqual(97);
    expect(pointer.summary.length).toBeLessThanOrEqual(141);
    expect(pointer.url.length).toBeLessThanOrEqual(241);
    expect(pointer.tags).toHaveLength(8);
    expect(pointer.tags.every((tag) => tag.length <= 49)).toBe(true);
    expect(pointer.sourceMaterialIds).toHaveLength(12);
  });

  it('保留完整长 id，避免截断后无法继续读取文档', () => {
    const longId = `project:/very/long/path/${'nested/'.repeat(40)}article.md`;
    expect(buildContentAssetPointer(createFile({ id: longId })).id).toBe(longId);
  });

  it('兼容搜索结果的 title/snippet/excerpt 形状', () => {
    const pointer = buildContentAssetPointer({
      id: 'search-1',
      title: '搜索结果',
      snippet: '命中的摘要片段',
      status: 'published',
      reason: '命中关键词：Agent',
    });

    expect(pointer).toMatchObject({
      id: 'search-1',
      title: '搜索结果',
      summary: '命中的摘要片段',
      snippet: '命中的摘要片段',
      statusLabel: '已发布',
      reason: '命中关键词：Agent',
    });
  });

  it('缺少显式摘要时只提取受限的正文头部作为摘要', () => {
    const pointer = buildContentAssetPointer(createFile({
      summary: '',
      content: 'C'.repeat(400),
    }));

    expect(pointer.summary.length).toBeLessThanOrEqual(141);
    expect(pointer).not.toHaveProperty('content');
  });
});

describe('active doc and workspace pointers', () => {
  it('当前稿件使用未保存内容计算摘要和字数，关系数按去重后计算', () => {
    const active = buildActiveDocMeta(createFile({
      summary: '',
      sourceMaterialIds: ['source-1', 'source-1', 'source-2'],
      relatedIds: ['related-1', 'related-1'],
    }), '未保存的编辑器内容');

    expect(active.summary).toBe('未保存的编辑器内容');
    expect(active.contentLength).toBe('未保存的编辑器内容'.length);
    expect(active.sourceMaterialCount).toBe(2);
    expect(active.relatedDocCount).toBe(1);
  });

  it('工作区简报排除当前文档，并返回按更新时间排序的指针', () => {
    const workspace = {
      id: 'root',
      type: 'folder',
      children: [
        createFile({ id: 'selected', updatedAt: 300 }),
        createFile({ id: 'recent-1', name: '最近一.md', updatedAt: 250 }),
        createFile({ id: 'recent-2', name: '最近二.md', updatedAt: 200 }),
      ],
    };

    const brief = buildWorkspaceBrief(workspace, 'selected', { recentLimit: 2 });
    expect(brief.recentDocs.map((item) => item.id)).toEqual(['recent-1', 'recent-2']);
    expect(brief.recentDocs[0]).not.toHaveProperty('content');
  });
});

describe('task context formatting', () => {
  it('上下文包限制最近文档、相关旧文、标签和选区数量', () => {
    const packet = buildTaskContextPacket({
      activeDoc: buildActiveDocMeta(createFile()),
      selectionText: '选'.repeat(300),
      workspaceBrief: {
        totalDocs: 20,
        topTags: ['a', 'b', 'c', 'd'],
        recentDocs: Array.from({ length: 7 }, (_, index) => createFile({ id: `recent-${index}` })),
      },
      relatedRefs: Array.from({ length: 6 }, (_, index) => ({
        id: `related-${index}`,
        title: `相关 ${index}`,
        snippet: `摘要 ${index}`,
      })),
    });

    expect(packet.selection.length).toBeLessThanOrEqual(181);
    expect(packet.workspace.topTags).toEqual(['a', 'b', 'c']);
    expect(packet.recentDocs).toHaveLength(4);
    expect(packet.relatedRefs).toHaveLength(3);
  });

  it('模型简报为当前、最近和相关文档输出可定位 id、状态和摘要', () => {
    const packet = buildTaskContextPacket({
      activeDoc: buildActiveDocMeta(createFile({ id: 'active-1' })),
      workspaceBrief: {
        totalDocs: 3,
        topTags: ['AI'],
        recentDocs: [createFile({ id: 'recent-1', status: 'ready', summary: '待发布摘要' })],
      },
      relatedRefs: [{
        id: 'related-1',
        title: '相关旧文',
        snippet: '旧文摘要',
        status: 'published',
        reason: '关键词命中',
      }],
    });

    const text = formatTaskContextPacket(packet);
    expect(text).toContain('当前稿件：内容策略.md [id: active-1]');
    expect(text).toContain('最近稿件：内容策略.md [id: recent-1]');
    expect(text).toContain('状态 待发布');
    expect(text).toContain('摘要 待发布摘要');
    expect(text).toContain('相关旧文 [id: related-1]');
    expect(text).toContain('关键词命中');
  });

  it('面板预览仍只显示简短标题，不暴露 id、状态和摘要', () => {
    const packet = buildTaskContextPacket({
      activeDoc: buildActiveDocMeta(createFile({ id: 'active-1' })),
      workspaceBrief: {
        totalDocs: 2,
        recentDocs: [createFile({ id: 'recent-1', name: '最近.md' })],
      },
      relatedRefs: [{ id: 'related-1', title: '相关旧文', snippet: '旧文摘要' }],
    });

    const preview = buildTaskContextPreviewLines(packet).join('\n');
    expect(preview).toContain('当前稿件：内容策略.md');
    expect(preview).toContain('相关旧文：相关旧文');
    expect(preview).toContain('最近稿件：最近.md');
    expect(preview).not.toContain('id:');
    expect(preview).not.toContain('写作中');
    expect(preview).not.toContain('一句话摘要');
  });

  it('空输入保持安全降级', () => {
    expect(buildContentAssetPointer(null)).toBeNull();
    expect(buildTaskContextPacket().activeDoc).toBeNull();
    expect(formatTaskContextPacket(null)).toBe('');
    expect(buildTaskContextPreviewLines(null)).toEqual([]);
  });
});
