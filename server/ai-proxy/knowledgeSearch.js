const dns = require('dns/promises');
const http = require('http');
const https = require('https');
const net = require('net');

const FETCH_TIMEOUT_MS = 10000;
const MAX_SOURCE_COUNT = 8;
const MAX_RESULT_COUNT = 5;
const MAX_LINK_COUNT = 500;
const MAX_FETCHED_LINKS = 6;
const MAX_RESPONSE_CHARS = 1500000;
const MAX_READ_CONTENT_CHARS = 20000;
const MAX_EXCERPT_CHARS = 1600;
const MAX_SNIPPET_CHARS = 360;
const MAX_REDIRECTS = 3;
const READ_CONTENT_TRUNCATED_SUFFIX = '\n…（正文过长已截断）';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

const decodeHtml = (value) => String(value ?? '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));

const collapseWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const stripHtml = (html) => collapseWhitespace(decodeHtml(
  String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' '),
));

const extractTitle = (html, fallback) => {
  const match = String(html ?? '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return collapseWhitespace(stripHtml(match?.[1])) || fallback;
};

const extractReadableHtml = (html) => {
  const source = String(html ?? '');
  const primary = source.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2]
    ?? source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?? source;
  return stripHtml(primary
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '));
};

const truncateReadContent = (content) => {
  const text = String(content ?? '').trim();
  if (text.length <= MAX_READ_CONTENT_CHARS) return text;
  const keepLength = MAX_READ_CONTENT_CHARS - READ_CONTENT_TRUNCATED_SUFFIX.length;
  return `${text.slice(0, keepLength)}${READ_CONTENT_TRUNCATED_SUFFIX}`;
};

const getQueryTerms = (query) => {
  const raw = collapseWhitespace(query).toLowerCase();
  if (!raw) return [];
  const split = raw.split(/[\s,，。！？!?；;：:/\\|]+/).filter((term) => term.length >= 2);
  return [...new Set([raw, ...split])].slice(0, 8);
};

const scoreText = (value, terms, weight = 1) => {
  const text = String(value ?? '').toLowerCase();
  return terms.reduce((score, term) => {
    if (!term || !text.includes(term)) return score;
    return score + (term.length * weight);
  }, 0);
};

const buildSnippet = (text, terms, maxLength = MAX_SNIPPET_CHARS) => {
  const source = collapseWhitespace(text);
  if (!source) return '';
  const lowered = source.toLowerCase();
  const hitIndexes = terms
    .map((term) => lowered.indexOf(term))
    .filter((index) => index >= 0);
  const hitIndex = hitIndexes.length ? Math.min(...hitIndexes) : 0;
  const start = Math.max(0, hitIndex - Math.floor(maxLength / 4));
  const end = Math.min(source.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
};

const isPrivateAddress = (address) => {
  if (!net.isIP(address)) return false;
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      return isPrivateAddress(normalized.slice('::ffff:'.length));
    }
    return normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb');
  }
  const [a, b] = address.split('.').map(Number);
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
};

const assertSafeUrl = async (value) => {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('知识库地址不是有效 URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('知识库地址只支持 http 或 https');
  }
  const hostname = url.hostname.toLowerCase();
  if (url.username || url.password || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    throw new Error('知识库地址不允许访问本机或携带账号信息');
  }
  if (isPrivateAddress(hostname)) {
    throw new Error('知识库地址不允许访问内网地址');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('知识库地址解析到了不可访问的网络');
  }
  return { url, ...addresses[0] };
};

const requestText = ({ url, address, family }) => new Promise((resolve, reject) => {
  const client = url.protocol === 'https:' ? https : http;
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    callback(value);
  };
  const request = client.request(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,text/plain,text/markdown,application/json;q=0.8',
      'User-Agent': 'md-render-knowledge/1.0',
    },
    // 用安全校验过的 IP 建立连接，避免二次 DNS 解析导致 rebinding。
    lookup: (_hostname, options, callback) => {
      if (options?.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    },
  }, (response) => {
    const chunks = [];
    let size = 0;
    response.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_CHARS * 4) {
        response.destroy(new Error('知识库页面过大，暂不支持读取'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => finish(resolve, {
      status: response.statusCode ?? 0,
      headers: response.headers,
      body: Buffer.concat(chunks).toString('utf-8'),
    }));
    response.on('error', (error) => finish(reject, error));
  });
  request.setTimeout(FETCH_TIMEOUT_MS, () => request.destroy(new Error('知识库请求超时')));
  request.on('error', (error) => finish(reject, error));
  request.end();
});

const fetchText = async (value, redirectCount = 0) => {
  const safeTarget = await assertSafeUrl(value);
  const { url } = safeTarget;
  const response = await requestText(safeTarget);
  const location = response.headers.location;
  if (response.status >= 300 && response.status < 400 && location) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error('知识库地址重定向次数过多');
    return fetchText(new URL(location, url), redirectCount + 1);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`知识库页面返回 ${response.status}`);
  }
  const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
  if (contentType && !/(text\/|html|json|markdown)/.test(contentType)) {
    throw new Error(`知识库页面类型不支持：${contentType.split(';')[0]}`);
  }
  if (response.body.length > MAX_RESPONSE_CHARS) throw new Error('知识库页面过大，暂不支持读取');
  return { url: url.toString(), contentType, body: response.body };
};

