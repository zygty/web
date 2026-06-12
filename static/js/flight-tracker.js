/**
 * Flight Trajectory Monitoring System - Timeline Version
 *
 * Features:
 * - Map initialization and management
 * - Display flight trajectories by timeline
 * - Timeline playback control
 * - ADSB data loading and display
 */

// ==================== Global Variables ====================
let map;
let isPlaying = false;
let animationSpeed = 1.0;
let animationId = null;

// Timeline related
let currentTime = 0;  // Current time (millisecond timestamp)
let timeMin = 0;      // Time range minimum value
let timeMax = 0;      // Time range maximum value
let timeRange = 0;    // Time range span

// Flight data
let allFlightsData = [];     // All flight data
let flightMarkers = {};      // Flight markers
let flightPolylines = {};    // Flight trajectory lines
let activeFlights = new Set(); // Currently active flights

// Prediction related
let predictionPolylines = {}; // Predicted trajectory lines
let selectedFlightId = null;  // Currently selected flight for prediction
let predictionSteps = 5;     // Number of prediction steps

// ==================== ADSB Data Loading ====================
/**
 * Deduplicate flight data
 * If there are duplicate callsigns, keep the flight with more trajectory points
 */
function deduplicateFlights(flights) {
    const flightMap = new Map();
    let duplicateCount = 0;

    flights.forEach(flight => {
        const callsign = flight.callsign;
        const existing = flightMap.get(callsign);

        if (!existing) {
            // First time encountering this flight number, save directly
            flightMap.set(callsign, flight);
        } else {
            // Encountered duplicate flight number, compare trajectory point count
            duplicateCount++;
            if (flight.route.length > existing.route.length) {
                // New flight has more trajectory points, replace
                flightMap.set(callsign, flight);
                console.log(`Replaced flight ${callsign}: ${existing.route.length} -> ${flight.route.length} trajectory points`);
            } else {
                console.log(`Skipped duplicate flight ${callsign}: keeping version with ${existing.route.length} trajectory points`);
            }
        }
    });

    const uniqueFlights = Array.from(flightMap.values());
    console.log(`Deduplication complete: ${flights.length} -> ${uniqueFlights.length} (removed ${duplicateCount} duplicates)`);

    return uniqueFlights;
}

/**
 * Load ADSB data
 */
async function loadADSBData() {
    try {
        console.log('Loading ADSB data...');
        // Use window.location.pathname to get current path prefix
        const pathPrefix = window.location.pathname.replace(/\/$/, '').replace(/\/map$/, '');
        const response = await fetch(`${pathPrefix}/data/adsb_flights_combined_simplified.json`);
        const rawData = await response.json();

        console.log(`Data loaded successfully: ${rawData.metadata?.total_flights || 0} flights`);

        // Convert data format
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
                    heading: point.heading || 0  // Default heading to 0
                }))
            };
        });

        // Deduplication
        const uniqueFlights = deduplicateFlights(flights);

        console.log(`Data processing complete: ${uniqueFlights.length} unique flights`);
        return uniqueFlights;

    } catch (error) {
        console.error('Failed to load ADSB data:', error);
        return [];
    }
}

// ==================== Map Initialization ====================

/**
 * Show loading indicator
 * @param {string} text - Loading text
 */
function showLoadingIndicator(text = 'Loading...') {
    const indicator = document.getElementById('mapLoadingIndicator');
    if (indicator) {
        indicator.querySelector('.loading-text').textContent = text;
        indicator.classList.add('active');
    }
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
    const indicator = document.getElementById('mapLoadingIndicator');
    if (indicator) {
        indicator.classList.remove('active');
    }
}

/**
 * Initialize Leaflet map
 */
