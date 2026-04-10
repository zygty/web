/**
 * 航空轨迹监控系统 - 主脚本
 *
 * 功能：
 * - 地图初始化和管理
 * - 航班轨迹显示和动画
 * - 播放控制（播放/暂停/重置/清除）
 * - 预留ADSB数据接口
 */

// ==================== 全局变量 ====================
let map;
let isPlaying = false;
let animationSpeed = 1.0;
let animationId = null;
let flights = [];
let flightMarkers = {};
let flightPolylines = {};

// TODO: ADSB数据接口
// ==================== 预留ADSB数据加载函数 ====================
/**
 * 加载ADSB数据
 * @returns {Promise<Array>} 返回航班数据数组
 *
 * 数据格式示例:
 * [
 *   {
 *     flight_id: "CA1234",
 *     callsign: "CCA1234",
 *     route: [
 *       { lat: 39.9042, lng: 116.4074, altitude: 32000, timestamp: "2024-01-01T10:00:00Z" },
 *       { lat: 39.5, lng: 116.9, altitude: 32500, timestamp: "2024-01-01T10:05:00Z" },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */
async function loadADSBData() {
    // TODO: 在这里接入你的ADSB数据源
    // 示例1: 从API获取
    // const response = await fetch('/api/adsb/data');
    // const data = await response.json();
    // return data;

    // 示例2: 从本地JSON文件读取
    // const response = await fetch('/data/adsb_example.json');
    // const data = await response.json();
    // return data;

    // 示例3: WebSocket实时数据
    // return new Promise((resolve) => {
    //     ws.onmessage = (event) => {
    //         const data = JSON.parse(event.data);
    //         resolve(data);
    //     };
    // });

    console.log('ADSB数据接口待接入');
    return []; // 返回空数组，等待数据接入
}

// ==================== 地图初始化 ====================
/**
 * 初始化Leaflet地图
 */
function initMap() {
    // 初始化地图，中心设置在中国
    map = L.map('map').setView([35.5, 114.5], 5);

    // 使用深色地图瓦片（CARTO Dark）
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // 监听地图移动事件，更新中心坐标显示
    map.on('move', function() {
        const center = map.getCenter();
        document.getElementById('mapCenter').textContent =
            `${center.lat.toFixed(2)}°N, ${center.lng.toFixed(2)}°E`;
    });
}

// ==================== 航班管理 ====================
/**
 * 创建飞机图标
 * @returns {L.DivIcon} Leaflet图标对象
 */
