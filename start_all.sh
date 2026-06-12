#!/bin/bash
# 一键启动完整Web系统（API服务器 + Hugo服务器）

echo "🚀 Starting Aviation Map & Prediction System..."
echo ""

# 检查依赖
echo "🔍 Checking dependencies..."
if ! command -v python3 &> /dev/null; then
    echo "❌ python3 not found. Please install Python 3."
    exit 1
fi

if ! command -v hugo &> /dev/null; then
    echo "❌ hugo not found. Please install Hugo."
    exit 1
fi

echo "✅ Dependencies OK"
echo ""

# 启动Flask API服务器
echo "🔮 Starting Flight Prediction API Server (port 5001)..."
cd /Users/liziqi/Desktop/web/model_training
python3 flight_prediction_api.py > /tmp/api_server.log 2>&1 &
API_PID=$!
echo "✅ API Server started (PID: $API_PID)"
echo ""

# 等待API服务器启动
sleep 2

# 检查API服务器是否成功启动
if ! kill -0 $API_PID 2>/dev/null; then
    echo "❌ API Server failed to start. Check /tmp/api_server.log"
    exit 1
fi

# 启动Hugo Web服务器
echo "🌐 Starting Hugo Web Server (port 1313)..."
cd /Users/liziqi/Desktop/web
hugo server --baseURL=http://localhost:1313/ > /tmp/hugo_server.log 2>&1 &
HUGO_PID=$!
echo "✅ Hugo Server started (PID: $HUGO_PID)"
echo ""

# 等待Hugo服务器启动
sleep 3

# 检查Hugo服务器是否成功启动
if ! kill -0 $HUGO_PID 2>/dev/null; then
    echo "❌ Hugo Server failed to start. Check /tmp/hugo_server.log"
    kill $API_PID 2>/dev/null
    exit 1
fi

echo "🎉 All servers started successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📍 Access URLs:"
echo "  • Main Page:  http://localhost:1313/"
echo "  • Assignment 4 (ZH): http://localhost:1313/assignment4/"
echo "  • Assignment 4 (EN): http://localhost:1313/assignment4/en.html"
echo "  • Map Page:   http://localhost:1313/map/"
echo "  • API Health: http://localhost:5001/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Server Status:"
echo "  • API Server:  Running (PID: $API_PID, Port: 5001)"
echo "  • Hugo Server: Running (PID: $HUGO_PID, Port: 1313)"
echo ""
echo "🛑 To stop all servers, run:"
echo "  kill $API_PID $HUGO_PID"
echo "  or press Ctrl+C if using interactive mode"
echo ""
echo "📝 Logs:"
echo "  • API Server:   /tmp/api_server.log"
echo "  • Hugo Server:  /tmp/hugo_server.log"
echo ""

# 保存PID到文件
echo $API_PID > /tmp/web_api.pid
echo $HUGO_PID > /tmp/web_hugo.pid

echo "💡 PIDs saved to /tmp/web_api.pid and /tmp/web_hugo.pid"
echo ""

# 可选：监控服务器状态
if [ "$1" == "--monitor" ]; then
    echo "👁️  Monitoring mode enabled. Press Ctrl+C to stop..."
    trap "echo 'Stopping servers...'; kill $API_PID $HUGO_PID; exit 0" INT TERM
    while true; do
        sleep 10
        if ! kill -0 $API_PID 2>/dev/null || ! kill -0 $HUGO_PID 2>/dev/null; then
            echo "⚠️  One or more servers stopped unexpectedly!"
            break
        fi
    done
fi
