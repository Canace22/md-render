import { describe, expect, it } from 'vitest';
import {
  blocksToMarkdown,
  imageUrlFromMarkdown,
  imageUrlToMarkdown,
  markdownToBlocks,
  parseInline,
} from '../shared/daily/dailyMarkdown.js';
import { isDailyBlocksEmpty, createDailyTemplate } from '../shared/daily/dailyBlocks.js';

const roundTrip = (md) => blocksToMarkdown(markdownToBlocks(md));

describe('大纲 Markdown ↔ 块', () => {
  it('标题、嵌套列表、勾选、编号、段落往返一致', () => {
    const md = '## 今日任务\n\n- [ ] 任务\n  - [x] 子任务\n    - 孙级\n1. 第一\n\n普通段落';
    expect(roundTrip(md)).toBe(md);
  });

  it('行内样式：粗体、斜体、删除线、代码、链接', () => {
    expect(parseInline('a **b** *c* ~~d~~ `e` [f](https://x.com)').map((n) => n.type === 'link' ? `link:${n.href}` : Object.keys(n.styles).join('|') || 'plain'))
      .toEqual(['plain', 'bold', 'plain', 'italic', 'plain', 'strike', 'plain', 'code', 'plain', 'link:https://x.com']);
    const md = '- a **b** *c* ~~d~~ `e` [f](https://x.com)';
    expect(roundTrip(md)).toBe(md);
  });

  it('图片：local-media ↔ 本地绝对路径（带空格用尖括号）', () => {
    const url = imageUrlFromMarkdown('/Users/c a/MdRender/assets/截图.png');
    expect(url).toBe('local-media:///Users/c%20a/MdRender/assets/%E6%88%AA%E5%9B%BE.png');
    expect(imageUrlToMarkdown(url)).toBe('/Users/c a/MdRender/assets/截图.png');
    const md = '- 预研\n  ![图](</Users/c a/x.png>)';
    expect(roundTrip(md)).toBe(md);
    expect(markdownToBlocks(md)[0].children[0].type).toBe('image');
  });

  it('外链图片原样保留；tab 缩进也能识别层级', () => {
    const blocks = markdownToBlocks('- 父\n\t- 子\n![](https://a.com/x.png)');
    expect(blocks[0].children[0].content[0].text).toBe('子');
    expect(blocks[1].props.url).toBe('https://a.com/x.png');
  });

  it('空字符串 / 只有空行 → 空数组；模板算空', () => {
    expect(markdownToBlocks('')).toEqual([]);
    expect(markdownToBlocks('\n\n  \n')).toEqual([]);
    expect(isDailyBlocksEmpty(createDailyTemplate())).toBe(true);
  });
});
