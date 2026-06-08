import { describe, expect, it } from 'vitest';
// 从 dist 纯逻辑产物直接导入（不经 @blocknote/core，可在 node 环境下运行）。
// 验证 blocknote-core 经 dist 接入后，机制层在本应用中行为正确。
import {
  filterSuggestionItemsByQuery,
  stringToBlockContent,
} from '../../../packages/blocknote-core/dist/utils/editorBlockInsert.js';

describe('blocknote-core 机制层接入', () => {
  it('stringToBlockContent 正确包装文本', () => {
    expect(stringToBlockContent('hi')).toEqual([{ type: 'text', text: 'hi', styles: {} }]);
    expect(stringToBlockContent('')).toEqual([]);
  });

  it('filterSuggestionItemsByQuery 按 title / aliases 过滤', () => {
    const items = [
      { title: '标题一', aliases: ['h1'] },
      { title: '引用', aliases: ['quote'] },
    ];
    expect(filterSuggestionItemsByQuery(items, '').length).toBe(2);
    expect(filterSuggestionItemsByQuery(items, 'h1').map((i) => i.title)).toEqual(['标题一']);
    expect(filterSuggestionItemsByQuery(items, 'quote').map((i) => i.title)).toEqual(['引用']);
    expect(filterSuggestionItemsByQuery(items, '不存在').length).toBe(0);
  });
});
