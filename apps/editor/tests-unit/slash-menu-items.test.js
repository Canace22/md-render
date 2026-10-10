import { describe, expect, it } from 'vitest';
import { pickCommonBlockItems } from '../renderer/src/utils/slashMenuItems.js';

const item = (key) => ({ key, title: key, group: 'x' });

describe('pickCommonBlockItems', () => {
  it('常用块按约定顺序排前，不常用的被移除', () => {
    const defaults = ['heading', 'heading_2', 'heading_4', 'toggle_list', 'emoji', 'quote', 'video', 'bullet_list']
      .map(item);
    const picked = pickCommonBlockItems(defaults);
    expect(picked.map((i) => i.key)).toEqual(['heading_2', 'bullet_list', 'quote', 'heading']);
    expect(picked.map((i) => i.group)).toEqual(['常用', '常用', '常用', '更多']);
  });
});
