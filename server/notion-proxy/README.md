# Notion API 转发服务

解决前端（Electron/浏览器）无法直连 Notion API 的 CORS 限制。
部署在你自己的服务器上，前端把 Notion 请求发到这里，由本服务转发给 `api.notion.com`。

```
前端(带 token) → 本转发服务 → api.notion.com → 补 CORS 头回传 → 前端
```

token 由前端携带，本服务**纯透传，不读取、不存储、不打印**。

## 方式一：Node 直接跑（推荐，零依赖）

需要 Node 18+。

```bash
# 默认监听 8787
node server.js

# 自定义端口
PORT=9000 node server.js
```

后台常驻可用 pm2 / systemd / nohup，例如：

```bash
nohup node server.js > notion-proxy.log 2>&1 &
```

启动后访问基地址为：`http://你的服务器IP:8787/v1`

## 方式二：已有 Nginx，用反向代理（不跑额外进程）

在 Nginx server 块里加一段（把 Notion 请求转走并补 CORS 头）：

```nginx
location /notion-proxy/v1/ {
    # 预检请求直接返回
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET,POST,PATCH,DELETE,OPTIONS";
        add_header Access-Control-Allow-Headers "Authorization,Notion-Version,Content-Type";
        add_header Access-Control-Max-Age 86400;
        return 204;
    }

    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Headers "Authorization,Notion-Version,Content-Type" always;

    proxy_pass https://api.notion.com/v1/;
    proxy_ssl_server_name on;
    proxy_set_header Host api.notion.com;
}
```

此时前端基地址为：`https://你的域名/notion-proxy/v1`

## 前端怎么连

在前端构建时设置环境变量（见项目根的 `.env.example`）：

```
VITE_NOTION_PROXY=http://你的服务器IP:8787/v1
```

> 注意：基地址末尾是 `/v1`，不要带斜杠结尾。
> 生产建议加 HTTPS（用 Nginx/Caddy 套一层 TLS），否则 token 明文走网络。
