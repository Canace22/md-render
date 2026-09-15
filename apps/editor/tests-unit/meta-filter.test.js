import { describe, expect, it } from 'vitest';
import {
  collectMetaFilterCounts,
  filterWorkspaceByMeta,
  fileMatchesMetaFilters,
  getWorkspaceFileKind,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
  META_FILTER_STATUS_NONE,
  SIDEBAR_FILE_KIND_DOCUMENT,
  SIDEBAR_FILE_KIND_IMAGE,
  SIDEBAR_FILE_KIND_VIDEO,
  normalizeSidebarFileKind,
  SIDEBAR_FILE_KIND_ALL,
} from '../renderer/src/store/workspaceUtils.js';
import { CREATION_STATUS_OPTIONS } from '../renderer/src/store/creationUtils.js';
import { PUBLISHING_PLATFORM_OPTIONS } from '../renderer/src/utils/publishingPlatforms.js';

const ws = {
  id: 'root',
  type: 'folder',
  name: 'r',
  children: [
    {
      id: 'a',
      type: 'file',
      name: 'A',
      content: '',
      draftStatus: 'drafting',
      nodeType: 'document',
      targetPlatforms: ['wechat'],
      tags: ['react', '前端'],
    },
    {
      id: 'd',
      type: 'folder',
      name: '夹',
      children: [
        {
          id: 'b',
          type: 'file',
          name: 'B',
          content: '',
          draftStatus: 'ready',
          nodeType: 'concept',
          targetPlatforms: ['juejin'],
          tags: ['react'],
        },
        {
          id: 'c',
          type: 'file',
          name: 'C',
          content: '',
          nodeType: 'bookmark',
        },
        {
          id: 'img',
          type: 'file',
          name: 'Pasted image 20260910151249.png',
          content: '',
        },
        {
          id: 'vid',
          type: 'file',
          name: '录屏.mp4',
          content: '',
        },
      ],
    },
  ],
};

const fileNames = (n) => !n ? [] : n.type === 'file' ? [n.name] : (n.children ?? []).flatMap(fileNames);

const countOptions = {
  statusOptions: CREATION_STATUS_OPTIONS,
  platformOptions: PUBLISHING_PLATFORM_OPTIONS,
  nodeTypeOptions: KNOWLEDGE_NODE_TYPE_OPTIONS,
};

describe('fileMatchesMetaFilters', () => {
  it('matches status, platform and node type together', () => {
    const file = ws.children[0];
    expect(fileMatchesMetaFilters(file, { status: 'drafting' })).toBe(true);
    expect(fileMatchesMetaFilters(file, { platform: 'wechat' })).toBe(true);
    expect(fileMatchesMetaFilters(file, { nodeType: 'document' })).toBe(true);
    expect(fileMatchesMetaFilters(file, {
      status: 'drafting',
      platform: 'wechat',
      nodeType: 'document',
    })).toBe(true);
    expect(fileMatchesMetaFilters(file, { status: 'ready' })).toBe(false);
  });

  it('matches files with no status', () => {
    const file = ws.children[1].children[1];
    expect(fileMatchesMetaFilters(file, { status: META_FILTER_STATUS_NONE })).toBe(true);
    expect(fileMatchesMetaFilters(ws.children[0], { status: META_FILTER_STATUS_NONE })).toBe(false);
  });

  it('matches tag', () => {
    const file = ws.children[0];
    expect(fileMatchesMetaFilters(file, { tag: 'react' })).toBe(true);
    expect(fileMatchesMetaFilters(file, { tag: 'vue' })).toBe(false);
  });
});

