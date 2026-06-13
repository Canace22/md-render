/**
 * Notion API 封装
 *
 * 请求需经一个代理转发到 https://api.notion.com，以解决浏览器直连的 CORS 问题。
 * 代理基地址按以下优先级确定（见 resolveProxyBase）：
 *   1. 构建时注入的 VITE_NOTION_PROXY（指向你服务器上的转发服务，生产可用）
 *   2. 回退到 /notion-api/v1（仅 pnpm dev 下的 Vite 代理可用）
 */

// 末尾去掉多余斜杠，统一成 .../v1 形式
const resolveProxyBase = () => {
  const configured = import.meta.env?.VITE_NOTION_PROXY?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return '/notion-api/v1';
};

const NOTION_PROXY_BASE = resolveProxyBase();
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
 * 更新页面的属性列（properties）。仅在传入非空 properties 时发起请求。
 */
async function patchPageProperties(pageId, properties, token) {
  if (!properties || Object.keys(properties).length === 0) return;
  const res = await fetch(`${NOTION_PROXY_BASE}/pages/${pageId}`, {
    method: 'PATCH',
    headers: makeHeaders(token),
    body: JSON.stringify({ properties }),
  });
  await handleResponse(res);
}

/**
 * 将 Notion 页面内容整体替换为新的块列表
 * 步骤：（可选）更新属性 → 删除所有现有顶层块 → 分批追加新块（每批最多 100 个）
 *
 * @param {object} [options]
 * @param {object} [options.properties] 要写入的页面属性（已按目标 schema 过滤）
 */
export async function updatePageBlocks(pageId, notionBlocks, token, { properties } = {}) {
  const id = cleanPageId(pageId);
  if (!id) throw new Error('无效的页面 ID');

  // 0. 先更新属性（若有）
  await patchPageProperties(id, properties, token);

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
 * 查询数据库中的所有页面（处理分页）
 * 返回页面对象数组，每个包含 id、properties 等
 */
export async function queryDatabase(databaseId, token) {
  const id = cleanPageId(databaseId);
  if (!id) throw new Error('无效的数据库 ID');

  const pages = [];
  let startCursor = undefined;

  do {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const res = await fetch(`${NOTION_PROXY_BASE}/databases/${id}/query`, {
      method: 'POST',
      headers: makeHeaders(token),
      body: JSON.stringify(body),
    });
    const data = await handleResponse(res);
    pages.push(...(data.results ?? []));
    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor);

  return pages;
}

/**
 * 获取数据库 schema：标题属性名 + 每个属性的类型。
 * @returns {{ titlePropName: string, propertyTypes: Record<string, string> }}
 */
export async function fetchDatabaseSchema(databaseId, token) {
  const id = cleanPageId(databaseId);
  if (!id) throw new Error('无效的数据库 ID');

  const dbRes = await fetch(`${NOTION_PROXY_BASE}/databases/${id}`, {
    headers: makeHeaders(token),
  });
  const dbInfo = await handleResponse(dbRes);

  let titlePropName = '';
  const propertyTypes = {};
  for (const [name, prop] of Object.entries(dbInfo.properties ?? {})) {
    propertyTypes[name] = prop.type;
    if (prop.type === 'title') titlePropName = name;
  }

  if (!titlePropName) throw new Error('数据库缺少标题属性');
  return { titlePropName, propertyTypes };
}

/**
 * 确保数据库里存在一个指定名字的 Select 属性；不存在就给数据库加上。
 * 已存在同名属性时不动它（无论类型），避免覆盖用户已有列。
 *
 * @param {string} databaseId
 * @param {string} propName - 属性名，如「目录」
 * @param {string} token
 * @param {string} [existingType] - 若已知该属性当前类型，可传入以跳过网络判断
 * @returns {Promise<boolean>} 是否真的新建了属性
 */
export async function ensureDatabaseSelectProperty(databaseId, propName, token, existingType) {
  const id = cleanPageId(databaseId);
  if (!id) throw new Error('无效的数据库 ID');

  // 已存在同名属性 → 直接返回，不改动
  if (existingType !== undefined) {
    if (existingType) return false;
  } else {
    const { propertyTypes } = await fetchDatabaseSchema(id, token);
    if (propertyTypes[propName]) return false;
  }

  const res = await fetch(`${NOTION_PROXY_BASE}/databases/${id}`, {
    method: 'PATCH',
    headers: makeHeaders(token),
    body: JSON.stringify({
      properties: { [propName]: { select: {} } },
    }),
  });
  await handleResponse(res);
  return true;
}

/**
 * 获取数据库标题属性名。不同 Notion 数据库可能不叫 Name。
 * （保留旧接口，内部走 fetchDatabaseSchema）
 */
export async function fetchDatabaseTitlePropertyName(databaseId, token) {
  const { titlePropName } = await fetchDatabaseSchema(databaseId, token);
  return titlePropName;
}

/**
 * 过滤属性：只保留目标数据库中“存在且类型匹配”的属性，避免 Notion 整请求报错。
 * @param {object} properties 候选属性（如 { Tags: {multi_select}, Author: {rich_text} }）
 * @param {Record<string,string>} propertyTypes 数据库现有属性 → 类型
 */
export function filterPropertiesToSchema(properties = {}, propertyTypes = {}) {
  const out = {};
  for (const [name, value] of Object.entries(properties)) {
    const wantType = Object.keys(value)[0]; // 属性体里唯一的 key 即其类型
    if (propertyTypes[name] === wantType) out[name] = value;
  }
  return out;
}

/**
 * 在数据库中创建新页面
 * @param {string} databaseId - 数据库 ID
 * @param {string} title - 页面标题
 * @param {Array} children - Notion blocks 数组（最多 100 个）
 * @param {string} token
 * @param {string} titlePropName - 数据库标题属性名
 * @param {object} [properties] - 额外属性（已按目标 schema 过滤），与标题列合并
 */
export async function createDatabasePage(databaseId, title, children, token, titlePropName, properties = {}) {
  const id = cleanPageId(databaseId);
  if (!id) throw new Error('无效的数据库 ID');
  const resolvedTitlePropName = titlePropName || (await fetchDatabaseTitlePropertyName(id, token));

  const CHUNK_SIZE = 100;
  const firstChunk = children.slice(0, CHUNK_SIZE);

  const res = await fetch(`${NOTION_PROXY_BASE}/pages`, {
    method: 'POST',
    headers: makeHeaders(token),
    body: JSON.stringify({
      parent: { database_id: id },
      properties: {
        ...properties,
        [resolvedTitlePropName]: {
          title: [{ type: 'text', text: { content: title } }],
        },
      },
      children: firstChunk,
    }),
  });
  const page = await handleResponse(res);
  await appendBlocksInChunks(page.id, children.slice(CHUNK_SIZE), token);
  return page;
}

/**
 * 把超过首批 100 个的块按 100/批追加到指定页面/块下。
 */
async function appendBlocksInChunks(parentId, blocks, token, chunkSize = 100) {
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    const res = await fetch(`${NOTION_PROXY_BASE}/blocks/${parentId}/children`, {
      method: 'PATCH',
      headers: makeHeaders(token),
      body: JSON.stringify({ children: chunk }),
    });
    await handleResponse(res);
  }
}

