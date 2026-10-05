import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readUrl } from '../renderer/src/services/urlReaderService.js';
import { executeTool, TOOL_DEFINITIONS } from '../renderer/src/core/agent/toolRegistry.js';

const require = createRequire(import.meta.url);
const { readPublicUrl } = require('../../../server/ai-proxy/knowledgeSearch.js');

const PUBLIC_URL = 'https://93.184.216.34/article';

const makePage = ({
  body = '',
  contentType = 'text/html; charset=utf-8',
} = {}) => ({
  url: PUBLIC_URL,
  contentType,
  body,
});

const toolCall = (url) => ({
  id: 'read-url',
  function: { name: 'read_url', arguments: JSON.stringify({ url }) },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ai-proxy 公开网页读取', () => {
  it('提取标题和主要正文，去掉导航与脚本', async () => {
    const fetchPage = vi.fn(async () => makePage({
      body: `
        <html><head><title>测试 &amp; 标题</title></head><body>
          <nav>导航噪音</nav>
          <article><h1>正文标题</h1><p>正文细节</p><script>秘密脚本</script></article>
        </body></html>
      `,
    }));

    await expect(readPublicUrl({ url: PUBLIC_URL }, fetchPage)).resolves.toEqual({
      ok: true,
      title: '测试 & 标题',
      url: PUBLIC_URL,
      content: '正文标题 正文细节',
    });
  });

  it('超长纯文本正文会被截断', async () => {
    const fetchPage = vi.fn(async () => makePage({
      body: 'x'.repeat(25000),
      contentType: 'text/plain',
    }));

    const result = await readPublicUrl({ url: PUBLIC_URL }, fetchPage);
    expect(result.content.length).toBe(20000);
    expect(result.content).toMatch(/正文过长已截断）$/);
  });

  it('拒绝内网地址', async () => {
    await expect(readPublicUrl({ url: 'http://127.0.0.1/private' })).rejects.toThrow('内网地址');
  });

  it('拒绝非文本资源', async () => {
    const fetchPage = vi.fn(async () => makePage({ contentType: 'image/png' }));
    await expect(readPublicUrl({ url: PUBLIC_URL }, fetchPage)).rejects.toThrow('页面类型不支持');
  });
});

describe('renderer URL reader service', () => {
  it('Web 环境直接请求 ai-proxy', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, title: '标题', url: PUBLIC_URL, content: '正文' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(readUrl({ url: PUBLIC_URL, aiProxyBase: 'https://proxy.example/' }))
      .resolves.toMatchObject({ ok: true, content: '正文' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example/api/url/read',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: PUBLIC_URL }),
      }),
    );
  });

  it('Electron 环境只走 preload IPC', async () => {
    const readUrlBridge = vi.fn(async () => ({
      ok: true,
      title: '标题',
      url: PUBLIC_URL,
      content: '正文',
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('window', { electronAPI: { ai: { readUrl: readUrlBridge } } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(readUrl({ url: `  ${PUBLIC_URL}  `, aiProxyBase: 'https://proxy.example/' }))
      .resolves.toMatchObject({ ok: true, title: '标题' });
    expect(readUrlBridge).toHaveBeenCalledWith({
      url: PUBLIC_URL,
      aiProxyBase: 'https://proxy.example',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('read_url agent 工具', () => {
  it('定义为本地工具，执行时只调用 host.readUrl', async () => {
    expect(TOOL_DEFINITIONS.some((item) => item.function.name === 'read_url')).toBe(true);
    const host = {
      readUrl: vi.fn(async () => ({
        ok: true,
        title: '标题',
        url: PUBLIC_URL,
        content: '正文',
      })),
    };

    const result = JSON.parse(await executeTool(toolCall(PUBLIC_URL), host));
    expect(host.readUrl).toHaveBeenCalledWith({ url: PUBLIC_URL });
    expect(result).toMatchObject({ title: '标题', url: PUBLIC_URL, content: '正文' });
    expect(result.securityNotice).toMatch(/不可信/);
  });

  it('空 URL 和宿主失败都返回可解释文案', async () => {
    const host = { readUrl: vi.fn(async () => ({ ok: false, error: '404' })) };
    await expect(executeTool(toolCall(''), host)).resolves.toMatch(/URL 为空/);
    await expect(executeTool(toolCall(PUBLIC_URL), host)).resolves.toBe('网页读取失败：404。');
  });
});