describe('filterWorkspaceByMeta', () => {
  it('filters by status', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { status: 'drafting' }))).toEqual(['A']);
  });

  it('filters by platform', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { platform: 'juejin' }))).toEqual(['B']);
  });

  it('filters by node type', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { nodeType: 'bookmark' }))).toEqual(['C']);
  });

  it('filters by tag', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { tag: 'react' }))).toEqual(['A', 'B']);
    expect(fileNames(filterWorkspaceByMeta(ws, { tag: '前端' }))).toEqual(['A']);
  });

  it('combines filters with AND logic', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, {
      status: 'ready',
      nodeType: 'concept',
    }))).toEqual(['B']);
    expect(filterWorkspaceByMeta(ws, {
      status: 'drafting',
      nodeType: 'concept',
    })).toBeNull();
  });

  it('filters by no status', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { status: META_FILTER_STATUS_NONE }))).toEqual([
      'C',
      'Pasted image 20260910151249.png',
      '录屏.mp4',
    ]);
  });

  it('returns original tree when no filter is active', () => {
    expect(filterWorkspaceByMeta(ws, {})).toBe(ws);
  });
});

describe('collectMetaFilterCounts', () => {
  it('counts only options with matching files', () => {
    const counts = collectMetaFilterCounts(ws, countOptions);
    expect(counts.statuses.map((item) => item.value)).toEqual([
      'drafting',
      'ready',
      META_FILTER_STATUS_NONE,
    ]);
    expect(counts.platforms.map((item) => item.value)).toEqual(['juejin', 'wechat']);
    expect(counts.nodeTypes.map((item) => item.value)).toEqual(['concept', 'document', 'bookmark']);
    expect(counts.tags.map((item) => item.value)).toEqual(['react', '前端']);
    expect(counts.tags.find((item) => item.value === 'react')?.count).toBe(2);
    expect(counts.fileKinds).toEqual([
      { value: 'document', label: '文档', count: 3 },
      { value: 'image', label: '图片', count: 1 },
      { value: 'video', label: '视频', count: 1 },
    ]);
  });
});

describe('getWorkspaceFileKind', () => {
  it('classifies by extension', () => {
    expect(getWorkspaceFileKind({ type: 'file', name: '笔记.md' })).toBe(SIDEBAR_FILE_KIND_DOCUMENT);
    expect(getWorkspaceFileKind({ type: 'file', name: 'Pasted image.png' })).toBe(SIDEBAR_FILE_KIND_IMAGE);
    expect(getWorkspaceFileKind({ type: 'file', name: 'demo.MP4' })).toBe(SIDEBAR_FILE_KIND_VIDEO);
    expect(getWorkspaceFileKind({ type: 'folder', name: 'assets' })).toBeNull();
  });
});

describe('normalizeSidebarFileKind', () => {
  it('falls back to all for empty or unknown values', () => {
    expect(normalizeSidebarFileKind(null)).toBe(SIDEBAR_FILE_KIND_ALL);
    expect(normalizeSidebarFileKind('')).toBe(SIDEBAR_FILE_KIND_ALL);
    expect(normalizeSidebarFileKind('audio')).toBe(SIDEBAR_FILE_KIND_ALL);
    expect(normalizeSidebarFileKind('image')).toBe(SIDEBAR_FILE_KIND_IMAGE);
  });
});

describe('filterWorkspaceByMeta fileKind', () => {
  it('keeps markdown and bookmarks when filtering documents', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { fileKind: SIDEBAR_FILE_KIND_DOCUMENT }))).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('keeps only images', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { fileKind: SIDEBAR_FILE_KIND_IMAGE }))).toEqual([
      'Pasted image 20260910151249.png',
    ]);
  });

  it('keeps only videos', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, { fileKind: SIDEBAR_FILE_KIND_VIDEO }))).toEqual(['录屏.mp4']);
  });

  it('combines file kind with other filters', () => {
    expect(fileNames(filterWorkspaceByMeta(ws, {
      fileKind: SIDEBAR_FILE_KIND_DOCUMENT,
      tag: 'react',
    }))).toEqual(['A', 'B']);
  });

  it('treats all as no file-kind filter', () => {
    expect(filterWorkspaceByMeta(ws, { fileKind: SIDEBAR_FILE_KIND_ALL })).toBe(ws);
  });
});
