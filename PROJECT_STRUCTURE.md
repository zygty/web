# 文件结构说明

## 代码组织架构

代码已经拆分成模块化的文件结构，便于维护和扩展。

```
web/
├── assets/
│   ├── css/
│   │   ├── style.css              # 全局通用样式
│   │   └── flight-tracker.css     # 航班追踪专用样式
│   └── js/
│       └── flight-tracker.js      # 航班追踪主脚本
├── layouts/
│   ├── index.html                 # 主页面（HTML结构）
│   └── _default/
│       └── baseof.html            # 基础模板
├── data/
│   └── adsb_example.json          # ADSB数据示例
├── content/                       # 内容目录
├── static/                        # 静态资源目录
├── public/                        # 构建输出目录
└── hugo.toml                      # Hugo配置文件
```

## 文件职责

### HTML 结构
- **layouts/index.html**: 只包含HTML结构和元素引用，不包含内联样式和脚本

### CSS 样式
- **assets/css/flight-tracker.css**: 所有航班追踪相关的样式
  - 全局变量和主题颜色
  - 布局样式
  - 响应式设计
  - 组件样式

### JavaScript 逻辑
- **assets/js/flight-tracker.js**: 所有航班追踪相关的逻辑
  - 地图初始化
  - 航班管理
  - 动画控制
  - ADSB数据接口

## 优势

### 1. 可维护性
- 每个文件职责单一，易于定位和修改
- 代码分离清晰，减少耦合

### 2. 可复用性
- CSS可以在其他页面中引用
- JavaScript模块化，便于复用

### 3. 性能优化
- 浏览器可以缓存独立的CSS和JS文件
- 减少HTML文件大小，加快加载速度

### 4. 团队协作
- 前端开发者可以同时编辑不同文件
- 减少代码冲突

### 5. 调试方便
- CSS和JavaScript有独立的文件行号
- 浏览器开发者工具可以直接跳转到对应文件

## 如何使用

### 开发模式
```bash
hugo server
```

### 生产构建
```bash
hugo --minify
```

构建后的文件：
- CSS → `public/css/flight-tracker.css`
- JS → `public/js/flight-tracker.js`
- HTML → `public/index.html`

## 扩展建议

如果需要进一步优化，可以考虑：

1. **JavaScript模块化**
   - 将地图、航班、动画等功能拆分成独立模块
   - 使用ES6模块或CommonJS

2. **CSS模块化**
   - 按组件拆分CSS文件
   - 使用CSS预处理器（Sass/Less）

3. **添加更多功能模块**
   ```
   assets/js/
   ├── core/
   │   ├── map.js           # 地图管理
   │   ├── flight.js        # 航班管理
   │   └── animation.js     # 动画控制
   ├── data/
   │   └── adsb.js          # ADSB数据处理
   └── utils/
       └── helpers.js       # 工具函数
   ```

4. **使用构建工具**
   - Webpack/Vite 进行资源打包
   - 代码压缩和优化
   - 代码分割和懒加载
