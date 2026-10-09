/** 生成 Claude Desktop / Cursor 用的 MCP 配置片段（纯函数） */
export const MCP_SERVER_NAME = 'md-render';
export const MCP_ENTRY_PLACEHOLDER = '<md-render 仓库路径>/server/mcp-bridge/index.js';

export const buildMcpConfig = ({ mcpBridgeEntry = '' } = {}) => JSON.stringify({
  mcpServers: {
    [MCP_SERVER_NAME]: {
      command: 'node',
      args: [mcpBridgeEntry || MCP_ENTRY_PLACEHOLDER],
    },
  },
}, null, 2);

/** HTTP MCP 的 JSON 配置（Cursor / Cherry Studio 等），mcpHttp = { url, token } */
export const buildHttpMcpConfig = ({ url, token }) => JSON.stringify({
  mcpServers: {
    [MCP_SERVER_NAME]: {
      type: 'http',
      url,
      headers: { Authorization: `Bearer ${token}` },
    },
  },
}, null, 2);

/**
 * Claude Desktop 用的配置：它的「自定义连接器」只认公网 https，本机服务要写进 claude_desktop_config.json。
 * 有仓库里的 stdio 脚本（开发环境）就用脚本；否则用 mcp-remote 把 stdio 转成本机 HTTP MCP。
 * token 放 env 里，避免 Windows 下参数带空格被拆开。
 */
export const buildClaudeDesktopConfig = ({ mcpBridgeEntry = '', mcpHttp = null } = {}) => {
  if (mcpBridgeEntry || !mcpHttp) return buildMcpConfig({ mcpBridgeEntry });
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpHttp.url, '--header', 'Authorization:${AUTH_HEADER}'],
        env: { AUTH_HEADER: `Bearer ${mcpHttp.token}` },
      },
    },
  }, null, 2);
};

/** Claude Code 一行命令 */
export const buildClaudeCodeCommand = ({ url, token }) =>
  `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`;
