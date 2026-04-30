/**
 * 航空轨迹监控系统 - 时间轴版本
 *
 * 功能：
 * - 地图初始化和管理
 * - 按时间轴显示航班轨迹
 * - 时间轴播放控制
 * - ADSB数据加载和显示
 */

// ==================== 全局变量 ====================
let map;
let isPlaying = false;
let animationSpeed = 1.0;
let animationId = null;

// 时间轴相关
let currentTime = 0;  // 当前时间（毫秒时间戳）
let timeMin = 0;      // 时间范围最小值
let timeMax = 0;      // 时间范围最大值
let timeRange = 0;    // 时间范围跨度

// 航班数据
let allFlightsData = [];     // 所有航班数据
let flightMarkers = {};      // 航班标记
let flightPolylines = {};    // 航班轨迹线
let activeFlights = new Set(); // 当前时间活跃的航班

// ==================== ADSB数据加载 ====================
/**
 * 去重航班数据
 * 如果有重复的callsign，保留轨迹点更多的航班
 */
function deduplicateFlights(flights) {
    const flightMap = new Map();
    let duplicateCount = 0;

    flights.forEach(flight => {
        const callsign = flight.callsign;
        const existing = flightMap.get(callsign);

        if (!existing) {
            // 第一次遇到这个航班号，直接保存
            flightMap.set(callsign, flight);
        } else {
            // 遇到重复航班号，比较轨迹点数量
            duplicateCount++;
            if (flight.route.length > existing.route.length) {
                // 新航班的轨迹点更多，替换
                flightMap.set(callsign, flight);
                console.log(`替换航班 ${callsign}: ${existing.route.length} -> ${flight.route.length} 个轨迹点`);
            } else {
                console.log(`跳过重复航班 ${callsign}: 保留 ${existing.route.length} 个轨迹点的版本`);
            }
        }
    });

    const uniqueFlights = Array.from(flightMap.values());
    console.log(`去重完成: ${flights.length} -> ${uniqueFlights.length} (移除 ${duplicateCount} 个重复)`);

    return uniqueFlights;
}

/**
 * 加载ADSB数据
 */
async function loadADSBData() {
    try {
        console.log('正在加载ADSB数据...');
        const response = await fetch('/data/adsb_flights_combined_simplified.json');
        const rawData = await response.json();

        console.log(`数据加载成功: ${rawData.metadata?.total_flights || 0} 个航班`);

        // 转换数据格式
        const flights = rawData.flights.map(flightData => {
            return {
                flight_id: flightData.callsign,
                callsign: flightData.callsign,
                icao: flightData.icao,
                type: flightData.type,
                country: flightData.country,
                route: flightData.trajectory.map(point => ({
                    lat: point.lat,
                    lng: point.lng,
                    altitude: point.altitude,
                    timestamp: point.timestamp,
                    speed: point.speed,
                    heading: point.heading || 0  // 默认航向为0
                }))
            };
        });

        // 去重处理
        const uniqueFlights = deduplicateFlights(flights);

        console.log(`数据处理完成: ${uniqueFlights.length} 个唯一航班`);
        return uniqueFlights;

    } catch (error) {
        console.error('加载ADSB数据失败:', error);
        return [];
    }
}

// ==================== 地图初始化 ====================

/**
 * 显示加载指示器
 * @param {string} text - 加载文本
 */
function showLoadingIndicator(text = '正在加载...') {
    const indicator = document.getElementById('mapLoadingIndicator');
    if (indicator) {
        indicator.querySelector('.loading-text').textContent = text;
        indicator.classList.add('active');
    }
}

/**
 * 隐藏加载指示器
 */
function hideLoadingIndicator() {
    const indicator = document.getElementById('mapLoadingIndicator');
    if (indicator) {
        indicator.classList.remove('active');
    }
}

/**
 * 初始化Leaflet地图
 */
