#!/usr/bin/env bash
#
# 一键部署 server/ 下所有 Node 服务（notion-proxy + ai-proxy）
#
# 在服务器上执行（先 git clone / rsync 代码到服务器）：
#   cd /path/to/md-render/server
#   bash deploy.sh
#
# 可选环境变量：
#   NOTION_PROXY_PORT=8787   notion-proxy 端口
#   AI_PROXY_PORT=8788       ai-proxy 端口
#   INSTALL_DEPS=1           尝试安装系统依赖（需 root）
#   SKIP_FIREWALL=1          跳过防火墙放行
#   SKIP_PYTHON=1            跳过 ai-proxy Python 工具依赖
#
# 可选参数：
#   --install-deps           同 INSTALL_DEPS=1
#   --skip-firewall
#   --skip-python
#   --help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOTION_PORT="${NOTION_PROXY_PORT:-8787}"
AI_PORT="${AI_PROXY_PORT:-8788}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
SKIP_FIREWALL="${SKIP_FIREWALL:-0}"
SKIP_PYTHON="${SKIP_PYTHON:-0}"

# ── 颜色输出 ────────────────────────────────────────────
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
step()  { blue "▶ $*"; }

usage() {
  cat <<'EOF'
用法: bash deploy.sh [选项]

部署 server/ 下所有 Node 服务（notion-proxy、ai-proxy），用 PM2 常驻。

选项:
  --install-deps    尝试安装 node / python3 / ffmpeg / pm2（需 root）
  --skip-firewall   跳过 firewalld / ufw 放行端口
  --skip-python     跳过 ai-proxy 的 Python venv 与工具依赖
  --help            显示本帮助

环境变量:
  NOTION_PROXY_PORT   notion-proxy 端口（默认 8787）
  AI_PROXY_PORT       ai-proxy 端口（默认 8788）
EOF
}

for arg in "$@"; do
  case "$arg" in
    --install-deps) INSTALL_DEPS=1 ;;
    --skip-firewall) SKIP_FIREWALL=1 ;;
    --skip-python) SKIP_PYTHON=1 ;;
    --help|-h) usage; exit 0 ;;
    *) red "未知参数: $arg"; usage; exit 1 ;;
  esac
done

