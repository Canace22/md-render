import { describe, expect, it } from 'vitest';
import {
  parseFrontmatterDocument,
  replaceMarkdownBody,
  updateFrontmatterInMarkdown,
} from '../shared/frontmatterDocument.js';
import {
  frontmatterToMetadata,
  buildObsidianTypeMap,
  getPropertyDefByKey,
  inferWidget,
  metadataToFrontmatterPatch,
  PROPERTY_DEFINITIONS,
  PROPERTY_TEMPLATES,
  resolveVisibleProperties,
} from '../shared/properties.js';

const RICH_MARKDOWN = [
  '---',
  'title: "Post by @thedankoe"',
  '# 手写注释不能丢',
  'tags: clippings',
  'nested:',
  '  a: 1',
  '  b: 2',
  'rating: 5',
  'done: true',
  'desc: |-',
  '  第一行',
  '  第二行',
  '---',
  '',
  '正文第一行',
  '',
].join('\n');

describe('frontmatter 往返读写', () => {
  it('解析出扁平值，并保留正文', () => {
    const doc = parseFrontmatterDocument(RICH_MARKDOWN);

    expect(doc.hasFrontmatter).toBe(true);
    expect(doc.frontmatter.title).toBe('Post by @thedankoe');
    expect(doc.frontmatter.rating).toBe(5);
    expect(doc.frontmatter.done).toBe(true);
    expect(doc.frontmatter.desc).toBe('第一行\n第二行');
    expect(doc.content).toBe('正文第一行\n');
  });

  it('只改一个属性时，注释 / 嵌套 / 块标量 / 顺序全部原样保留', () => {
    const next = updateFrontmatterInMarkdown(RICH_MARKDOWN, { rating: 4 });

    expect(next).toBe(RICH_MARKDOWN.replace('rating: 5', 'rating: 4'));
  });

  it('空 patch 与替换正文都不改动 frontmatter', () => {
    expect(updateFrontmatterInMarkdown(RICH_MARKDOWN, {})).toBe(RICH_MARKDOWN);
    expect(replaceMarkdownBody(RICH_MARKDOWN, '换掉的正文')).toContain('# 手写注释不能丢');
    expect(replaceMarkdownBody(RICH_MARKDOWN, '换掉的正文')).toContain('---\n\n换掉的正文');
  });

  it('裸文件首次写属性会新建 frontmatter，正文不被吞', () => {
    const next = updateFrontmatterInMarkdown('# 标题\n\n正文', { status: 'drafting' });
    expect(next).toBe('---\nstatus: drafting\n---\n\n# 标题\n\n正文');
  });

  it('值为空表示删除该属性', () => {
    const next = updateFrontmatterInMarkdown(RICH_MARKDOWN, { tags: [], done: '' });
    expect(next).not.toContain('tags:');
    expect(next).not.toContain('done:');
    expect(next).toContain('rating: 5');
  });

  it('显式指定的空属性可保留为待填槽', () => {
    const next = updateFrontmatterInMarkdown('正文', { published: '' }, {
      preserveEmptyKeys: ['published'],
    });
    expect(next).toBe('---\npublished: ""\n---\n\n正文');
  });
});

