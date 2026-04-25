/**
 * Notion API 封装
 *
 * 所有请求通过 Vite 开发服务器的 /notion-api 代理转发到 https://api.notion.com，
 * 以解决浏览器直接访问 Notion API 时的 CORS 问题。
 * 注意：此功能仅在本地开发模式（npm run dev）下可用。
 */

const NOTION_PROXY_BASE = '/notion-api/v1';
const NOTION_VERSION = '2022-06-28';

function makeHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function handleResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message || body?.code || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

/**
 * 从 Notion 页面 URL 或原始 ID 中提取干净的 UUID（无连字符）
 */
export function cleanPageId(input) {
  if (!input?.trim()) return '';
  const trimmed = input.trim();
  // 匹配 32 位十六进制（无连字符）
  const plain = trimmed.match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/i);
  if (plain) return plain[1];
  // 匹配标准 UUID 格式
  const dashed = trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (dashed) return dashed[1].replace(/-/g, '');
  return trimmed.replace(/-/g, '');
}

/**
 * 从 Notion 页面对象中提取标题
 */
export function extractPageTitle(page) {
  if (!page) return '无标题';
  // 数据库条目：properties 中找 title 类型的属性
  if (page.properties) {
    for (const prop of Object.values(page.properties)) {
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map((rt) => rt.plain_text).join('');
      }
    }
  }
  return '无标题';
}

/**
 * 获取页面元数据（标题、图标等）
 */
export async function fetchPage(pageId, token) {
  const id = cleanPageId(pageId);
  if (!id) throw new Error('无效的页面 ID');
  const res = await fetch(`${NOTION_PROXY_BASE}/pages/${id}`, {
    headers: makeHeaders(token),
  });
  return handleResponse(res);
}

/**
 * 递归获取块的所有子内容（处理分页）
 */
export async function fetchBlocks(blockId, token) {
  const blocks = [];
  let startCursor = undefined;

  do {
    const qs = startCursor ? `?page_size=100&start_cursor=${startCursor}` : '?page_size=100';
    const res = await fetch(`${NOTION_PROXY_BASE}/blocks/${blockId}/children${qs}`, {
      headers: makeHeaders(token),
    });
    const data = await handleResponse(res);
    blocks.push(...(data.results ?? []));
    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor);

  // 递归加载有子块的块
  for (const block of blocks) {
    if (block.has_children) {
      block._children = await fetchBlocks(block.id, token);
    }
  }

  return blocks;
}

/**
 * 将 Notion 页面内容整体替换为新的块列表
 * 步骤：删除所有现有顶层块 → 分批追加新块（每批最多 100 个）
 */
export async function updatePageBlocks(pageId, notionBlocks, token) {
  const id = cleanPageId(pageId);
  if (!id) throw new Error('无效的页面 ID');

  // 1. 获取并删除现有顶层块
  const existing = await fetchBlocks(id, token);
  for (const block of existing) {
    await fetch(`${NOTION_PROXY_BASE}/blocks/${block.id}`, {
      method: 'DELETE',
      headers: makeHeaders(token),
    });
  }

  // 2. 按 100 个一批追加新块
  const CHUNK_SIZE = 100;
  for (let i = 0; i < notionBlocks.length; i += CHUNK_SIZE) {
    const chunk = notionBlocks.slice(i, i + CHUNK_SIZE);
    const res = await fetch(`${NOTION_PROXY_BASE}/blocks/${id}/children`, {
      method: 'PATCH',
      headers: makeHeaders(token),
      body: JSON.stringify({ children: chunk }),
    });
    await handleResponse(res);
  }
}

/**
 * 判断当前是否处于本地开发模式（Notion 代理仅在 localhost 可用）
 */
export function isLocalDevMode() {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