function initMap() {
    console.log('[DEBUG] 开始初始化地图...');
    console.log('[DEBUG] Leaflet版本:', L.version);

    // 初始化地图，中心设置在中国
    map = L.map('map').setView([35.5, 114.5], 5);
    console.log('[DEBUG] 地图对象已创建');

    // 定义多个基础图层（优化性能配置）
    const baseLayers = {
        '深色主题': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
            minZoom: 3,
            maxNativeZoom: 18,
            tileSize: 256,
            keepBuffer: 1,  // 减少缓冲区
            updateWhenIdle: true,  // 只在空闲时更新
            updateWhenZooming: false,  // 缩放时不立即更新
            zIndex: 1
        }),
        '地形图': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
            maxZoom: 17,
            minZoom: 3,
            maxNativeZoom: 17,
            tileSize: 256,
            keepBuffer: 1,
            updateWhenIdle: true,
            updateWhenZooming: false,
            zIndex: 1
        }),
        '卫星图': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19,
            minZoom: 3,
            maxNativeZoom: 19,
            tileSize: 256,
            keepBuffer: 1,
            updateWhenIdle: true,
            updateWhenZooming: false,
            zIndex: 1
        }),
        '标准地图': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            minZoom: 3,
            maxNativeZoom: 19,
            tileSize: 256,
            keepBuffer: 1,
            updateWhenIdle: true,
            updateWhenZooming: false,
            zIndex: 1
        }),
        '地形+等高线': L.tileLayer('https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.wikimedia.org/">Wikimedia</a>',
            maxZoom: 17,
            minZoom: 3,
            maxNativeZoom: 17,
            tileSize: 256,
            keepBuffer: 1,
            updateWhenIdle: true,
            updateWhenZooming: false,
            zIndex: 1
        })
    };

    console.log('[DEBUG] 图层对象已创建，图层数量:', Object.keys(baseLayers).length);

    // 添加默认图层（深色主题）
    baseLayers['深色主题'].addTo(map);
    console.log('[DEBUG] 默认图层已添加');

    // 添加图层控制器
    console.log('[DEBUG] 正在创建图层控制器...');
    try {
        const layerControl = L.control.layers(baseLayers, null, {
            position: 'topright',
            collapsed: false  // 默认展开
        });
        console.log('[DEBUG] 图层控制器对象已创建:', layerControl);
        layerControl.addTo(map);
        console.log('[DEBUG] 图层控制器已添加到地图');

        // 监听图层切换事件
        map.on('baselayerchange', function(e) {
            console.log('[DEBUG] 切换到图层:', e.name);
            showLoadingIndicator('正在加载 ' + e.name + '...');

            // 检查瓦片加载完成
            const checkLoading = function() {
                const tiles = document.querySelectorAll('.leaflet-tile-container img');
                const loadingTiles = Array.from(tiles).filter(img => !img.complete);

                if (loadingTiles.length === 0) {
                    // 所有瓦片加载完成
                    setTimeout(hideLoadingIndicator, 500);
                } else {
                    // 继续检查
                    setTimeout(checkLoading, 200);
                }
            };

            // 开始检查加载状态
            setTimeout(checkLoading, 100);
        });

    } catch (error) {
        console.error('[ERROR] 添加图层控制器失败:', error);
    }

    // 监听地图移动事件
    map.on('move', function() {
        const center = map.getCenter();
        document.getElementById('mapCenter').textContent =
            `${center.lat.toFixed(2)}°N, ${center.lng.toFixed(2)}°E`;
    });

    console.log('[DEBUG] 地图初始化完成');
}

// ==================== 时间轴管理 ====================
/**
 * 计算时间范围
 */
function calculateTimeRange() {
    if (allFlightsData.length === 0) return;

    let minTime = Infinity;
    let maxTime = -Infinity;

    // 遍历所有航班的所有轨迹点
    allFlightsData.forEach(flight => {
        flight.route.forEach(point => {
            const timestamp = point.timestamp;
            if (timestamp < minTime) minTime = timestamp;
            if (timestamp > maxTime) maxTime = timestamp;
        });
    });

    timeMin = minTime;
    timeMax = maxTime;
    timeRange = maxTime - minTime;
    currentTime = minTime;

    console.log(`时间范围: ${new Date(minTime).toLocaleString()} - ${new Date(maxTime).toLocaleString()}`);
    console.log(`时间跨度: ${(timeRange / 1000 / 3600).toFixed(2)} 小时`);

    // 更新UI
    updateTimeRangeDisplay();
    enableTimeSlider();
}

/**
 * 更新时间范围显示
 */
