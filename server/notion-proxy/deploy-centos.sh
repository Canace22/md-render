#!/usr/bin/env bash
#
# CentOS + Nginx 一键部署 Notion API 反向代理（HTTP 版）
#
# 用法：
#   sudo bash deploy-centos.sh                # 用默认端口 8787
#   sudo PORT=9000 bash deploy-centos.sh      # 自定义端口
#
# 做的事：放 Nginx 配置 → 解决 SELinux → 放行 firewalld → 测试并重载 → curl 自检
# 全程幂等：重复跑不会重复添加，安全。
#
set -euo pipefail

PORT="${PORT:-8787}"
CONF="/etc/nginx/conf.d/notion-proxy.conf"

# ── 颜色输出 ────────────────────────────────────────────
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
step()  { blue "▶ $*"; }

# ── 0. 前置检查 ─────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  red "请用 root 运行：sudo bash $0"
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  red "未检测到 nginx。请先安装：sudo yum install -y nginx && sudo systemctl enable --now nginx"
  exit 1
fi

# ── 1. 写 Nginx 配置 ────────────────────────────────────
step "写入 Nginx 配置 $CONF（监听 $PORT）"
cat > "$CONF" <<EOF
server {
    listen $PORT;
    server_name _;

    location /v1/ {
        if (\$request_method = OPTIONS) {
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
}
EOF
green "  配置已写入"

# ── 2. SELinux：允许 nginx 主动联网 ─────────────────────
step "检查 SELinux"
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1
  green "  已允许 nginx 联网（httpd_can_network_connect）"
else
  green "  SELinux 未强制，跳过"
fi

# ── 3. firewalld：放行端口 ──────────────────────────────
step "检查 firewalld"
if systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null
  firewall-cmd --reload >/dev/null
  green "  已放行 ${PORT}/tcp"
else
  green "  firewalld 未运行，跳过（注意云服务器还需在控制台安全组放行 $PORT）"
fi

# ── 4. 测试配置并重载 ──────────────────────────────────
step "测试 Nginx 配置"
if ! nginx -t; then
  red "Nginx 配置测试失败。已写入的配置在 $CONF，请检查上面的报错。"
  exit 1
fi
systemctl reload nginx
green "  Nginx 已重载"

# ── 5. 自检：不带 token 应返回 401 ──────────────────────
step "验证代理（不带 token，期望 401 = 转发成功）"
sleep 1
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/v1/users/me" || echo 000)"
echo "  本地请求返回码：$CODE"

echo
if [ "$CODE" = "401" ]; then
  green "✅ 部署成功！代理已通。"
elif [ "$CODE" = "502" ]; then
  red "⚠ 返回 502：多半是 SELinux 仍在拦截，或服务器无法访问 api.notion.com。"
  red "  查日志：sudo tail /var/log/nginx/error.log"
  exit 1
else
  red "⚠ 返回码 $CODE，非预期。查日志：sudo tail /var/log/nginx/error.log"
  exit 1
fi

# ── 6. 收尾提示 ─────────────────────────────────────────
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
blue "下一步（在你的开发机 / 项目里）："
echo "  1. 进入 apps/editor/，复制 .env.example 为 .env"
echo "  2. 填入：VITE_NOTION_PROXY=http://${IP:-你的IP}:${PORT}/v1"
echo "  3. 重新 pnpm electron:build"
echo
blue "外网访问提醒："
echo "  - 云服务器需在控制台「安全组」放行 ${PORT} 端口"
echo "  - HTTP 下 token 明文传输，长期用建议加域名上 HTTPS（见 DEPLOY-centos-nginx.md 末尾）"
