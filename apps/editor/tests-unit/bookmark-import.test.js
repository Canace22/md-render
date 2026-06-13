import { describe, expect, it } from 'vitest';
import { parseBookmarkHtml, parseUrlList } from '../renderer/src/utils/bookmarkImport.js';
import {
  createBookmarkNode,
  ensureKnowledgeFields,
  getFileKnowledgeSearchText,
} from '../renderer/src/store/workspaceUtils.js';

const CHROME_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
    <DL><p>
        <DT><A HREF="https://example.com/" ADD_DATE="1700000100">Example &amp; Co</A>
        <DT><H3>技术</H3>
        <DL><p>
            <DT><A HREF="https://react.dev/" ADD_DATE="1700000200" TAGS="frontend,framework">React</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="javascript:void(0)">坏链接</A>
    <DT><A HREF="https://example.com/">Example dup</A>
</DL><p>`;

describe('parseBookmarkHtml', () => {
  const items = parseBookmarkHtml(CHROME_HTML);

  it('extracts valid http(s) bookmarks only', () => {
    // javascript: 被忽略，example.com 去重后剩 1 条 → 共 2 条
    expect(items.map((i) => i.url)).toEqual(['https://example.com/', 'https://react.dev/']);
  });

  it('decodes HTML entities in the title', () => {
    expect(items[0].title).toBe('Example & Co');
  });

  it('uses the deepest enclosing folder name as a tag', () => {
    expect(items[0].tags).toEqual(['书签栏']);
    expect(items[1].tags).toContain('技术');
  });

  it('keeps the anchor TAGS attribute and merges folder tag', () => {
    expect(items[1].tags).toEqual(expect.arrayContaining(['frontend', 'framework', '技术']));
  });

  it('converts ADD_DATE seconds to millisecond createdAt', () => {
    expect(items[0].createdAt).toBe(1700000100 * 1000);
  });

  it('dedupes by url (first occurrence wins)', () => {
    const urls = items.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('returns [] for empty or non-bookmark input', () => {
    expect(parseBookmarkHtml('')).toEqual([]);
    expect(parseBookmarkHtml('<p>hello</p>')).toEqual([]);
  });
});

describe('parseUrlList', () => {
  it('parses one url per line, falling back to url as title', () => {
    const out = parseUrlList('https://a.com\nhttps://b.com');
    expect(out).toEqual([
      { title: 'https://a.com', url: 'https://a.com', tags: [] },
      { title: 'https://b.com', url: 'https://b.com', tags: [] },
    ]);
  });

  it('extracts a leading "标题 | url" title', () => {
    const out = parseUrlList('设计灵感 | https://dribbble.com');
    expect(out[0]).toEqual({ title: '设计灵感', url: 'https://dribbble.com', tags: [] });
  });

  it('strips list markers and ignores garbage / blank lines', () => {
    const out = parseUrlList('- https://x.com\n\n随便写的没有链接\n  ');
    expect(out).toEqual([{ title: 'https://x.com', url: 'https://x.com', tags: [] }]);
  });

  it('dedupes repeated urls', () => {
    const out = parseUrlList('https://x.com\nhttps://x.com');
    expect(out).toHaveLength(1);
  });
});

describe('createBookmarkNode', () => {
  it('builds a bookmark file node with url and bookmark nodeType', () => {
    const node = createBookmarkNode({ title: 'React', url: 'https://react.dev', tags: ['fe'] });
    expect(node.type).toBe('file');
    expect(node.nodeType).toBe('bookmark');
    expect(node.url).toBe('https://react.dev');
    expect(node.tags).toEqual(['fe']);
    expect(node.content).toBe('');
  });

  it('falls back to url then placeholder when title is missing', () => {
    expect(createBookmarkNode({ url: 'https://x.com' }).name).toBe('https://x.com');
    expect(createBookmarkNode({}).name).toBe('未命名书签');
  });

  it('survives ensureKnowledgeFields without losing bookmark type or url', () => {
    const node = createBookmarkNode({ title: 'X', url: 'https://x.com' });
    const normalized = ensureKnowledgeFields(node);
    expect(normalized.nodeType).toBe('bookmark');
    expect(normalized.url).toBe('https://x.com');
  });

  it('exposes url to knowledge search text', () => {
    const node = createBookmarkNode({ title: 'X', url: 'https://uniquehost.example' });
    expect(getFileKnowledgeSearchText(node)).toContain('uniquehost.example');
  });
});
