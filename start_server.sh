#!/bin/bash
# 启动本地HTTP服务器

echo "正在启动本地服务器..."
echo "访问地址: http://localhost:8000"
echo "按 Ctrl+C 停止服务器"
echo ""

cd public && python3 -m http.server 8000
