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
