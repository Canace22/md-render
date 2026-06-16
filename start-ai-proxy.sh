#!/bin/bash
# 启动 ai-proxy server
# 用法：./start-ai-proxy.sh
cd "$(dirname "$0")/server/ai-proxy"
exec node server.js