function initMap() {
    console.log('[DEBUG] Starting map initialization...');
    console.log('[DEBUG] Leaflet version:', L.version);

    // Initialize map, center set to China
    map = L.map('map').setView([35.5, 114.5], 5);
    console.log('[DEBUG] Map object created');

    // Define multiple base layers (optimized performance configuration)
    const baseLayers = {
        'Dark Theme': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
            minZoom: 3,
            maxNativeZoom: 18,
            tileSize: 256,
            keepBuffer: 1,  // Reduce buffer
            updateWhenIdle: true,  // Only update when idle
            updateWhenZooming: false,  // Don't update immediately when zooming
            zIndex: 1
        }),
        'Terrain Map': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
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
        'Satellite Map': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
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
        'Standard Map': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
        'Terrain+Contours': L.tileLayer('https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png', {
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

    console.log('[DEBUG] Layer objects created, number of layers:', Object.keys(baseLayers).length);

    // Add default layer (Dark Theme)
    baseLayers['Dark Theme'].addTo(map);
    console.log('[DEBUG] Default layer added');

    // Add layer controller
    console.log('[DEBUG] Creating layer controller...');
    try {
        const layerControl = L.control.layers(baseLayers, null, {
            position: 'topright',
            collapsed: false  // Default expanded
        });
        console.log('[DEBUG] Layer controller object created:', layerControl);
        layerControl.addTo(map);
        console.log('[DEBUG] Layer controller added to map');

        // Listen for layer switch event
        map.on('baselayerchange', function(e) {
            console.log('[DEBUG] Switched to layer:', e.name);
            showLoadingIndicator('Loading ' + e.name + '...');

            // Check tile loading completion
            const checkLoading = function() {
                const tiles = document.querySelectorAll('.leaflet-tile-container img');
                const loadingTiles = Array.from(tiles).filter(img => !img.complete);

                if (loadingTiles.length === 0) {
                    // All tiles loaded
                    setTimeout(hideLoadingIndicator, 500);
                } else {
                    // Continue checking
                    setTimeout(checkLoading, 200);
                }
            };

            // Start checking loading status
            setTimeout(checkLoading, 100);
        });

    } catch (error) {
        console.error('[ERROR] Failed to add layer controller:', error);
    }

    // Listen for map move event
    map.on('move', function() {
        const center = map.getCenter();
        document.getElementById('mapCenter').textContent =
            `${center.lat.toFixed(2)}°N, ${center.lng.toFixed(2)}°E`;
    });

    console.log('[DEBUG] Map initialization complete');
}

// ==================== Timeline Management ====================
/**
 * Calculate time range
 */
function calculateTimeRange() {
    if (allFlightsData.length === 0) return;

    let minTime = Infinity;
    let maxTime = -Infinity;

    // Iterate through all trajectory points of all flights
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

    console.log(`Time range: ${new Date(minTime).toLocaleString()} - ${new Date(maxTime).toLocaleString()}`);
    console.log(`Time span: ${(timeRange / 1000 / 3600).toFixed(2)} hours`);

    // Update UI
    updateTimeRangeDisplay();
    enableTimeSlider();
}

/**
 * Update time range display
 */
function updateTimeRangeDisplay() {
    const startDate = new Date(timeMin);
    const endDate = new Date(timeMax);

    // Update date information
    const dateStr = startDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    document.getElementById('dataDate').textContent = dateStr;

    // Update start and end times
    const formatTime = (date) => {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    document.getElementById('startTime').textContent = formatTime(startDate);
    document.getElementById('endTime').textContent = formatTime(endDate);

    // Update data duration
    const durationHours = (timeRange / 1000 / 3600).toFixed(1);
    const durationMinutes = (timeRange / 1000 / 60).toFixed(0);
    document.getElementById('dataDuration').textContent =
        durationHours >= 1 ? `${durationHours} hours` : `${durationMinutes} minutes`;

    updateTimeDisplay();
}

/**
 * Update current time display
 */
function updateTimeDisplay() {
    const currentDate = new Date(currentTime);
    const timeStr = currentDate.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;

    // Update slider position
    const slider = document.getElementById('timeSlider');
    const progress = ((currentTime - timeMin) / timeRange) * 100;
    slider.value = progress;
}

/**
 * Enable time slider
 */
function enableTimeSlider() {
    const slider = document.getElementById('timeSlider');
    slider.disabled = false;

    slider.addEventListener('input', function(e) {
        if (isPlaying) {
            toggleAnimation(); // Pause playback when dragging
        }

        const progress = parseFloat(e.target.value);
        currentTime = timeMin + (timeRange * progress / 100);
        updateTimeDisplay();
        updateFlightPositions(currentTime);
    });
}

// ==================== Flight Management ====================
/**
 * Calculate bearing angle between two coordinate points
 * @param {number} lat1 - Start point latitude
 * @param {number} lng1 - Start point longitude
 * @param {number} lat2 - End point latitude
 * @param {number} lng2 - End point longitude
 * @returns {number} Bearing angle (0-360 degrees, 0 is north, clockwise)
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
    return (bearing + 360) % 360; // Convert to 0-360 degrees
}

/**
 * Create plane icon
 * @param {number} heading - Heading angle (0-360 degrees, 0 is north, 90 is east)
 */
function createPlaneIcon(heading) {
    // Rotate icon based on heading
    // heading: 0=north, 90=east, 180=south, 270=west
    // SVG plane defaults to facing up (north), so use heading directly
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
 * Initialize all flights (create markers and trajectory lines)
 */
function initializeFlights() {
    console.log(`Initializing ${allFlightsData.length} flights...`);

    allFlightsData.forEach(flight => {
        const flightId = flight.flight_id;

        // Draw complete trajectory line (initially hidden)
        const latlngs = flight.route.map(point => [point.lat, point.lng]);
        const polyline = L.polyline(latlngs, {
            color: '#3b82f6',
            weight: 2,
            opacity: 0.3,
            dashArray: '5, 10'
        }).addTo(map);

        flightPolylines[flightId] = polyline;

        // Create plane marker (initial position at first point)
        const firstPoint = flight.route[0];
        let initialHeading = firstPoint.heading || 0;

        // If there's a second point, calculate actual heading
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

        // Add popup information
        marker.bindPopup(createPopupContent(flight, 0));

        // Show flight information when marker is clicked
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

    // Initial update to start time
    updateFlightPositions(timeMin);

    // Update statistics
    document.getElementById('totalFlightsCount').textContent = allFlightsData.length;
}

/**
 * Create popup window content
 */
function createPopupContent(flight, pointIndex) {
    const point = flight.route[pointIndex];
    const date = new Date(point.timestamp);

    return `
        <div style="font-size: 13px; min-width: 200px;">
            <strong style="font-size: 15px;">${flight.callsign}</strong><br>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">
            <strong>Aircraft Type:</strong> ${flight.type || 'N/A'}<br>
            <strong>Country:</strong> ${flight.country || 'N/A'}<br>
            <strong>Altitude:</strong> ${(point.altitude * 3.28084).toFixed(0)} ft<br>
            <strong>Speed:</strong> ${point.speed.toFixed(0)} km/h<br>
            <strong>Heading:</strong> ${point.heading.toFixed(0)}°<br>
            <strong>Time:</strong> ${date.toLocaleString('en-US')}<br>
            <strong>Position:</strong> ${point.lat.toFixed(4)}°, ${point.lng.toFixed(4)}°
        </div>
    `;
}

/**
 * Update all flight positions based on time
 */
function updateFlightPositions(targetTime) {
    activeFlights.clear();

    allFlightsData.forEach(flight => {
        const flightId = flight.flight_id;
        const flightMarker = flightMarkers[flightId];

        // Find trajectory point closest to target time
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

        // If valid point found and time difference is within reasonable range (within 5 minutes)
        if (closestPoint && minDiff < 300000) { // 5 minutes = 300000 milliseconds
            // Calculate heading: from current point to next point (if available)
            let calculatedHeading = closestPoint.heading || 0;

            if (closestIndex < flight.route.length - 1) {
                // Has next point, calculate actual heading
                const nextPoint = flight.route[closestIndex + 1];
                calculatedHeading = calculateBearing(
                    closestPoint.lat,
                    closestPoint.lng,
                    nextPoint.lat,
                    nextPoint.lng
                );
            }

            // Update marker position
            flightMarker.marker.setLatLng([closestPoint.lat, closestPoint.lng]);
            flightMarker.marker.setIcon(createPlaneIcon(calculatedHeading));
            flightMarker.marker.setPopupContent(createPopupContent(flight, closestIndex));

            // Show marker
            if (!flightMarker.visible) {
                flightMarker.marker.addTo(map);
                flightMarker.visible = true;
            }

            activeFlights.add(flightId);
        } else {
            // Hide marker
            if (flightMarker.visible) {
                map.removeLayer(flightMarker.marker);
                flightMarker.visible = false;
            }
        }
    });

    // Update active flight count
    document.getElementById('activeFlightsCount').textContent = activeFlights.size;
    document.getElementById('activeFlights').textContent = activeFlights.size;

    // Update flight list display (if no flight selected, show all active flights)
    const selectedFlightText = document.getElementById('selectedFlight').textContent;
    if (selectedFlightText === 'None' || selectedFlightText === '') {
        updateFlightListDisplay(null); // Show all active flights
    }
}

/**
 * Select flight
 */
function selectFlight(flightId) {
    console.log('Selected flight:', flightId);
    document.getElementById('selectedFlight').textContent = flightId;

    // Find corresponding flight and focus
    const flightMarker = flightMarkers[flightId];
    if (flightMarker && flightMarker.visible) {
        const marker = flightMarker.marker;
        map.setView(marker.getLatLng(), 8);
        marker.openPopup();
    }

    // Update flight list display to show selected flight details
    updateFlightListDisplay(flightId);
}

/**
 * Update flight list display
 */
function updateFlightListDisplay(selectedFlightId = null) {
    const flightListContainer = document.getElementById('flightList');
    if (!flightListContainer) return;

    if (selectedFlightId) {
        // Show selected flight details
        const flightMarker = flightMarkers[selectedFlightId];
        if (!flightMarker) return;

        const flight = flightMarker.flight;
        const currentPointIndex = getCurrentPointIndex(flight, currentTime);
        const point = flight.route[currentPointIndex] || flight.route[0];

        const date = new Date(point.timestamp);
        const altitudeFt = (point.altitude * 3.28084).toFixed(0);
        const speedKmh = point.speed.toFixed(0);

        flightListContainer.innerHTML = `
            <div class="flight-item selected">
                <div class="flight-item-header">
                    <span class="flight-code">${flight.callsign}</span>
                    <span class="flight-status active">Selected</span>
                </div>
                <div class="flight-info">
                    <div><strong>Aircraft Type:</strong> ${flight.type || 'N/A'}</div>
                    <div><strong>Country:</strong> ${flight.country || 'N/A'}</div>
                    <div><strong>Altitude:</strong> ${altitudeFt} ft</div>
                    <div><strong>Speed:</strong> ${speedKmh} km/h</div>
                    <div><strong>Heading:</strong> ${point.heading.toFixed(0)}°</div>
                    <div><strong>Time:</strong> ${date.toLocaleString('en-US')}</div>
                    <div><strong>Position:</strong> ${point.lat.toFixed(4)}°N, ${point.lng.toFixed(4)}°E</div>
                </div>
            </div>
        `;
    } else {
        // Show all active flights list
        if (activeFlights.size === 0) {
            flightListContainer.innerHTML = `
                <div class="flight-item">
                    <div class="flight-item-header">
                        <span class="flight-code">No Active Flights</span>
                        <span class="flight-status inactive">--</span>
                    </div>
                    <div class="flight-info">No active flights at current time</div>
                </div>
            `;
            return;
        }

        let html = '';
        activeFlights.forEach(flightId => {
            const flightMarker = flightMarkers[flightId];
            if (!flightMarker) return;

            const flight = flightMarker.flight;
            const currentPointIndex = getCurrentPointIndex(flight, currentTime);
            const point = flight.route[currentPointIndex] || flight.route[0];
            const altitudeFt = (point.altitude * 3.28084).toFixed(0);
            const speedKmh = point.speed.toFixed(0);

            html += `
                <div class="flight-item" onclick="selectFlight('${flightId}')" style="cursor: pointer;">
                    <div class="flight-item-header">
                        <span class="flight-code">${flight.callsign}</span>
                        <span class="flight-status active">Active</span>
                    </div>
                    <div class="flight-info">${flight.country} | Altitude: ${altitudeFt}ft | Speed: ${speedKmh}km/h</div>
                </div>
            `;
        });

        flightListContainer.innerHTML = html || '<div class="flight-info">No active flights</div>';
    }
}

/**
 * Get trajectory point index corresponding to current time
 */
function getCurrentPointIndex(flight, targetTime) {
    let closestIndex = -1;
    let minDiff = Infinity;

    flight.route.forEach((point, index) => {
        const diff = Math.abs(point.timestamp - targetTime);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = index;
        }
    });

    return closestIndex;
}

// ==================== Animation Control ====================
/**
 * Play/pause animation
 */
function toggleAnimation() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('playPauseBtn');

    if (isPlaying) {
        btn.innerHTML = '<span>⏸</span><span>Pause</span>';
        animate();
    } else {
        btn.innerHTML = '<span>▶</span><span>Play</span>';
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    }
}

/**
 * Animation loop
 */
let lastFrameTime = 0;
const baseTimeInterval = 100; // Base time interval (milliseconds)

function animate(frameTime) {
    if (!isPlaying) return;

    if (!lastFrameTime) lastFrameTime = frameTime;
    const deltaTime = frameTime - lastFrameTime;

    // Calculate time increment based on playback speed
    // Playback speed 1x = 100x actual speed (plays 1 hour of data in 36 seconds)
    const timeIncrement = deltaTime * 100 * animationSpeed;

    if (timeIncrement > 0) {
        currentTime += timeIncrement;

        // Check if end time reached
        if (currentTime >= timeMax) {
            currentTime = timeMin; // Loop playback
        }

        updateTimeDisplay();
        updateFlightPositions(currentTime);
        lastFrameTime = frameTime;
    }

    animationId = requestAnimationFrame(animate);
}

/**
 * Reset animation
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
 * Clear all flights
 */
function clearFlights() {
    if (isPlaying) {
        toggleAnimation();
    }

    // Clear markers
    Object.values(flightMarkers).forEach(flightMarker => {
        if (flightMarker.visible) {
            map.removeLayer(flightMarker.marker);
            flightMarker.visible = false;
        }
    });

    // Clear trajectory lines
    Object.values(flightPolylines).forEach(polyline => {
        map.removeLayer(polyline);
    });

    // Reset data
    allFlightsData = [];
    flightMarkers = {};
    flightPolylines = {};
    activeFlights.clear();

    currentTime = timeMin;
    updateTimeDisplay();
    document.getElementById('activeFlightsCount').textContent = '0';
    document.getElementById('totalFlightsCount').textContent = '0';
}

// ==================== Event Listeners and Initialization ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded, initializing...');

    // Initialize map
    initMap();

    // Play/pause button
    document.getElementById('playPauseBtn').addEventListener('click', toggleAnimation);

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetAnimation);

    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearFlights);

    // Speed slider
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', function(e) {
            animationSpeed = parseFloat(e.target.value);
            document.getElementById('speedValue').textContent = animationSpeed.toFixed(1);
            console.log('Playback speed changed:', animationSpeed);
        });
        console.log('Speed slider event listener attached');
    } else {
        console.error('Speed slider element not found');
    }

    // Load ADSB data
    loadADSBData().then(data => {
        if (data.length > 0) {
            console.log(`Data loaded successfully, processing ${data.length} flights...`);

            allFlightsData = data;

            // Calculate time range
            calculateTimeRange();

            // Initialize flights
            initializeFlights();

            // Update data status
            document.getElementById('dataStatus').className = 'status-dot online';
            document.getElementById('dataStatusText').textContent = 'Data Connected';
            document.getElementById('dataSource').textContent = 'ADSB (Connected)';

            console.log('Initialization complete!');
        } else {
            console.warn('No flight data loaded');
            document.getElementById('dataStatusText').textContent = 'Data Load Failed';
        }
    }).catch(error => {
        console.error('Data loading error:', error);
        document.getElementById('dataStatusText').textContent = 'Load Error';
    });
});

