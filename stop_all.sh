#!/bin/bash
# 停止所有Web服务器

echo "🛑 Stopping Aviation Map & Prediction System..."

# 从PID文件读取
if [ -f /tmp/web_api.pid ]; then
    API_PID=$(cat /tmp/web_api.pid)
    if kill -0 $API_PID 2>/dev/null; then
        kill $API_PID
        echo "✅ API Server stopped (PID: $API_PID)"
    fi
    rm /tmp/web_api.pid
fi

if [ -f /tmp/web_hugo.pid ]; then
    HUGO_PID=$(cat /tmp/web_hugo.pid)
    if kill -0 $HUGO_PID 2>/dev/null; then
        kill $HUGO_PID
        echo "✅ Hugo Server stopped (PID: $HUGO_PID)"
    fi
    rm /tmp/web_hugo.pid
fi

# 额外清理：杀掉可能残留的进程
pkill -f "flight_prediction_api.py" 2>/dev/null && echo "🧹 Cleaned up API server processes"
pkill -f "hugo server" 2>/dev/null && echo "🧹 Cleaned up Hugo server processes"

echo ""
echo "🎉 All servers stopped!"