const extractLinks = (html, baseUrl) => {
  const base = new URL(baseUrl);
  const scopePath = base.pathname.endsWith('/')
    ? base.pathname
    : base.pathname.replace(/[^/]*$/, '');
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html ?? ''))) && links.length < MAX_LINK_COUNT) {
    try {
      const url = new URL(decodeHtml(match[1]), base);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (url.origin !== base.origin || !url.pathname.startsWith(scopePath)) continue;
      url.hash = '';
      if (seen.has(url.toString())) continue;
      const title = collapseWhitespace(stripHtml(match[2]));
      if (!title || /\.(?:css|js|png|jpe?g|gif|svg|webp|ico|xml|zip|pdf)$/i.test(url.pathname)) continue;
      seen.add(url.toString());
      links.push({ title, url: url.toString() });
    } catch {
      /* 忽略坏链接 */
    }
  }
  return links;
};

const normalizeSource = (source, index) => {
  const url = String(source?.url ?? '').trim();
  if (!url) return null;
  return {
    id: String(source?.id ?? `source-${index + 1}`),
    name: collapseWhitespace(source?.name) || `外挂知识库 ${index + 1}`,
    url,
  };
};

const buildResult = ({ source, title, url, text, terms, score }) => ({
  sourceId: source.id,
  sourceName: source.name,
  title: collapseWhitespace(title) || source.name,
  url,
  snippet: buildSnippet(text, terms),
  excerpt: buildSnippet(text, terms, MAX_EXCERPT_CHARS),
  score,
});

const searchSource = async (source, terms) => {
  const root = await fetchText(source.url);
  const rootText = stripHtml(root.body);
  const rootTitle = extractTitle(root.body, source.name);
  const rootScore = scoreText(rootTitle, terms, 8) + scoreText(rootText, terms, 1);

  if (!root.contentType.includes('html')) {
    return rootScore > 0
      ? [buildResult({ source, title: rootTitle, url: root.url, text: rootText, terms, score: rootScore })]
      : [];
  }

  const rankedLinks = extractLinks(root.body, root.url)
    .map((link) => ({
      ...link,
      score: scoreText(link.title, terms, 10) + scoreText(link.url, terms, 3),
    }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FETCHED_LINKS);

  const linkedResults = await Promise.all(rankedLinks.map(async (link) => {
    try {
      const page = await fetchText(link.url);
      const text = page.contentType.includes('html') ? stripHtml(page.body) : collapseWhitespace(page.body);
      const title = page.contentType.includes('html') ? extractTitle(page.body, link.title) : link.title;
      const score = link.score + scoreText(title, terms, 8) + scoreText(text, terms, 1);
      return buildResult({ source, title, url: page.url, text, terms, score });
    } catch {
      return buildResult({ source, title: link.title, url: link.url, text: link.title, terms, score: link.score });
    }
  }));

  if (rootScore > 0) {
    linkedResults.push(buildResult({
      source,
      title: rootTitle,
      url: root.url,
      text: rootText,
      terms,
      score: rootScore,
    }));
  }
  return linkedResults;
};

async function searchKnowledgeSources({ query, sources } = {}) {
  const terms = getQueryTerms(query);
  if (!terms.length) return { ok: false, error: '搜索关键词为空', results: [] };

  const safeSources = (Array.isArray(sources) ? sources : [])
    .slice(0, MAX_SOURCE_COUNT)
    .map(normalizeSource)
    .filter(Boolean);
  if (!safeSources.length) return { ok: false, error: '没有可用的外挂知识库', results: [] };

  const settled = await Promise.all(safeSources.map(async (source) => {
    try {
      return { source, results: await searchSource(source, terms) };
    } catch (error) {
      return { source, error: error?.name === 'AbortError' ? '请求超时' : error.message, results: [] };
    }
  }));

  const results = settled
    .flatMap((item) => item.results)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULT_COUNT)
    .map(({ score: _score, ...result }) => result);
  const errors = settled
    .filter((item) => item.error)
    .map((item) => ({ sourceId: item.source.id, sourceName: item.source.name, error: item.error }));

  return { ok: true, results, errors };
}

async function readPublicUrl({ url } = {}, fetchPage = fetchText) {
  const cleanUrl = String(url ?? '').trim();
  if (!cleanUrl) throw new Error('网页地址为空');

  const page = await fetchPage(cleanUrl);
  const looksLikeHtml = page.contentType.includes('html')
    || /<!doctype\s+html|<html\b/i.test(page.body);
  const content = truncateReadContent(
    looksLikeHtml ? extractReadableHtml(page.body) : page.body,
  );
  if (!content) throw new Error('网页正文为空');

  const fallbackTitle = new URL(page.url).hostname;
  return {
    ok: true,
    title: looksLikeHtml ? extractTitle(page.body, fallbackTitle) : fallbackTitle,
    url: page.url,
    content,
  };
}

module.exports = { readPublicUrl, searchKnowledgeSources };