// ==================== Trajectory Prediction Functions ====================
/**
 * Predict trajectory for selected flight
 */
async function predictTrajectory() {
    if (!selectedFlightId) {
        alert('Please select a flight first by clicking on a flight in the list or map');
        return;
    }

    const flightData = allFlightsData.find(f => f.flight_id === selectedFlightId);
    if (!flightData) {
        alert('Selected flight data not found');
        return;
    }

    // Need at least 10 trajectory points for prediction
    if (flightData.route.length < 10) {
        alert(`Flight ${selectedFlightId} has insufficient trajectory points (${flightData.route.length} < 10 required)`);
        return;
    }

    const predictBtn = document.getElementById('predictBtn');
    predictBtn.disabled = true;
    predictBtn.innerHTML = '<span>⏳</span><span>Predicting...</span>';

    try {
        // Prepare trajectory data for API (last 10 points)
        const trajectory = flightData.route.slice(-10).map(point => ({
            lat: point.lat,
            lng: point.lng,
            altitude: point.altitude,
            speed: point.speed,
            heading: point.heading || 0
        }));

        console.log('Sending prediction request for flight:', selectedFlightId);
        console.log('Trajectory points:', trajectory.length);

        const response = await fetch('http://localhost:5001/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                trajectory: trajectory,
                steps: predictionSteps
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const result = await response.json();
        console.log('Prediction result:', result);

        if (result.predictions && result.predictions.length > 0) {
            displayPredictedTrajectory(selectedFlightId, result.predictions, flightData.route);
            alert(`Successfully predicted ${result.predictions.length} future points for flight ${selectedFlightId}`);
        } else {
            throw new Error('No predictions returned');
        }

    } catch (error) {
        console.error('Prediction failed:', error);
        alert(`Prediction failed: ${error.message}\nMake sure the prediction API server is running on http://localhost:5001`);
    } finally {
        predictBtn.disabled = false;
        predictBtn.innerHTML = '<span>🔮</span><span>Predict Selected</span>';
    }
}

/**
 * Display predicted trajectory on map
 */
function displayPredictedTrajectory(flightId, predictions, historicalRoute) {
    // Remove old prediction if exists
    if (predictionPolylines[flightId]) {
        // Remove polyline
        if (predictionPolylines[flightId].polyline) {
            map.removeLayer(predictionPolylines[flightId].polyline);
        }
        // Remove markers
        if (predictionPolylines[flightId].markers) {
            predictionPolylines[flightId].markers.forEach(marker => {
                map.removeLayer(marker);
            });
        }
    }

    // Initialize object to store prediction elements
    predictionPolylines[flightId] = {
        polyline: null,
        markers: []
    };

    // Get last known position
    const lastPoint = historicalRoute[historicalRoute.length - 1];

    // Build predicted path from last position through predictions
    const predictedPath = [
        [lastPoint.lat, lastPoint.lng],
        ...predictions.map(p => [p.lat, p.lng])
    ];

    // Create dashed polyline for predicted path
    const predictionLine = L.polyline(predictedPath, {
        color: '#f59e0b',  // Orange color for predictions
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 10'
    }).addTo(map);

    // Store the polyline
    predictionPolylines[flightId].polyline = predictionLine;

    // Add markers for prediction points
    predictions.forEach((point, index) => {
        const marker = L.circleMarker([point.lat, point.lng], {
            radius: 6,
            fillColor: '#f59e0b',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);

        // Add popup with prediction info
        const timeOffset = index * 30; // Assuming 30-second intervals
        marker.bindPopup(`
            <div style="font-size: 12px;">
                <strong>Prediction Point ${index + 1}</strong><br>
                <strong>Time:</strong> T+${timeOffset}s<br>
                <strong>Position:</strong> ${point.lat.toFixed(4)}°, ${point.lng.toFixed(4)}°<br>
                <strong>Altitude:</strong> ${(point.altitude * 3.28084).toFixed(0)} ft<br>
                <strong>Speed:</strong> ${point.speed.toFixed(0)} km/h
            </div>
        `);

        // Store marker reference
        predictionPolylines[flightId].markers.push(marker);
    });

    // Fit map to show both historical and predicted paths
    const group = L.featureGroup([
        flightPolylines[flightId],
        predictionLine
    ]);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
}

/**
 * Clear predicted trajectories
 */
function clearPredictions() {
    Object.keys(predictionPolylines).forEach(flightId => {
        const predictionData = predictionPolylines[flightId];
        if (predictionData) {
            // Remove polyline
            if (predictionData.polyline) {
                map.removeLayer(predictionData.polyline);
            }
            // Remove markers
            if (predictionData.markers) {
                predictionData.markers.forEach(marker => {
                    map.removeLayer(marker);
                });
            }
        }
    });
    predictionPolylines = {};
    console.log('All predictions cleared');
}

// ==================== Prediction Event Listeners ====================
document.addEventListener('DOMContentLoaded', function() {
    // Prediction steps slider
    const stepsSlider = document.getElementById('predictionStepsSlider');
    if (stepsSlider) {
        stepsSlider.addEventListener('input', function(e) {
            predictionSteps = parseInt(e.target.value);
            document.getElementById('predictionSteps').textContent = predictionSteps;
        });
    }

    // Predict button
    const predictBtn = document.getElementById('predictBtn');
    if (predictBtn) {
        predictBtn.addEventListener('click', predictTrajectory);
    }

    // Clear prediction button
    const clearPredictionBtn = document.getElementById('clearPredictionBtn');
    if (clearPredictionBtn) {
        clearPredictionBtn.addEventListener('click', clearPredictions);
    }
});

// Update selectFlight function to set selectedFlightId
const originalSelectFlight = selectFlight;
selectFlight = function(flightId) {
    originalSelectFlight.call(this, flightId);
    selectedFlightId = flightId;
    console.log('Flight selected for prediction:', flightId);
};