function updateTimeRangeDisplay() {
    const startDate = new Date(timeMin);
    const endDate = new Date(timeMax);

    const formatDate = (date) => {
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    document.getElementById('timeRange').textContent =
        `${formatDate(startDate)} - ${formatDate(endDate)}`;

    updateTimeDisplay();
}

/**
 * 更新当前时间显示
 */
function updateTimeDisplay() {
    const currentDate = new Date(currentTime);
    const timeStr = currentDate.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;

    // 更新滑块位置
    const slider = document.getElementById('timeSlider');
    const progress = ((currentTime - timeMin) / timeRange) * 100;
    slider.value = progress;
}

/**
 * 启用时间滑块
 */
function enableTimeSlider() {
    const slider = document.getElementById('timeSlider');
    slider.disabled = false;

    slider.addEventListener('input', function(e) {
        if (isPlaying) {
            toggleAnimation(); // 拖动时暂停播放
        }

        const progress = parseFloat(e.target.value);
        currentTime = timeMin + (timeRange * progress / 100);
        updateTimeDisplay();
        updateFlightPositions(currentTime);
    });
}

// ==================== 航班管理 ====================
/**
 * 计算两个坐标点之间的航向角度
 * @param {number} lat1 - 起点纬度
 * @param {number} lng1 - 起点经度
 * @param {number} lat2 - 终点纬度
 * @param {number} lng2 - 终点经度
 * @returns {number} 航向角度（0-360度，0为北，顺时针）
 */
function calculateBearing(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const lat1Rad = lat1 * rad;
    const lat2Rad = lat2 * rad;
    const diffLngRad = (lng2 - lng1) * rad;

    const x = Math.sin(diffLngRad) * Math.cos(lat2Rad);
    const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(diffLngRad);

    const bearing = Math.atan2(x, y) * 180 / Math.PI;
    return (bearing + 360) % 360; // 转换为0-360度
}

/**
 * 创建飞机图标
 * @param {number} heading - 航向角度（0-360度，0为北，90为东）
 */
function createPlaneIcon(heading) {
    // 根据航向旋转图标
    // heading: 0=北, 90=东, 180=南, 270=西
    // SVG飞机默认朝上（北），所以直接使用heading
    const rotation = heading || 0;

    return L.divIcon({
        html: `<div style="
            width: 30px;
            height: 30px;
            background: linear-gradient(135deg, #10b981, #3b82f6);
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${rotation}deg);
            transform-origin: center center;
        ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style="transform: rotate(0deg);">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
        </div>`,
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

/**
 * 初始化所有航班（创建标记和轨迹线）
 */
function initializeFlights() {
    console.log(`正在初始化 ${allFlightsData.length} 个航班...`);

    allFlightsData.forEach(flight => {
        const flightId = flight.flight_id;

        // 绘制完整轨迹线（初始隐藏）
        const latlngs = flight.route.map(point => [point.lat, point.lng]);
        const polyline = L.polyline(latlngs, {
            color: '#3b82f6',
            weight: 2,
            opacity: 0.3,
            dashArray: '5, 10'
        }).addTo(map);

        flightPolylines[flightId] = polyline;

        // 创建飞机标记（初始位置在第一个点）
        const firstPoint = flight.route[0];
        let initialHeading = firstPoint.heading || 0;

        // 如果有第二个点，计算实际航向
        if (flight.route.length > 1) {
            const secondPoint = flight.route[1];
            initialHeading = calculateBearing(
                firstPoint.lat,
                firstPoint.lng,
                secondPoint.lat,
                secondPoint.lng
            );
        }

        const marker = L.marker([firstPoint.lat, firstPoint.lng], {
            icon: createPlaneIcon(initialHeading)
        }).addTo(map);

        // 添加弹出信息
        marker.bindPopup(createPopupContent(flight, 0));

        // 点击标记时显示航班信息
        marker.on('click', function() {
            selectFlight(flightId);
        });

        flightMarkers[flightId] = {
            marker: marker,
            route: flight.route,
            flight: flight,
            visible: false
        };
    });

    // 初始更新到起始时间
    updateFlightPositions(timeMin);

    // 更新统计
    document.getElementById('totalFlightsCount').textContent = allFlightsData.length;
}

/**
 * 创建弹出窗口内容
 */
function createPopupContent(flight, pointIndex) {
    const point = flight.route[pointIndex];
    const date = new Date(point.timestamp);

    return `
        <div style="font-size: 13px; min-width: 200px;">
            <strong style="font-size: 15px;">${flight.callsign}</strong><br>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">
            <strong>机型:</strong> ${flight.type || 'N/A'}<br>
            <strong>国籍:</strong> ${flight.country || 'N/A'}<br>
            <strong>高度:</strong> ${(point.altitude * 3.28084).toFixed(0)} ft<br>
            <strong>速度:</strong> ${point.speed.toFixed(0)} km/h<br>
            <strong>航向:</strong> ${point.heading.toFixed(0)}°<br>
            <strong>时间:</strong> ${date.toLocaleString('zh-CN')}<br>
            <strong>位置:</strong> ${point.lat.toFixed(4)}°, ${point.lng.toFixed(4)}°
        </div>
    `;
}

/**
 * 根据时间更新所有航班位置
 */
function updateFlightPositions(targetTime) {
    activeFlights.clear();

    allFlightsData.forEach(flight => {
        const flightId = flight.flight_id;
        const flightMarker = flightMarkers[flightId];

        // 找到最接近目标时间的轨迹点
        let closestPoint = null;
        let closestIndex = -1;
        let minDiff = Infinity;

        flight.route.forEach((point, index) => {
            const diff = Math.abs(point.timestamp - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestPoint = point;
                closestIndex = index;
            }
        });

        // 如果找到有效的点，并且时间差在合理范围内（5分钟内）
        if (closestPoint && minDiff < 300000) { // 5分钟 = 300000毫秒
            // 计算航向：从当前点到下一个点（如果有的话）
            let calculatedHeading = closestPoint.heading || 0;

            if (closestIndex < flight.route.length - 1) {
                // 有下一个点，计算实际航向
                const nextPoint = flight.route[closestIndex + 1];
                calculatedHeading = calculateBearing(
                    closestPoint.lat,
                    closestPoint.lng,
                    nextPoint.lat,
                    nextPoint.lng
                );
            }

            // 更新标记位置
            flightMarker.marker.setLatLng([closestPoint.lat, closestPoint.lng]);
            flightMarker.marker.setIcon(createPlaneIcon(calculatedHeading));
            flightMarker.marker.setPopupContent(createPopupContent(flight, closestIndex));

            // 显示标记
            if (!flightMarker.visible) {
                flightMarker.marker.addTo(map);
                flightMarker.visible = true;
            }

            activeFlights.add(flightId);
        } else {
            // 隐藏标记
            if (flightMarker.visible) {
                map.removeLayer(flightMarker.marker);
                flightMarker.visible = false;
            }
        }
    });

    // 更新活跃航班计数
    document.getElementById('activeFlightsCount').textContent = activeFlights.size;
    document.getElementById('activeFlights').textContent = activeFlights.size;
}

/**
 * 选中航班
 */
function selectFlight(flightId) {
    document.getElementById('selectedFlight').textContent = flightId;

    // 找到对应航班并聚焦
    const flightMarker = flightMarkers[flightId];
    if (flightMarker && flightMarker.visible) {
        const marker = flightMarker.marker;
        map.setView(marker.getLatLng(), 8);
        marker.openPopup();
    }
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
}

/**
 * 动画循环
 */
let lastFrameTime = 0;
const baseTimeInterval = 100; // 基础时间间隔（毫秒）

function animate(frameTime) {
    if (!isPlaying) return;

    if (!lastFrameTime) lastFrameTime = frameTime;
    const deltaTime = frameTime - lastFrameTime;

    // 根据播放速度计算时间增量
    // 播放速度1x = 实际速度的100倍（让1小时的数据在36秒内播放完）
    const timeIncrement = deltaTime * 100 * animationSpeed;

    if (timeIncrement > 0) {
        currentTime += timeIncrement;

        // 检查是否到达结束时间
        if (currentTime >= timeMax) {
            currentTime = timeMin; // 循环播放
        }

        updateTimeDisplay();
        updateFlightPositions(currentTime);
        lastFrameTime = frameTime;
    }

    animationId = requestAnimationFrame(animate);
}

/**
 * 重置动画
 */
function resetAnimation() {
    if (isPlaying) {
        toggleAnimation();
    }

    currentTime = timeMin;
    updateTimeDisplay();
    updateFlightPositions(currentTime);
}

/**
 * 清除所有航班
 */
function clearFlights() {
    if (isPlaying) {
        toggleAnimation();
    }

    // 清除标记
    Object.values(flightMarkers).forEach(flightMarker => {
        if (flightMarker.visible) {
            map.removeLayer(flightMarker.marker);
            flightMarker.visible = false;
        }
    });

    // 清除轨迹线
    Object.values(flightPolylines).forEach(polyline => {
        map.removeLayer(polyline);
    });

    // 重置数据
    allFlightsData = [];
    flightMarkers = {};
    flightPolylines = {};
    activeFlights.clear();

    currentTime = timeMin;
    updateTimeDisplay();
    document.getElementById('activeFlightsCount').textContent = '0';
    document.getElementById('totalFlightsCount').textContent = '0';
}

// ==================== 事件监听与初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，正在初始化...');

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

    // 加载ADSB数据
    loadADSBData().then(data => {
        if (data.length > 0) {
            console.log(`数据加载成功，正在处理 ${data.length} 个航班...`);

            allFlightsData = data;

            // 计算时间范围
            calculateTimeRange();

            // 初始化航班
            initializeFlights();

            // 更新数据状态
            document.getElementById('dataStatus').className = 'status-dot online';
            document.getElementById('dataStatusText').textContent = '数据已连接';
            document.getElementById('dataSource').textContent = 'ADSB (已连接)';

            console.log('初始化完成！');
        } else {
            console.warn('未加载到任何航班数据');
            document.getElementById('dataStatusText').textContent = '数据加载失败';
        }
    }).catch(error => {
        console.error('数据加载出错:', error);
        document.getElementById('dataStatusText').textContent = '加载错误';
    });
});
