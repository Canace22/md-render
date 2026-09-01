import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseFrontmatterDocument } from '../shared/frontmatterDocument.js';
import {
  readLocalProjectWorkspace,
  saveLocalProjectFile,
  saveLocalProjectMetadata,
} from '../main/localProject.js';

const findNodeByName = (node, name) => {
  if (!node) return null;
  if (node.name === name) return node;
  for (const child of node.children ?? []) {
    const found = findNodeByName(child, name);
    if (found) return found;
  }
  return null;
};

describe('frontmatter 作为属性真源', () => {
  let projectRoot = '';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-fm-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('frontmatter 的属性覆盖旧 sidecar 的值', async () => {
    await fs.writeFile(
      path.join(projectRoot, 'a.md'),
      '---\nstatus: ready\ntags:\n  - ai\n---\n\n正文\n',
      'utf8',
    );
    await fs.mkdir(path.join(projectRoot, '.md-render'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.md-render', 'a.md.md-render-meta.json'),
      JSON.stringify({ version: 1, metadata: { draftStatus: 'draft', tags: ['旧标签'] } }),
      'utf8',
    );

    const file = findNodeByName(await readLocalProjectWorkspace(projectRoot), 'a.md');

    expect(file.draftStatus).toBe('ready');
    expect(file.tags).toEqual(['ai']);
    expect(file.content).toBe('正文\n');
  });

  it('改属性时写进 frontmatter，并清掉旧 sidecar（老文件自然迁移）', async () => {
    const filePath = path.join(projectRoot, 'b.md');
    await fs.writeFile(filePath, '# 标题\n\n正文\n', 'utf8');

    await saveLocalProjectMetadata(projectRoot, 'b.md', {
      title: '文章标题',
      sourceAuthor: '作者名',
      sourcePublishedAt: '2026-09-01T20:30',
      createdAt: Date.parse('2026-09-02'),
      draftStatus: 'drafting',
      targetPlatforms: ['juejin', 'wechat'],
      scheduledPublishAt: '2026-09-03 20:00',
      tags: ['写作'],
    });

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontmatterDocument(raw);
    expect(Object.keys(parsed.frontmatter).slice(0, 4)).toEqual([
      'title', 'author', 'published', 'created',
    ]);
    expect(raw).toContain('title: 文章标题');
    expect(raw).toContain('author: 作者名');
    expect(raw).toContain('published: 2026-09-01');
    expect(raw).toContain('created: 2026-09-02');
    expect(raw).not.toContain('published: 2026-09-01T20:30');
    expect(raw).toContain('status: drafting');
    expect(raw).toContain('platforms:\n  - juejin\n  - wechat');
    expect(raw).toContain('publish: 2026-09-03T20:00');
    expect(raw).toContain('---\n\n# 标题');
    await expect(fs.access(path.join(projectRoot, '.md-render', 'b.md.md-render-meta.json')))
      .rejects.toThrow();

    const types = JSON.parse(await fs.readFile(path.join(projectRoot, '.obsidian', 'types.json'), 'utf8'));
    expect(types.types.title).toBe('text');
    expect(types.types.author).toBe('text');
    expect(types.types.published).toBe('date');
    expect(types.types.created).toBe('date');
    expect(types.types.publish).toBe('datetime');
    expect(types.types.tags).toBe('tags');

    const file = findNodeByName(await readLocalProjectWorkspace(projectRoot), 'b.md');
    expect(file.title).toBe('文章标题');
    expect(file.sourceAuthor).toBe('作者名');
    expect(file.sourcePublishedAt).toBe('2026-09-01');
    expect(file.createdAt).toBe(Date.parse('2026-09-02'));
  });

  it('正式内容字段传空值时从 frontmatter 删除', async () => {
    const filePath = path.join(projectRoot, 'empty.md');
    await fs.writeFile(
      filePath,
      [
        '---',
        'title: 文章标题',
        'author: 作者名',
        'published: 2026-09-01',
        'created: 2026-09-02',
        'status: drafting',
        '---',
        '',
        '正文',
      ].join('\n'),
      'utf8',
    );

    await saveLocalProjectMetadata(projectRoot, 'empty.md', {
      title: '',
      sourceAuthor: '',
      sourcePublishedAt: '',
      createdAt: null,
      draftStatus: 'drafting',
    });

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontmatterDocument(raw);
    expect(parsed.frontmatter).not.toHaveProperty('title');
    expect(parsed.frontmatter).not.toHaveProperty('author');
    expect(parsed.frontmatter).not.toHaveProperty('published');
    expect(parsed.frontmatter).not.toHaveProperty('created');
    expect(parsed.content).toBe('正文');
    expect(raw).toContain('status: drafting');
    expect(raw).toContain('---\n\n正文');
  });

  it('关联文档以 [[wikilink]] 落盘，读回来仍是节点 id', async () => {
    await fs.mkdir(path.join(projectRoot, 'posts'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'posts', '旧稿.md'), '旧稿正文', 'utf8');
    await fs.writeFile(path.join(projectRoot, 'c.md'), '正文', 'utf8');

    await saveLocalProjectMetadata(projectRoot, 'c.md', {
      relatedIds: [`project:${projectRoot}:file:posts/旧稿.md`],
    });

    const raw = await fs.readFile(path.join(projectRoot, 'c.md'), 'utf8');
    expect(raw).toContain('related:\n  - "[[posts/旧稿]]"');

    const file = findNodeByName(await readLocalProjectWorkspace(projectRoot), 'c.md');
    expect(file.relatedIds).toEqual([`project:${projectRoot}:file:posts/旧稿.md`]);
  });

  it('保存正文不会破坏注释与嵌套属性', async () => {
    const filePath = path.join(projectRoot, 'd.md');
    await fs.writeFile(
      filePath,
      '---\ntitle: "标题"\n# 手写注释\nnested:\n  a: 1\n---\n\n旧正文\n',
      'utf8',
    );

    await saveLocalProjectFile(projectRoot, 'd.md', '新正文');

    const raw = await fs.readFile(filePath, 'utf8');
    expect(raw).toContain('# 手写注释');
    expect(raw).toContain('nested:\n  a: 1');
    expect(raw).toContain('---\n\n新正文');
    expect(raw).not.toContain('旧正文');
  });

  it('用户自己加的属性能写进 frontmatter，也能删掉', async () => {
    const filePath = path.join(projectRoot, 'f.md');
    await fs.writeFile(filePath, '---\nstatus: draft\n---\n\n正文\n', 'utf8');

    await saveLocalProjectMetadata(projectRoot, 'f.md', {
      draftStatus: 'draft',
      customProperties: { rating: 4, done: true },
    });
    let raw = await fs.readFile(filePath, 'utf8');
    expect(raw).toContain('rating: 4');
    expect(raw).toContain('done: true');

    const file = findNodeByName(await readLocalProjectWorkspace(projectRoot), 'f.md');
    expect(file.frontmatter.rating).toBe(4);
    expect(file.frontmatter.done).toBe(true);

    await saveLocalProjectMetadata(projectRoot, 'f.md', {
      draftStatus: 'draft',
      customProperties: { rating: '', done: true },
    });
    raw = await fs.readFile(filePath, 'utf8');
    expect(raw).not.toContain('rating:');
    expect(raw).toContain('done: true');
    expect(raw).toContain('status: draft');
  });

  it('平台文章的空属性槽在其他 metadata 更新时仍保留', async () => {
    const filePath = path.join(projectRoot, 'platform.md');
    await fs.writeFile(
      filePath,
      '---\ntitle: 平台标题\nsource: ""\npublished: ""\ncreated: 2026-09-01\ndescription: ""\n---\n\n正文\n',
      'utf8',
    );

    await saveLocalProjectMetadata(projectRoot, 'platform.md', {
      title: '平台标题',
      sourcePublishedAt: '',
      createdAt: Date.parse('2026-09-01'),
      nodeType: 'document',
      targetPlatforms: ['wechat'],
      preserveEmptyFrontmatterKeys: ['source', 'published', 'description'],
    });

    const raw = await fs.readFile(filePath, 'utf8');
    expect(raw).toContain('source: ""');
    expect(raw).toContain('published: ""');
    expect(raw).toContain('description: ""');
    expect(raw).not.toContain('author:');

    const types = JSON.parse(await fs.readFile(path.join(projectRoot, '.obsidian', 'types.json'), 'utf8'));
    expect(types.types.published).toBe('date');
    expect(types.types.created).toBe('date');
  });

  it('已被用户指定过类型的属性，不覆盖 types.json 里的选择', async () => {
    await fs.mkdir(path.join(projectRoot, '.obsidian'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.obsidian', 'types.json'),
      JSON.stringify({ types: { status: 'number', 我的属性: 'text' } }),
      'utf8',
    );
    await fs.writeFile(path.join(projectRoot, 'e.md'), '正文', 'utf8');

    await saveLocalProjectMetadata(projectRoot, 'e.md', { draftStatus: 'ready', tags: ['x'] });

    const types = JSON.parse(await fs.readFile(path.join(projectRoot, '.obsidian', 'types.json'), 'utf8'));
    expect(types.types.status).toBe('number');
    expect(types.types['我的属性']).toBe('text');
    expect(types.types.tags).toBe('tags');
  });
});
