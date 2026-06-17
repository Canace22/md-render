/**
 * PM2 进程配置 —— 由 deploy.sh 调用
 *
 * 环境变量（可选）：
 *   NOTION_PROXY_PORT  默认 8787
 *   AI_PROXY_PORT      默认 8788
 */
const path = require('path');

const root = __dirname;
const aiProxyVenvBin = path.join(root, 'ai-proxy', '.venv', 'bin');

module.exports = {
  apps: [
    {
      name: 'notion-proxy',
      cwd: path.join(root, 'notion-proxy'),
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.NOTION_PROXY_PORT || '8787',
      },
    },
    {
      name: 'ai-proxy',
      cwd: path.join(root, 'ai-proxy'),
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.AI_PROXY_PORT || '8788',
        // 让 tools/ 里的 python3 命令走 venv，能用到 pdf2docx 等依赖
        PATH: `${aiProxyVenvBin}:${process.env.PATH || ''}`,
      },
    },
  ],
};
