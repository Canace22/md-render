# server/ — 后端代理服务

本目录包含 md-render 配套的后端服务，解决浏览器/Web 端的 CORS 限制，并在服务端托管 AI Key 与本地工具。

| 目录 | 端口 | 说明 |
|------|------|------|
| `notion-proxy/` | 8787 | Notion API 透明转发 |
| `ai-proxy/` | 8788 | AI 代理（Provider 模式 + 透明 /v1 模式 + Python 工具） |

## 一键部署（推荐）

在服务器上 clone 或同步代码后：

```bash
cd /path/to/md-render/server
bash deploy.sh
```

脚本会：

1. 扫描所有含 `server.js` 的子目录并注册为服务
2. 用 **PM2** 启动/更新 `notion-proxy`、`ai-proxy`
3. 创建 `ai-proxy/.venv` 并安装 pdf-to-docx 等 Python 依赖
4. 尝试放行 firewalld / ufw 端口
5. curl 自检两个服务

### 常用选项

```bash
# 自定义端口
NOTION_PROXY_PORT=9000 AI_PROXY_PORT=9001 bash deploy.sh

# 首次部署时顺带装系统依赖（需 root）
sudo bash deploy.sh --install-deps

# 跳过防火墙 / Python 依赖
bash deploy.sh --skip-firewall --skip-python
```

### 部署后配置

1. 编辑 `ai-proxy/.env`，填入 `XIAOMI_API_KEY`、`MINIMAX_API_KEY` 等
2. `pm2 restart ai-proxy`
3. 在开发机 `apps/editor/.env` 填入：

```env
VITE_NOTION_PROXY=http://你的服务器IP:8787/v1
AI_PROXY_BASE=http://你的服务器IP:8788
```

4. 云服务器控制台安全组放行 **8787、8788**

### 开机自启

```bash
pm2 startup    # 按输出提示执行一条 sudo 命令
pm2 save
```

## 单独部署

- Notion 仅用 Nginx、不跑 Node：见 [`notion-proxy/DEPLOY-centos-nginx.md`](notion-proxy/DEPLOY-centos-nginx.md)
- 各服务手动启动：见各子目录 `README.md`

## 新增服务

在 `server/<name>/` 下添加 `server.js`，并在 `ecosystem.config.cjs` 里增加对应 app 配置（端口、环境变量），重新执行 `bash deploy.sh` 即可。
