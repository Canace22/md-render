import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readLocalProjectWorkspace,
  saveLocalProjectFile,
  saveLocalProjectMetadata,
} from '../main/localProject.js';

const CLIPPING_MARKDOWN = `---
title: "Post by @thedankoe on X"
source: https://x.com/thedankoe/status/206
author: "[[@thedankoe]]"
published: 2026-06-07
created: 2026-06-07
description: "You only need 1 hour."
tags: clippings
---

You only need 1 hour.

1 hour of building. 1 hour of writing.
`;

const findNodeByName = (node, name) => {
  if (!node) return null;
  if (node.name === name) return node;
  if (!Array.isArray(node.children)) return null;

  for (const child of node.children) {
    const result = findNodeByName(child, name);
    if (result) return result;
  }
  return null;
};

describe('local project obsidian clipping compatibility', () => {
  let projectRoot = '';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-clipping-'));
    await fs.mkdir(path.join(projectRoot, 'Clippings'), { recursive: true });
  });

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = '';
    }
  });

  it('reads clipping frontmatter into knowledge metadata and strips it from editor content', async () => {
    await fs.writeFile(path.join(projectRoot, 'Clippings', 'sample.md'), CLIPPING_MARKDOWN, 'utf8');

    const workspace = await readLocalProjectWorkspace(projectRoot);
    const file = findNodeByName(workspace, 'sample.md');

    expect(file?.type).toBe('file');
    expect(file?.content).toBe('You only need 1 hour.\n\n1 hour of building. 1 hour of writing.\n');
    expect(file?.diskContentSnapshot).toBe(file?.content);
    expect(file?.url).toBe('https://x.com/thedankoe/status/206');
    expect(file?.summary).toBe('You only need 1 hour.');
    expect(file?.tags).toEqual(['clippings']);
    expect(file?.nodeType).toBe('bookmark');
  });

  it('preserves existing frontmatter when saving clipping body content', async () => {
    const relativePath = 'Clippings/sample.md';
    const filePath = path.join(projectRoot, relativePath);
    await fs.writeFile(filePath, CLIPPING_MARKDOWN, 'utf8');

    await saveLocalProjectFile(projectRoot, relativePath, '更新后的正文');

    const nextRaw = await fs.readFile(filePath, 'utf8');
    expect(nextRaw).toContain('title: "Post by @thedankoe on X"');
    expect(nextRaw).toContain('source: https://x.com/thedankoe/status/206');
    expect(nextRaw).toContain('tags: clippings');
    expect(nextRaw).toContain('\n\n更新后的正文');
    expect(nextRaw).not.toContain('1 hour of building. 1 hour of writing.');
  });

  it('writes summary, source and tags back into frontmatter on metadata save', async () => {
    const relativePath = 'Clippings/sample.md';
    const filePath = path.join(projectRoot, relativePath);
    await fs.writeFile(filePath, CLIPPING_MARKDOWN, 'utf8');

    await saveLocalProjectMetadata(projectRoot, relativePath, {
      nodeType: 'bookmark',
      summary: '新的摘要',
      url: 'https://example.com/new',
      tags: ['clippings', 'writing'],
    });

    const nextRaw = await fs.readFile(filePath, 'utf8');
    expect(nextRaw).toContain('source: https://example.com/new');
    expect(nextRaw).toContain('description: 新的摘要');
    expect(nextRaw).toContain('tags:');
    expect(nextRaw).toContain('  - clippings');
    expect(nextRaw).toContain('  - writing');
    expect(nextRaw).toContain('author: "[[@thedankoe]]"');
    expect(nextRaw).toContain('You only need 1 hour.');
  });
});
