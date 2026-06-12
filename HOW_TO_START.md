# 🚀 Aviation Map System - Startup Guide

## 快速启动

### 方式1：一键启动（推荐）⭐

```bash
cd /Users/liziqi/Desktop/web
./start_all.sh
```

**停止系统**：
```bash
./stop_all.sh
```

---

### 方式2：手动启动

#### Terminal 1 - 启动API服务器
```bash
cd /Users/liziqi/Desktop/web/model_training
python3 flight_prediction_api.py
```

#### Terminal 2 - 启动Web服务器
```bash
cd /Users/liziqi/Desktop/web
hugo server
```

---

## 📱 访问地址

启动成功后，访问以下地址：

- **主页**: http://localhost:1313/web/
- **航空地图**: http://localhost:1313/web/map/
- **API健康检查**: http://localhost:5001/health

---

## 🔧 依赖检查

### Python依赖（API服务器）
```bash
# 检查PyTorch
python3 -c "import torch; print('PyTorch:', torch.__version__)"

# 检查Flask
python3 -c "import flask; print('Flask OK')"

# 如果缺少依赖，安装：
pip3 install torch flask flask-cors numpy
```

### Hugo（Web服务器）
```bash
# 检查Hugo
hugo version

# 如果未安装，使用Homebrew安装：
brew install hugo
```

---

## 🛑 停止服务器

### 使用停止脚本
```bash
./stop_all.sh
```

### 或手动停止
```bash
# 查找进程
ps aux | grep "flight_prediction_api"
ps aux | grep "hugo server"

# 停止进程
kill <PID>

# 或强制停止所有相关进程
pkill -f "flight_prediction_api.py"
pkill -f "hugo server"
```

---

## 📝 服务器说明

### 1. Flask API服务器 (端口 5001)
- **文件**: `model_training/flight_prediction_api.py`
- **功能**: 航迹预测API
- **模型**: `model_training/best_model.pth`
- **端点**:
  - `/health` - 健康检查
  - `/api/predict` - 单航班预测
  - `/api/predict/batch` - 批量预测

### 2. Hugo Web服务器 (端口 1313)
- **功能**: 提供前端页面
- **页面**:
  - 主页 (`/`)
  - 航空地图 (`/map/`)
  - 作业页面 (`/assignment1/`, `/assignment2/`, etc.)

---

## ⚠️ 常见问题

### 端口被占用
```bash
# 检查端口占用
lsof -i :5001  # API服务器端口
lsof -i :1313  # Hugo服务器端口

# 停止占用进程
kill -9 <PID>
```

### API服务器启动失败
- 检查PyTorch是否安装：`python3 -c "import torch"`
- 检查模型文件是否存在：`ls model_training/best_model.pth`
- 查看日志：`cat /tmp/api_server.log`

### Hugo服务器启动失败
- 检查Hugo是否安装：`hugo version`
- 查看日志：`cat /tmp/hugo_server.log`
- 确保在正确的目录：`cd /Users/liziqi/Desktop/web`

### 页面显示不正常
- 清除浏览器缓存
- 确保两个服务器都在运行
- 检查浏览器控制台错误信息

---

## 📊 系统架构

```
┌─────────────────┐
│   Browser       │
│  (localhost:1313)
└────────┬────────┘
         │
    ┌────▼────┐
    │  Hugo   │ ← 前端页面
    │  Server │
    └────┬────┘
         │
         ├─────────────┐
         │             │
    ┌────▼────┐   ┌───▼────────┐
    │  Static │   │  API Call  │
    │  Files  │   └───┬────────┘
    └─────────┘       │
                    ┌──▼─────────┐
                    │  Flask API │ ← 预测服务
                    │   (5001)   │
                    └───┬───────┘
                        │
                    ┌───▼──────────┐
                    │ PyTorch Model│
                    │ (LSTM)       │
                    └──────────────┘
```

---

## 🔄 更新代码后的重启

如果修改了代码：

```bash
# 停止服务器
./stop_all.sh

# 重新启动
./start_all.sh
```

如果只修改了前端（Hugo模板），Hugo会自动重新加载，无需重启。

---

## 💡 开发技巧

### 查看实时日志
```bash
# API服务器日志
tail -f /tmp/api_server.log

# Hugo服务器日志
tail -f /tmp/hugo_server.log
```

### 测试API
```bash
# 健康检查
curl http://localhost:5001/health

# 预测测试
curl -X POST http://localhost:5001/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "trajectory": [
      {"lat": 39.9, "lng": 116.4, "altitude": 8000, "speed": 900, "heading": 180}
    ],
    "steps": 5
  }'
```

### 修改配置
- **Hugo配置**: 编辑 `hugo.toml`
- **API端口**: 编辑 `model_training/flight_prediction_api.py` (最后一行)
- **预测参数**: 编辑 `model_training/flight_prediction_api.py` (model配置)

---

**Created**: 2025-06-10
**Version**: 1.0
