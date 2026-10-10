import { describe, expect, it } from 'vitest';
import { splitWikilinks, wikilinksToPathLinks } from '../renderer/src/utils/wikilinkText.js';

describe('splitWikilinks（思维导图显示双链）', () => {
  it('整行就是双链：只剩文档名', () => {
    expect(splitWikilinks('[[Chapter 03：三幕式]]')).toEqual([
      { type: 'link', name: 'Chapter 03：三幕式', label: 'Chapter 03：三幕式' },
    ]);
  });

  it('文字和双链混排，保留前后文字', () => {
    expect(splitWikilinks('先看 [[叙事研究]] 再说')).toEqual([
      { type: 'text', text: '先看 ' },
      { type: 'link', name: '叙事研究', label: '叙事研究' },
      { type: 'text', text: ' 再说' },
    ]);
  });

  it('别名形式显示别名，跳转用名称', () => {
    expect(splitWikilinks('[[剧本大纲|大纲]]')).toEqual([{ type: 'link', name: '剧本大纲', label: '大纲' }]);
  });

  it('没有双链 / 空文本', () => {
    expect(splitWikilinks('普通文字')).toEqual([{ type: 'text', text: '普通文字' }]);
    expect(splitWikilinks('')).toEqual([]);
  });
});

describe('wikilinksToPathLinks（复制给外部 AI）', () => {
  const paths = { 叙事研究: '/vault/笔记/叙事研究.md', 'Chapter 03：三幕式': '/vault/笔记/Chapter 03：三幕式.md' };
  const resolve = (name) => paths[name] ?? '';

  it('双链换成带绝对路径的链接，路径有空格也用 <> 包住', () => {
    expect(wikilinksToPathLinks('* [[Chapter 03：三幕式]]', resolve))
      .toBe('* [Chapter 03：三幕式](</vault/笔记/Chapter 03：三幕式.md>)');
  });

  it('别名作为链接文字', () => {
    expect(wikilinksToPathLinks('看 [[叙事研究|这篇]] 吧', resolve))
      .toBe('看 [这篇](</vault/笔记/叙事研究.md>) 吧');
  });

  it('找不到的文档保留原样双链', () => {
    expect(wikilinksToPathLinks('[[不存在]] 和 [[叙事研究]]', resolve))
      .toBe('[[不存在]] 和 [叙事研究](</vault/笔记/叙事研究.md>)');
  });
});
