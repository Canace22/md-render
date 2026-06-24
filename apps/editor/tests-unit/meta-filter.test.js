import { describe, expect, it } from 'vitest';
import {
  collectMetaFilterCounts,
  filterWorkspaceByMeta,
  fileMatchesMetaFilters,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
  META_FILTER_STATUS_NONE,
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
        },
        {
          id: 'c',
          type: 'file',
          name: 'C',
          content: '',
          nodeType: 'bookmark',
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
    expect(fileNames(filterWorkspaceByMeta(ws, { status: META_FILTER_STATUS_NONE }))).toEqual(['C']);
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
  });
});