function createPlaneIcon() {
    return L.divIcon({
        html: `<div style="
            width: 20px;
            height: 20px;
            background: linear-gradient(135deg, #10b981, #3b82f6);
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        ">✈</div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

/**
 * 添加航班到地图
 * @param {Object} flight - 航班数据对象
 */
function addFlight(flight) {
    const flightId = flight.flight_id;

    // 绘制轨迹线
    const latlngs = flight.route.map(point => [point.lat, point.lng]);
    const polyline = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8
    }).addTo(map);

    flightPolylines[flightId] = polyline;

    // 创建飞机标记
    const marker = L.marker(latlngs[0], {
        icon: createPlaneIcon()
    }).addTo(map);

    // 添加弹出信息
    marker.bindPopup(`
        <div style="font-size: 13px;">
            <strong>${flight.callsign || flightId}</strong><br>
            起点: ${flight.route[0].lat.toFixed(2)}, ${flight.route[0].lng.toFixed(2)}<br>
            终点: ${flight.route[flight.route.length-1].lat.toFixed(2)}, ${flight.route[flight.route.length-1].lng.toFixed(2)}<br>
            轨迹点: ${flight.route.length}
        </div>
    `);

    // 点击标记时选中航班
    marker.on('click', function() {
        selectFlight(flightId);
    });

    flightMarkers[flightId] = {
        marker: marker,
        route: flight.route,
        currentIndex: 0
    };

    flights.push(flight);
    updateFlightList();
}

/**
 * 选中航班
 * @param {string} flightId - 航班ID
 */
function selectFlight(flightId) {
    document.getElementById('selectedFlight').textContent = flightId;

    // 更新航班列表的高亮状态
    const flightItems = document.querySelectorAll('.flight-item');
    flightItems.forEach(item => {
        item.classList.remove('active');
    });

    // 找到对应的列表项并高亮
    const targetItem = document.querySelector(`[data-flight-id="${flightId}"]`);
    if (targetItem) {
        targetItem.classList.add('active');
    }
}

/**
 * 更新航班列表UI
 */
function updateFlightList() {
    const flightList = document.getElementById('flightList');
    flightList.innerHTML = '';

    flights.forEach(flight => {
        const item = document.createElement('div');
        item.className = 'flight-item';
        item.setAttribute('data-flight-id', flight.flight_id);
        item.innerHTML = `
            <div class="flight-item-header">
                <span class="flight-code">${flight.callsign || flight.flight_id}</span>
                <span class="flight-status ${isPlaying ? 'active' : 'inactive'}">
                    ${isPlaying ? '运行中' : '待命'}
                </span>
            </div>
            <div class="flight-info">
                轨迹点: ${flight.route.length} |
                高度: ${flight.route[0]?.altitude || 'N/A'}ft
            </div>
        `;

        item.addEventListener('click', () => selectFlight(flight.flight_id));
        flightList.appendChild(item);
    });

    // 更新统计数据
    document.getElementById('activeFlights').textContent = flights.length;
    document.getElementById('totalPoints').textContent =
        flights.reduce((sum, f) => sum + f.route.length, 0);
}

// ==================== 动画控制 ====================
/**
 * 播放/暂停动画
 */
function toggleAnimation() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('playPauseBtn');

    if (isPlaying) {
        btn.innerHTML = '<span>⏸</span><span>暂停</span>';
        animate();
    } else {
        btn.innerHTML = '<span>▶</span><span>播放</span>';
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    }

    updateFlightList();
}

/**
 * 动画循环
 * @param {number} currentTime - 当前时间戳
 */
let lastTime = 0;
const baseInterval = 500; // 基础间隔（毫秒）

function animate(currentTime) {
    if (!isPlaying) return;

    if (!lastTime) lastTime = currentTime;
    const deltaTime = currentTime - lastTime;

    if (deltaTime >= baseInterval / animationSpeed) {
        // 更新所有航班位置
        Object.values(flightMarkers).forEach(flightMarker => {
            flightMarker.currentIndex++;

            if (flightMarker.currentIndex >= flightMarker.route.length) {
                flightMarker.currentIndex = 0; // 循环播放
            }

            const point = flightMarker.route[flightMarker.currentIndex];
            flightMarker.marker.setLatLng([point.lat, point.lng]);
        });

        // 更新时间显示
        const now = new Date();
        document.getElementById('lastUpdate').textContent =
            now.toLocaleTimeString('zh-CN');

        lastTime = currentTime;
    }

    animationId = requestAnimationFrame(animate);
}

/**
 * 重置动画
 */
function resetAnimation() {
    Object.values(flightMarkers).forEach(flightMarker => {
        flightMarker.currentIndex = 0;
        const startPoint = flightMarker.route[0];
        flightMarker.marker.setLatLng([startPoint.lat, startPoint.lng]);
    });

    document.getElementById('lastUpdate').textContent = '--:--:--';
}

/**
 * 清除所有航班
 */
function clearFlights() {
    // 清除标记
    Object.values(flightMarkers).forEach(flightMarker => {
        map.removeLayer(flightMarker.marker);
    });

    // 清除轨迹线
    Object.values(flightPolylines).forEach(polyline => {
        map.removeLayer(polyline);
    });

    // 重置数据
    flights = [];
    flightMarkers = {};
    flightPolylines = {};

    updateFlightList();
    document.getElementById('selectedFlight').textContent = '未选择';
}

// ==================== 事件监听与初始化 ====================
/**
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    // 初始化地图
    initMap();

    // 播放/暂停按钮
    document.getElementById('playPauseBtn').addEventListener('click', toggleAnimation);

    // 重置按钮
    document.getElementById('resetBtn').addEventListener('click', resetAnimation);

    // 清除按钮
    document.getElementById('clearBtn').addEventListener('click', clearFlights);

    // 速度滑块
    document.getElementById('speedSlider').addEventListener('input', function(e) {
        animationSpeed = parseFloat(e.target.value);
        document.getElementById('speedValue').textContent = animationSpeed.toFixed(1);
    });

    // 添加示例航班数据（等待ADSB数据接入）
    const exampleFlight = {
        flight_id: 'CA1234',
        callsign: 'CCA1234',
        route: [
            { lat: 39.9042, lng: 116.4074, altitude: 32000, timestamp: '2024-01-01T10:00:00Z' },
            { lat: 39.5, lng: 116.9, altitude: 32500, timestamp: '2024-01-01T10:05:00Z' },
            { lat: 38.9, lng: 117.8, altitude: 33000, timestamp: '2024-01-01T10:10:00Z' },
            { lat: 37.8, lng: 118.8, altitude: 33500, timestamp: '2024-01-01T10:15:00Z' },
            { lat: 36.7, lng: 119.5, altitude: 34000, timestamp: '2024-01-01T10:20:00Z' },
            { lat: 35.4, lng: 120.1, altitude: 34500, timestamp: '2024-01-01T10:25:00Z' },
            { lat: 34.1, lng: 120.6, altitude: 35000, timestamp: '2024-01-01T10:30:00Z' },
            { lat: 32.8, lng: 121.0, altitude: 35500, timestamp: '2024-01-01T10:35:00Z' },
            { lat: 31.2304, lng: 121.4737, altitude: 36000, timestamp: '2024-01-01T10:40:00Z' }
        ]
    };

    addFlight(exampleFlight);

    // TODO: 当ADSB数据接口接入后，可以这样调用:
    // loadADSBData().then(data => {
    //     data.forEach(flight => addFlight(flight));
    //     document.getElementById('dataStatus').className = 'status-dot online';
    //     document.getElementById('dataStatusText').textContent = '数据已连接';
    // });
});
