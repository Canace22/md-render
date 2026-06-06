/**
 * 浏览器书签导入解析（纯函数，无副作用，不依赖 DOM）。
 *
 * - parseBookmarkHtml: 解析浏览器导出的 Netscape 书签 HTML（Chrome/Edge/Safari/Firefox 通用），
 *   用正则状态机维护文件夹栈，把书签所在的文件夹名转成标签。
 * - parseUrlList: 解析手动粘贴的多行 URL（每行一个，可带标题）。
 *
 * 两者都返回归一化的 { title, url, tags, createdAt? } 列表，并按 url 去重（保留首次出现）。
 */

const HTTP_URL_RE = /^https?:\/\//i;

const decodeEntities = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/gi, '&'); // 必须最后做，避免二次解码
};

const stripTags = (html) => decodeEntities(String(html ?? '').replace(/<[^>]*>/g, '')).trim();

const getAttr = (attrs, name) => {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
  const match = re.exec(attrs ?? '');
  return match ? match[1] : '';
};

const dedupeByUrl = (items) => {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    result.push(item);
  }
  return result;
};

const splitTags = (raw) =>
  String(raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * 解析浏览器导出的书签 HTML。
 * 用单条带分支的正则按出现顺序扫描 <DL>/<H3>/<A> 标记，维护文件夹栈，
 * 取书签最近的命名祖先文件夹作为标签。
 */
export function parseBookmarkHtml(html) {
  const source = String(html ?? '');
  if (!source) return [];

  // 一次匹配以下任意一种标记，保证按文档顺序处理：
  // <h3>名称</h3> / <dl> / </dl> / <a 属性>标题</a>
  const TOKEN_RE = /<h3\b([^>]*)>([\s\S]*?)<\/h3>|<dl\b[^>]*>|<\/dl>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  const folderStack = [];
  let pendingFolder = null;
  const items = [];

  let match;
  while ((match = TOKEN_RE.exec(source)) !== null) {
    const [token, , h3Inner, anchorAttrs, anchorInner] = match;
    const head = token.slice(0, 3).toLowerCase();

    if (head === '<h3') {
      pendingFolder = stripTags(h3Inner) || null;
    } else if (head === '<dl') {
      // 进入一层列表：紧邻的 <h3> 命名了这一层
      folderStack.push(pendingFolder);
      pendingFolder = null;
    } else if (head === '</d') {
      folderStack.pop();
    } else {
      // <a> 书签
      const url = getAttr(anchorAttrs, 'href').trim();
      if (!url || !HTTP_URL_RE.test(url)) continue;
      const title = stripTags(anchorInner) || url;
      const tags = splitTags(getAttr(anchorAttrs, 'tags'));
      const deepestFolder = [...folderStack].reverse().find(Boolean);
      if (deepestFolder) tags.push(deepestFolder);
      const addDateSec = parseInt(getAttr(anchorAttrs, 'add_date'), 10);
      const createdAt = Number.isFinite(addDateSec) && addDateSec > 0
        ? addDateSec * 1000
        : undefined;
      items.push({
        title,
        url,
        tags: [...new Set(tags)],
        ...(createdAt ? { createdAt } : {}),
      });
    }
  }

  return dedupeByUrl(items);
}

/**
 * 解析手动粘贴的多行 URL。每行一个 URL，支持 "标题 | url"、"url 标题"、"- url" 等形式：
 * 提取行内第一个 http(s) URL，剩余文字作为标题。
 */
export function parseUrlList(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const items = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const urlMatch = line.match(/https?:\/\/[^\s|]+/i);
    if (!urlMatch) continue;
    const url = urlMatch[0];
    const title = line
      .replace(url, '')
      .replace(/^[\s|>*\-–—]+|[\s|]+$/g, '')
      .trim();
    items.push({ title: title || url, url, tags: [] });
  }
  return dedupeByUrl(items);
}
