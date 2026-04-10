# 航空轨迹监控系统

一个基于Hugo和Leaflet的航空轨迹实时展示平台，用于可视化ADSB数据。

## 功能特性

- ✈️ **实时轨迹展示**: 在交互式地图上动态显示航空器轨迹
- 🎨 **现代化UI**: 深色主题设计，响应式布局
- 📊 **数据状态监控**: 实时显示航班数量、数据更新状态
- 🎮 **播放控制**: 支持播放/暂停、速度调节、重置等控制功能
- 🔌 **预留数据接口**: 已预留ADSB数据接入接口

## 快速开始

### 1. 构建网站

```bash
hugo --minify
```

### 2. 启动本地服务器

```bash
hugo server
```

然后访问: http://localhost:1313

### 3. 生产部署

构建后的文件在 `public/` 目录，可直接部署到任何静态网站托管服务。

## ADSB数据接入指南

### 数据接口位置

在 [layouts/index.html](layouts/index.html) 中搜索 `TODO: ADSB` 可以找到以下预留接口：

#### 1. 数据加载函数

```javascript
async function loadADSBData() {
    // TODO: 在这里接入你的ADSB数据源

    // 示例1: 从API获取
    // const response = await fetch('/api/adsb/data');
    // const data = await response.json();
    // return data;

    // 示例2: 从本地JSON文件读取
    // const response = await fetch('/data/adsb.json');
    // const data = await response.json();
    // return data;

    // 示例3: WebSocket实时数据
    // return new Promise((resolve) => {
    //     ws.onmessage = (event) => {
    //         const data = JSON.parse(event.data);
    //         resolve(data);
    //     };
    // });

    return []; // 返回航班数据数组
}
```

#### 2. 数据调用位置

在页面底部的 `DOMContentLoaded` 事件中：

```javascript
// TODO: 当ADSB数据接口接入后，取消注释以下代码
// loadADSBData().then(data => {
//     data.forEach(flight => addFlight(flight));
//     document.getElementById('dataStatus').className = 'status-dot online';
//     document.getElementById('dataStatusText').textContent = '数据已连接';
// });
```

### 数据格式规范

```json
[
  {
    "flight_id": "CA1234",
    "callsign": "CCA1234",
    "route": [
      {
        "lat": 39.9042,
        "lng": 116.4074,
        "altitude": 32000,
        "timestamp": "2024-01-01T10:00:00Z"
      },
      {
        "lat": 39.5,
        "lng": 116.9,
        "altitude": 32500,
        "timestamp": "2024-01-01T10:05:00Z"
      }
    ]
  },
  {
    "flight_id": "MU5678",
    "callsign": "CSN5678",
    "route": [
      // 更多轨迹点...
    ]
  }
]
```

### 字段说明

- `flight_id`: 航班唯一标识符（必填）
- `callsign`: 航班呼号（可选，用于显示）
- `route`: 轨迹点数组（必填）
  - `lat`: 纬度（必填）
  - `lng`: 经度（必填）
  - `altitude`: 高度（单位：英尺，可选）
  - `timestamp`: 时间戳（ISO 8601格式，可选）

## 项目结构

```
web/
├── assets/
│   └── css/
│       └── style.css          # 主样式文件
├── layouts/
│   ├── index.html             # 主页面（包含地图和交互逻辑）
│   └── _default/
│       └── baseof.html        # 基础模板
├── static/                    # 静态资源目录
├── content/                   # 内容目录
├── data/                      # 数据目录（可存放ADSB数据文件）
├── public/                    # 构建输出目录
├── hugo.toml                  # Hugo配置文件
└── README.md                  # 本文件
```

## 技术栈

- **Hugo**: 静态网站生成器
- **Leaflet.js**: 开源地图库
- **CARTO Dark**: 深色地图瓦片
- **Vanilla JavaScript**: 无框架依赖

## 控制面板功能

- **播放/暂停**: 控制轨迹动画
- **重置**: 将所有航班重置到起点
- **清除**: 清除地图上的所有航班
- **速度调节**: 0.1x - 3.0x 速度调节

## 自定义配置

### 修改网站标题

编辑 `hugo.toml`:

```toml
title = '你的网站标题'
```

### 修改地图初始中心

编辑 `layouts/index.html` 中的 `initMap()` 函数:

```javascript
map = L.map('map').setView([纬度, 经度], 缩放级别);
```

### 修改颜色主题

编辑 `assets/css/style.css` 中的 CSS 变量:

```css
:root {
    --accent-blue: #3b82f6;
    --accent-cyan: #06b6d4;
    --accent-green: #10b981;
    /* ... */
}
```

## 浏览器支持

- Chrome/Edge (推荐)
- Firefox
- Safari
- 移动浏览器

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交Issue。