describe('属性 schema', () => {
  it('metadata 与 frontmatter 双向映射：日期规范化、平台列表、关联 wikilink', () => {
    const patch = metadataToFrontmatterPatch({
      draftStatus: 'drafting',
      targetPlatforms: ['juejin', 'wechat'],
      scheduledPublishAt: '2026-09-03 20:00',
      relatedIds: ['file:posts/旧稿.md'],
    });

    expect(patch.status).toBe('drafting');
    expect(patch.platforms).toEqual(['juejin', 'wechat']);
    expect(patch.publish).toBe('2026-09-03T20:00');
    expect(patch.related).toEqual(['[[posts/旧稿]]']);

    expect(frontmatterToMetadata(patch)).toEqual({
      draftStatus: 'drafting',
      targetPlatforms: ['juejin', 'wechat'],
      scheduledPublishAt: '2026-09-03T20:00',
      relatedIds: ['file:posts/旧稿.md'],
    });
  });

  it('未定义的属性按值推断控件类型', () => {
    expect(inferWidget(5)).toBe('number');
    expect(inferWidget(true)).toBe('checkbox');
    expect(inferWidget(['a'])).toBe('list');
    expect(inferWidget('2026-09-03')).toBe('date');
    expect(inferWidget('https://x.com')).toBe('url');

    const visible = resolveVisibleProperties(
      { status: 'drafting', rating: 5, done: true },
      PROPERTY_TEMPLATES.draft,
    );
    const byKey = Object.fromEntries(visible.map((item) => [item.key, item.widget]));

    expect(byKey.status).toBe('select');
    expect(byKey.rating).toBe('number');
    expect(byKey.done).toBe('checkbox');
    expect(visible[0].key).toBe('status');
  });

  it('平台文章模板按目标顺序展示，日期字段为 date', () => {
    const visible = resolveVisibleProperties({}, PROPERTY_TEMPLATES.platformArticle);
    expect(visible.map((item) => item.key)).toEqual([
      'title', 'source', 'author', 'published', 'created', 'description', 'tags',
    ]);
    expect(visible.find((item) => item.key === 'title')?.field).toBe('title');
    expect(visible.find((item) => item.key === 'published')?.widget).toBe('date');
    expect(visible.find((item) => item.key === 'created')?.widget).toBe('date');
    expect(visible.find((item) => item.key === 'created')?.field).toBe('createdAt');

    const types = buildObsidianTypeMap();
    expect(types.title).toBe('text');
    expect(types.author).toBe('text');
    expect(types.published).toBe('date');
    expect(types.created).toBe('date');

    expect(getPropertyDefByKey('title')).toMatchObject({
      field: 'title', widget: 'text', obsidianType: 'text',
    });
    expect(getPropertyDefByKey('author')).toMatchObject({
      field: 'sourceAuthor', widget: 'text', obsidianType: 'text',
    });
    expect(getPropertyDefByKey('published')).toMatchObject({
      field: 'sourcePublishedAt', widget: 'date', obsidianType: 'date',
    });
    expect(getPropertyDefByKey('created')).toMatchObject({
      field: 'createdAt', widget: 'date', obsidianType: 'date',
    });
  });

  it('draft / bookmark / default 模板都包含统一内容日期字段', () => {
    expect(PROPERTY_DEFINITIONS.slice(0, 7).map((item) => item.key)).toEqual([
      'title', 'source', 'author', 'published', 'created', 'description', 'tags',
    ]);
    expect(PROPERTY_TEMPLATES.draft).toEqual([
      'status', 'type', 'title', 'author', 'published', 'created', 'description',
      'cover', 'tags', 'platforms', 'publish', 'sources', 'related',
    ]);
    expect(PROPERTY_TEMPLATES.bookmark).toEqual([
      'type', 'title', 'source', 'author', 'published', 'created', 'description',
      'tags', 'cover', 'related',
    ]);
    expect(PROPERTY_TEMPLATES.default).toEqual([
      'status', 'type', 'title', 'author', 'published', 'created',
      'description', 'tags', 'related',
    ]);
  });

  it('新文件的平台文章字段优先排在内部流程属性前', () => {
    const patch = metadataToFrontmatterPatch({
      title: '标题',
      nodeType: 'document',
      summary: '摘要',
      url: 'https://example.com',
      sourceAuthor: '作者',
      sourcePublishedAt: '',
      createdAt: Date.parse('2026-09-01'),
      targetPlatforms: ['wechat'],
    });
    expect(Object.keys(patch).slice(0, 6)).toEqual([
      'title', 'source', 'author', 'published', 'created', 'description',
    ]);
  });

  it('统一内容字段按固定顺序往返，纯日期不带时间，空值可删除', () => {
    const createdAt = Date.parse('2026-09-02');
    const metadata = {
      title: '文章标题',
      url: 'https://example.com/post',
      sourceAuthor: '作者名',
      sourcePublishedAt: '2026-09-01T20:30',
      createdAt,
      summary: '一句话摘要',
      tags: ['clippings'],
    };
    const patch = metadataToFrontmatterPatch(metadata);

    expect(Object.keys(patch)).toEqual([
      'title', 'source', 'author', 'published', 'created', 'description', 'tags',
    ]);
    expect(patch.published).toBe('2026-09-01');
    expect(patch.created).toBe('2026-09-02');

    const raw = updateFrontmatterInMarkdown('正文', patch);
    expect(raw).toBe([
      '---',
      'title: 文章标题',
      'source: https://example.com/post',
      'author: 作者名',
      'published: 2026-09-01',
      'created: 2026-09-02',
      'description: 一句话摘要',
      'tags:',
      '  - clippings',
      '---',
      '',
      '正文',
    ].join('\n'));
    expect(raw).not.toContain('T00:00');

    const parsed = parseFrontmatterDocument(raw);
    expect(frontmatterToMetadata(parsed.frontmatter)).toEqual({
      title: '文章标题',
      url: 'https://example.com/post',
      sourceAuthor: '作者名',
      sourcePublishedAt: '2026-09-01',
      createdAt,
      summary: '一句话摘要',
      tags: ['clippings'],
    });

    const cleared = updateFrontmatterInMarkdown(raw, metadataToFrontmatterPatch({
      title: '',
      url: '',
      sourceAuthor: '',
      sourcePublishedAt: '',
      createdAt: null,
      summary: '',
      tags: [],
    }));
    expect(cleared).toBe('正文');
  });

  it('写入 frontmatter 后能被重新解析回同样的 metadata', () => {
    const metadata = { draftStatus: 'ready', tags: ['ai', '写作'], summary: '一句话摘要' };
    const raw = updateFrontmatterInMarkdown('正文', metadataToFrontmatterPatch(metadata));
    const parsed = parseFrontmatterDocument(raw);

    expect(frontmatterToMetadata(parsed.frontmatter)).toEqual(metadata);
    expect(parsed.content).toBe('正文');
  });
});