/**
 * 在某个父页面下创建子页面（parent 用 page_id，区别于数据库的 database_id）。
 * 用于把本地文件夹/文件层级原样推成 Notion 子页面树。
 *
 * @param {string} parentPageId - 父页面 ID
 * @param {string} title - 子页面标题
 * @param {Array} children - Notion blocks 数组（自动分批，>100 也安全）
 * @param {string} token
 * @returns {object} 新建的页面对象（含 id）
 */
export async function createChildPage(parentPageId, title, children, token) {
  const parent = cleanPageId(parentPageId);
  if (!parent) throw new Error('无效的父页面 ID');

  const CHUNK_SIZE = 100;
  const res = await fetch(`${NOTION_PROXY_BASE}/pages`, {
    method: 'POST',
    headers: makeHeaders(token),
    body: JSON.stringify({
      parent: { page_id: parent },
      properties: {
        title: { title: [{ type: 'text', text: { content: title } }] },
      },
      children: children.slice(0, CHUNK_SIZE),
    }),
  });
  const page = await handleResponse(res);
  await appendBlocksInChunks(page.id, children.slice(CHUNK_SIZE), token);
  return page;
}

/**
 * 获取页面的子页面列表（通过 block children 中的 child_page 类型）
 */
export async function fetchChildPages(pageId, token) {
  const blocks = await fetchBlocks(pageId, token);
  return blocks
    .filter((b) => b.type === 'child_page')
    .map((b) => ({ id: b.id, title: b.child_page?.title ?? '无标题' }));
}

/**
 * 判断 Notion 同步当前是否可用。
 * - 配了 VITE_NOTION_PROXY（指向服务器转发服务）→ 任何环境都可用，含打包后的 Electron app
 * - 没配 → 回退到只在本机 dev（localhost，走 Vite 代理）可用
 */
export function isNotionAvailable() {
  if (import.meta.env?.VITE_NOTION_PROXY?.trim()) return true;
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
