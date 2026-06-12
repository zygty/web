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

PROJECT_ROOT="/Users/liziqi/Desktop/web"
MODEL_DIR="${PROJECT_ROOT}/adsb_server_output/model"
API_PORT=5001
HUGO_PORT=1313
API_HEALTH_URL="http://127.0.0.1:${API_PORT}/health"
HUGO_HEALTH_URL="http://127.0.0.1:${HUGO_PORT}/"

check_api_health() {
    curl -fsS "$API_HEALTH_URL" >/dev/null 2>&1
}

check_hugo_health() {
    curl -fsS "$HUGO_HEALTH_URL" >/dev/null 2>&1
}

api_uses_expected_model() {
    health_json=$(curl -fsS "$API_HEALTH_URL" 2>/dev/null) || return 1
    HEALTH_JSON="$health_json" EXPECTED_MODEL_DIR="$MODEL_DIR" python3 - <<'PY'
import json
import os
import sys

data = json.loads(os.environ["HEALTH_JSON"])
expected = os.path.realpath(os.environ["EXPECTED_MODEL_DIR"])
actual = os.path.realpath(data.get("model_dir") or "")

if data.get("model_loaded") and actual == expected:
    sys.exit(0)
sys.exit(1)
PY
}

# 启动Flask API服务器
echo "🔮 Starting Flight Prediction API Server (port ${API_PORT})..."
API_PID=""
if check_api_health; then
    if api_uses_expected_model; then
        echo "ℹ️  API Server is already running on port ${API_PORT} and is using the synced server model."
    else
        echo "ℹ️  Existing API is not using the synced server model. Restarting API..."
        pkill -f "flight_prediction_api.py" 2>/dev/null || true
        sleep 1
    fi
fi

if ! check_api_health; then
    cd "${PROJECT_ROOT}/model_training"
    MODEL_DIR="${MODEL_DIR}" API_PORT=${API_PORT} FLASK_DEBUG=0 python3 flight_prediction_api.py > /tmp/api_server.log 2>&1 &
    API_PID=$!
    echo "✅ API Server started (PID: $API_PID)"
    echo ""

    for _ in {1..10}; do
        if check_api_health; then
            break
        fi

        if ! kill -0 $API_PID 2>/dev/null; then
            break
        fi

        sleep 1
    done

    if ! check_api_health; then
        echo "❌ API Server failed to become healthy. Check /tmp/api_server.log"
        if grep -q "Address already in use" /tmp/api_server.log 2>/dev/null; then
            echo "ℹ️  Port ${API_PORT} is already in use. If this is an old local process, run ./stop_all.sh first."
        fi
        exit 1
    fi

    if ! api_uses_expected_model; then
        echo "❌ API Server started, but it is not loading the synced server model from ${MODEL_DIR}"
        exit 1
    fi
else
    echo "✅ API Server is ready and using: ${MODEL_DIR}"
fi
echo ""

# 启动Hugo Web服务器
echo "🌐 Starting Hugo Web Server (port ${HUGO_PORT})..."
HUGO_PID=""
if check_hugo_health; then
    echo "ℹ️  Hugo server is already running on port ${HUGO_PORT}, reusing existing instance."
else
    cd "${PROJECT_ROOT}"
    hugo server --baseURL=http://localhost:${HUGO_PORT}/ > /tmp/hugo_server.log 2>&1 &
    HUGO_PID=$!
    echo "✅ Hugo Server started (PID: $HUGO_PID)"
    echo ""

    for _ in {1..10}; do
        if check_hugo_health; then
            break
        fi

        if ! kill -0 $HUGO_PID 2>/dev/null; then
            break
        fi

        sleep 1
    done

    if ! check_hugo_health; then
        echo "❌ Hugo Server failed to become reachable. Check /tmp/hugo_server.log"
        if [ -n "$API_PID" ]; then
            kill "$API_PID" 2>/dev/null
        fi
        exit 1
    fi
fi
echo ""

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
if [ -n "$API_PID" ]; then
    echo "  • API Server:  Running (PID: $API_PID, Port: ${API_PORT})"
else
    echo "  • API Server:  Reused existing process (Port: ${API_PORT})"
fi
if [ -n "$HUGO_PID" ]; then
    echo "  • Hugo Server: Running (PID: $HUGO_PID, Port: ${HUGO_PORT})"
else
    echo "  • Hugo Server: Reused existing process (Port: ${HUGO_PORT})"
fi
echo ""
echo "🛑 To stop all servers, run:"
echo "  ./stop_all.sh"
echo "  or press Ctrl+C if using interactive mode"
echo ""
echo "📝 Logs:"
echo "  • API Server:   /tmp/api_server.log"
echo "  • Hugo Server:  /tmp/hugo_server.log"
echo "  • Model Dir:    ${MODEL_DIR}"
echo ""

# 保存PID到文件
if [ -n "$API_PID" ]; then
    echo $API_PID > /tmp/web_api.pid
fi
if [ -n "$HUGO_PID" ]; then
    echo $HUGO_PID > /tmp/web_hugo.pid
fi

echo "💡 Server state is ready. Use ./stop_all.sh to clean up local API and Hugo processes."
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
