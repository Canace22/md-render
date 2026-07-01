import { describe, expect, it } from 'vitest';
import {
  buildDerivedAssetKnowledgeFields,
  getDerivationSourceFileId,
} from '../renderer/src/store/workspaceUtils.js';

const workspace = {
  id: 'root',
  type: 'folder',
  name: '工作区',
  children: [
    {
      id: 'source-a',
      type: 'file',
      name: '原稿.md',
      content: '',
    },
    {
      id: 'folder-b',
      type: 'folder',
      name: '素材',
      children: [
        {
          id: 'source-b',
          type: 'file',
          name: '素材.md',
          content: '',
        },
      ],
    },
  ],
};

describe('buildDerivedAssetKnowledgeFields', () => {
  it('adds source file id while preserving normalized meta fields', () => {
    const fields = buildDerivedAssetKnowledgeFields(
      {
        summary: '  平台稿  ',
        targetPlatforms: ['wechat', 'wechat', 'zhihu'],
      },
      'source-a',
    );

    expect(fields.summary).toBe('平台稿');
    expect(fields.targetPlatforms).toEqual(['wechat', 'zhihu']);
    expect(fields.sourceMaterialIds).toEqual(['source-a']);
  });

  it('dedupes explicit and inferred source ids', () => {
    const fields = buildDerivedAssetKnowledgeFields(
      { sourceMaterialIds: ['source-a', 'source-b'] },
      'source-a',
    );

    expect(fields.sourceMaterialIds).toEqual(['source-a', 'source-b']);
  });

  it('ignores empty source ids', () => {
    const fields = buildDerivedAssetKnowledgeFields({ sourceMaterialIds: ['source-a'] }, '');
    expect(fields.sourceMaterialIds).toEqual(['source-a']);
  });
});

describe('getDerivationSourceFileId', () => {
  it('returns selected file id as derivation source', () => {
    expect(getDerivationSourceFileId(workspace, 'source-a')).toBe('source-a');
  });

  it('returns nested file id as derivation source', () => {
    expect(getDerivationSourceFileId(workspace, 'source-b')).toBe('source-b');
  });

  it('does not treat a folder as derivation source', () => {
    expect(getDerivationSourceFileId(workspace, 'folder-b')).toBe('');
  });

  it('returns empty string for missing source node', () => {
    expect(getDerivationSourceFileId(workspace, 'missing')).toBe('');
  });
});
