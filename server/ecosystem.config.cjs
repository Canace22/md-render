/**
 * PM2 进程配置 —— 由 deploy.sh 调用
 *
 * 环境变量（可选）：
 *   NOTION_PROXY_PORT  默认 8787
 *   AI_PROXY_PORT      默认 8788
 *   CLOUD_SYNC_PORT    默认 8791
 *   CLOUD_SYNC_TOKEN   云同步鉴权 token（不设则任何人可读写，仅内网/自用时可留空）
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
    {
      name: 'cloud-sync',
      cwd: path.join(root, 'cloud-sync'),
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.CLOUD_SYNC_PORT || '8791',
        // 留空则不鉴权；生产环境建议设置
        CLOUD_SYNC_TOKEN: process.env.CLOUD_SYNC_TOKEN || '',
      },
    },
  ],
};