# ── 发现服务（含 server.js 的子目录） ─────────────────
discover_services() {
  local dir name
  SERVICES=()
  for dir in "$SCRIPT_DIR"/*/; do
    [ -d "$dir" ] || continue
    if [ -f "${dir}server.js" ]; then
      name="$(basename "$dir")"
      SERVICES+=("$name")
    fi
  done
}

service_port() {
  case "$1" in
    notion-proxy) echo "$NOTION_PORT" ;;
    ai-proxy) echo "$AI_PORT" ;;
    *) echo "" ;;
  esac
}

service_health_url() {
  local name="$1" port
  port="$(service_port "$name")"
  case "$name" in
    notion-proxy) echo "http://127.0.0.1:${port}/v1/users/me" ;;
    ai-proxy) echo "http://127.0.0.1:${port}/api/health" ;;
    *) echo "" ;;
  esac
}

service_health_expect() {
  case "$1" in
    notion-proxy) echo "401" ;;  # 无 token 时 Notion 返回 401 = 代理通了
    ai-proxy) echo "200" ;;
    *) echo "200" ;;
  esac
}

# ── 系统依赖安装（可选） ───────────────────────────────
install_system_deps() {
  if [ "$INSTALL_DEPS" != "1" ]; then
    return 0
  fi

  if [ "$(id -u)" -ne 0 ]; then
    yellow "  --install-deps 需要 root，当前非 root，跳过系统包安装"
    return 0
  fi

  step "安装系统依赖"

  if command -v yum >/dev/null 2>&1; then
    yum install -y curl nodejs npm python3 python3-pip ffmpeg 2>/dev/null || \
      yum install -y curl nodejs npm python3 python3-pip 2>/dev/null || true
    # CentOS 上 ffmpeg 可能在 rpmfusion，装不上也不阻断
    if ! command -v ffmpeg >/dev/null 2>&1; then
      yellow "  ffmpeg 未安装，video_to_audio 工具不可用。可手动: yum install ffmpeg 或 rpmfusion"
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y curl nodejs npm python3 python3-venv python3-pip ffmpeg
  else
    yellow "  未识别包管理器，请手动安装: node(>=18) python3 pip ffmpeg"
  fi

  if ! command -v pm2 >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    npm install -g pm2
  fi

  green "  系统依赖安装完成"
}

# ── 前置检查 ───────────────────────────────────────────
check_node() {
  step "检查 Node.js"
  if ! command -v node >/dev/null 2>&1; then
    red "未找到 node。请安装 Node 18+，或加 --install-deps（需 root）"
    exit 1
  fi

  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 18 ]; then
    red "需要 Node 18+，当前: $(node -v)"
    exit 1
  fi
  green "  Node $(node -v)"
}

check_pm2() {
  step "检查 PM2"
  if ! command -v pm2 >/dev/null 2>&1; then
    if command -v npm >/dev/null 2>&1; then
      yellow "  未找到 pm2，正在全局安装..."
      npm install -g pm2
    else
      red "未找到 pm2 且无法 npm install -g pm2"
      exit 1
    fi
  fi
  green "  PM2 $(pm2 -v)"
}

setup_ai_proxy_env() {
  step "检查 ai-proxy/.env"
  local env_file="$SCRIPT_DIR/ai-proxy/.env"
  local example_file="$SCRIPT_DIR/ai-proxy/.env.example"

  if [ -f "$env_file" ]; then
    green "  已存在 ai-proxy/.env"
    return 0
  fi

  if [ -f "$example_file" ]; then
    cp "$example_file" "$env_file"
    yellow "  已从 .env.example 复制 ai-proxy/.env，请编辑填入 API Key"
  else
    yellow "  未找到 ai-proxy/.env，Provider 模式需手动创建并填入 key"
  fi
}

setup_python_tools() {
  if [ "$SKIP_PYTHON" = "1" ]; then
    yellow "  跳过 Python 工具依赖（--skip-python）"
    return 0
  fi

  step "安装 ai-proxy Python 工具依赖"
  local venv_dir="$SCRIPT_DIR/ai-proxy/.venv"
  local req_file="$SCRIPT_DIR/ai-proxy/tools/pdf-to-docx/requirements-pdf-docx.txt"

  if ! command -v python3 >/dev/null 2>&1; then
    yellow "  未找到 python3，跳过 venv（pdf_to_docx 工具将不可用）"
    return 0
  fi

  if [ ! -d "$venv_dir" ]; then
    python3 -m venv "$venv_dir"
    green "  已创建 venv: ai-proxy/.venv"
  fi

  # shellcheck disable=SC1091
  source "$venv_dir/bin/activate"

  pip install -q --upgrade pip
  if [ -f "$req_file" ]; then
    pip install -q -r "$req_file"
    green "  已安装 pdf-to-docx 依赖"
  fi

  deactivate 2>/dev/null || true

  if ! command -v ffmpeg >/dev/null 2>&1; then
    yellow "  未找到 ffmpeg，video_to_audio 工具不可用"
  else
    green "  ffmpeg 已就绪"
  fi
}

# ── 防火墙 ─────────────────────────────────────────────
open_firewall_port() {
  local port="$1"
  if [ "$SKIP_FIREWALL" = "1" ]; then
    return 0
  fi

  if systemctl is-active --quiet firewalld 2>/dev/null; then
    firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    green "  firewalld 已放行 ${port}/tcp"
  elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "${port}/tcp" >/dev/null 2>&1 || true
    green "  ufw 已放行 ${port}/tcp"
  fi
}

setup_firewall() {
  if [ "$SKIP_FIREWALL" = "1" ]; then
    yellow "  跳过防火墙（--skip-firewall）"
    return 0
  fi

  step "放行防火墙端口 ${NOTION_PORT}, ${AI_PORT}"
  open_firewall_port "$NOTION_PORT"
  open_firewall_port "$AI_PORT"
  yellow "  云服务器还需在控制台安全组放行上述端口"
}

# ── PM2 部署 ───────────────────────────────────────────
deploy_pm2() {
  step "PM2 启动/更新服务"
  cd "$SCRIPT_DIR"

  export NOTION_PROXY_PORT="$NOTION_PORT"
  export AI_PROXY_PORT="$AI_PORT"

  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save

  green "  PM2 进程已更新"
  pm2 status
}

# ── 健康检查 ───────────────────────────────────────────
health_check() {
  local name="$1" url expect code
  url="$(service_health_url "$name")"
  expect="$(service_health_expect "$name")"

  [ -n "$url" ] || return 0

  step "自检 $name"
  sleep 1
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
  echo "  $url → HTTP $code（期望 $expect）"

  if [ "$code" = "$expect" ]; then
    green "  ✅ $name 正常"
    return 0
  fi

  red "  ⚠ $name 异常，查看日志: pm2 logs $name --lines 50"
  return 1
}

print_summary() {
  local ip failed=0 name

  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  ip="${ip:-你的服务器IP}"

  echo
  blue "════════════════════════════════════════"
  green "部署完成"
  blue "════════════════════════════════════════"
  echo
  echo "服务地址："
  echo "  Notion 代理: http://${ip}:${NOTION_PORT}/v1"
  echo "  AI 代理:     http://${ip}:${AI_PORT}"
  echo
  echo "前端配置（apps/editor/.env）："
  echo "  VITE_NOTION_PROXY=http://${ip}:${NOTION_PORT}/v1"
  echo "  AI_PROXY_BASE=http://${ip}:${AI_PORT}"
  echo
  echo "常用命令："
  echo "  pm2 status"
  echo "  pm2 logs ai-proxy"
  echo "  pm2 restart all"
  echo "  pm2 startup    # 开机自启（按提示执行生成的命令）"
  echo

  for name in "${SERVICES[@]}"; do
    health_check "$name" || failed=1
  done

  if [ "$failed" -ne 0 ]; then
    red "部分服务自检未通过，请检查 pm2 logs"
    exit 1
  fi
}

# ── main ───────────────────────────────────────────────
main() {
  blue "md-render server 统一部署"
  echo "  目录: $SCRIPT_DIR"
  echo "  端口: notion-proxy=$NOTION_PORT, ai-proxy=$AI_PORT"
  echo

  discover_services
  if [ "${#SERVICES[@]}" -eq 0 ]; then
    red "未在 server/ 下发现含 server.js 的服务目录"
    exit 1
  fi
  green "发现服务: ${SERVICES[*]}"

  install_system_deps
  check_node
  check_pm2
  setup_ai_proxy_env
  setup_python_tools
  setup_firewall
  deploy_pm2
  print_summary
}

main "$@"
