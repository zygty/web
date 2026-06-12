#!/usr/bin/env python3
"""
Generate SVG assets for the standalone agent-story page.

The visuals are derived from the exported ADS-B sample flights so the
explanation page can embed map-like screenshots without depending on
external tile servers or a running local web server.
"""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path("/Users/liziqi/Desktop/web")
DATA_FILE = ROOT / "adsb_server_output" / "map_data" / "sample_flights.json"
OUT_DIR = ROOT / "static" / "images" / "agent-story"


PALETTE = [
    "#67e8f9",
    "#22c55e",
    "#f59e0b",
    "#fb7185",
    "#a78bfa",
    "#38bdf8",
    "#f97316",
    "#2dd4bf",
    "#fde047",
    "#c084fc",
]


CITY_POINTS = [
    ("北京", 116.4074, 39.9042),
    ("上海", 121.4737, 31.2304),
    ("广州", 113.2644, 23.1291),
    ("成都", 104.0665, 30.5728),
    ("乌鲁木齐", 87.6168, 43.8256),
]


CHINA_OUTLINE = [
    (73.6, 39.5),
    (78.8, 47.8),
    (88.2, 49.6),
    (97.6, 47.5),
    (108.5, 49.5),
    (124.0, 53.0),
    (134.0, 48.6),
    (131.2, 43.2),
    (124.5, 39.0),
    (121.0, 31.0),
    (118.5, 24.6),
    (110.0, 20.8),
    (108.8, 18.0),
    (107.6, 21.0),
    (104.0, 22.8),
    (98.4, 24.6),
    (92.0, 28.0),
    (86.2, 29.2),
    (80.6, 31.6),
    (77.2, 33.6),
    (73.6, 39.5),
]

TAIWAN_OUTLINE = [
    (121.6, 25.2),
    (121.8, 24.1),
    (121.3, 22.2),
    (120.6, 22.0),
    (120.1, 23.4),
    (120.6, 24.6),
    (121.6, 25.2),
]

HAINAN_OUTLINE = [
    (109.1, 20.3),
    (110.2, 20.1),
    (110.6, 19.2),
    (109.8, 18.2),
    (108.8, 18.1),
    (108.5, 19.2),
    (109.1, 20.3),
]


def project(lng: float, lat: float, bounds: tuple[float, float, float, float], frame: tuple[float, float, float, float]) -> tuple[float, float]:
    min_lng, max_lng, min_lat, max_lat = bounds
    x0, y0, width, height = frame
    x = x0 + (lng - min_lng) / (max_lng - min_lng) * width
    y = y0 + height - (lat - min_lat) / (max_lat - min_lat) * height
    return x, y


def polyline_path(points: list[tuple[float, float]]) -> str:
    if not points:
        return ""
    start = f"M {points[0][0]:.2f} {points[0][1]:.2f}"
    rest = " ".join(f"L {x:.2f} {y:.2f}" for x, y in points[1:])
    return f"{start} {rest}".strip()


def svg_header(width: int, height: int, title: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" fill="none">',
        f"<title>{title}</title>",
        "<defs>",
        '  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
        '    <stop offset="0%" stop-color="#07111f" />',
        '    <stop offset="55%" stop-color="#0f2740" />',
        '    <stop offset="100%" stop-color="#071a2d" />',
        "  </linearGradient>",
        '  <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">',
        '    <stop offset="0%" stop-color="rgba(15, 35, 56, 0.92)" />',
        '    <stop offset="100%" stop-color="rgba(7, 17, 31, 0.92)" />',
        "  </linearGradient>",
        '  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">',
        '    <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#02070f" flood-opacity="0.45" />',
        "  </filter>",
        '  <style><![CDATA[',
        "    .title { font: 700 34px 'PingFang SC','Microsoft YaHei',sans-serif; fill: #f8fafc; }",
        "    .subtitle { font: 500 16px 'PingFang SC','Microsoft YaHei',sans-serif; fill: #9fb7cf; }",
        "    .label { font: 600 15px 'PingFang SC','Microsoft YaHei',sans-serif; fill: #d9e6f2; }",
        "    .small { font: 500 12px 'PingFang SC','Microsoft YaHei',sans-serif; fill: #89a4bf; }",
        "    .tiny { font: 500 11px 'PingFang SC','Microsoft YaHei',sans-serif; fill: #7e98b2; }",
        "    .mono { font: 600 13px ui-monospace,SFMono-Regular,Menlo,monospace; fill: #e2e8f0; }",
        "  ]]></style>",
        "</defs>",
    ]


def draw_graticule(parts: list[str], bounds: tuple[float, float, float, float], frame: tuple[float, float, float, float], lng_step: int = 10, lat_step: int = 5) -> None:
    min_lng, max_lng, min_lat, max_lat = bounds
    x0, y0, width, height = frame

    for lng in range(math.ceil(min_lng / lng_step) * lng_step, math.floor(max_lng / lng_step) * lng_step + 1, lng_step):
        x, _ = project(lng, min_lat, bounds, frame)
        parts.append(f'<line x1="{x:.2f}" y1="{y0:.2f}" x2="{x:.2f}" y2="{y0 + height:.2f}" stroke="rgba(137,164,191,0.18)" stroke-width="1" />')
        parts.append(f'<text x="{x + 4:.2f}" y="{y0 + height - 8:.2f}" class="tiny">{lng}E</text>')

    for lat in range(math.ceil(min_lat / lat_step) * lat_step, math.floor(max_lat / lat_step) * lat_step + 1, lat_step):
        _, y = project(min_lng, lat, bounds, frame)
        parts.append(f'<line x1="{x0:.2f}" y1="{y:.2f}" x2="{x0 + width:.2f}" y2="{y:.2f}" stroke="rgba(137,164,191,0.18)" stroke-width="1" />')
        parts.append(f'<text x="{x0 + 8:.2f}" y="{y - 6:.2f}" class="tiny">{lat}N</text>')


def draw_outline(parts: list[str], bounds: tuple[float, float, float, float], frame: tuple[float, float, float, float]) -> None:
    for poly in (CHINA_OUTLINE, TAIWAN_OUTLINE, HAINAN_OUTLINE):
        pts = [project(lng, lat, bounds, frame) for lng, lat in poly]
        parts.append(
            f'<path d="{polyline_path(pts)}" stroke="rgba(148,163,184,0.68)" stroke-width="2.2" '
            'stroke-linejoin="round" fill="rgba(15,23,42,0.14)" />'
        )

    for name, lng, lat in CITY_POINTS:
        x, y = project(lng, lat, bounds, frame)
        parts.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="3.2" fill="#cbd5e1" />')
        parts.append(f'<text x="{x + 7:.2f}" y="{y - 8:.2f}" class="tiny">{name}</text>')


def draw_routes(parts: list[str], flights: list[dict], bounds: tuple[float, float, float, float], frame: tuple[float, float, float, float], alpha: float = 0.92) -> None:
    for idx, flight in enumerate(flights):
        color = PALETTE[idx % len(PALETTE)]
        coords = [project(p["lng"], p["lat"], bounds, frame) for p in flight["points"]]
        path = polyline_path(coords)
        parts.append(f'<path d="{path}" stroke="{color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" opacity="{alpha}" />')

        sx, sy = coords[0]
        ex, ey = coords[-1]
        parts.append(f'<circle cx="{sx:.2f}" cy="{sy:.2f}" r="3.2" fill="{color}" opacity="0.6" />')
        parts.append(f'<circle cx="{ex:.2f}" cy="{ey:.2f}" r="5.0" fill="{color}" stroke="#e2e8f0" stroke-width="1.6" />')


def draw_badges(parts: list[str], items: list[tuple[str, str]], x: int, y: int, gap: int = 12) -> None:
    cursor_x = x
    for label, value in items:
        width = max(120, 18 + len(label + value) * 8)
        parts.append(f'<rect x="{cursor_x}" y="{y}" width="{width}" height="38" rx="19" fill="rgba(8,18,33,0.72)" stroke="rgba(103,232,249,0.22)" />')
        parts.append(f'<text x="{cursor_x + 16}" y="{y + 23}" class="small">{label}<tspan fill="#f8fafc"> {value}</tspan></text>')
        cursor_x += width + gap


def create_dashboard_svg(data: dict) -> str:
    width, height = 1600, 940
    parts = svg_header(width, height, "航空地图仪表板示意")
    parts.append(f'<rect width="{width}" height="{height}" fill="url(#bg)" rx="0" />')
    parts.append('<rect x="36" y="32" width="1528" height="876" rx="34" fill="rgba(6,12,24,0.84)" stroke="rgba(103,232,249,0.12)" filter="url(#shadow)" />')

    sidebar_x, sidebar_y, sidebar_w, sidebar_h = 68, 70, 406, 800
    map_x, map_y, map_w, map_h = 506, 70, 1004, 800
    parts.append(f'<rect x="{sidebar_x}" y="{sidebar_y}" width="{sidebar_w}" height="{sidebar_h}" rx="28" fill="url(#panel)" stroke="rgba(103,232,249,0.12)" />')
    parts.append(f'<rect x="{map_x}" y="{map_y}" width="{map_w}" height="{map_h}" rx="28" fill="rgba(8,16,30,0.8)" stroke="rgba(103,232,249,0.12)" />')

    parts.append(f'<text x="{sidebar_x + 30}" y="{sidebar_y + 48}" class="title">Agent × 航空地图</text>')
    parts.append(f'<text x="{sidebar_x + 30}" y="{sidebar_y + 78}" class="subtitle">把数据清洗、样本导出、前端展示和轨迹预测串成一个可操作系统</text>')

    panel_titles = ["数据状态", "时间轴控制", "AI 预测", "Agent 交付物"]
    panel_y = [sidebar_y + 118, sidebar_y + 296, sidebar_y + 472, sidebar_y + 640]
    panel_h = [148, 146, 138, 186]
    for title, py, ph in zip(panel_titles, panel_y, panel_h):
        parts.append(f'<rect x="{sidebar_x + 24}" y="{py}" width="{sidebar_w - 48}" height="{ph}" rx="22" fill="rgba(12,25,43,0.78)" stroke="rgba(148,163,184,0.12)" />')
        parts.append(f'<text x="{sidebar_x + 44}" y="{py + 34}" class="label">{title}</text>')

    meta = data["metadata"]
    status_rows = [
        ("Active Flights", str(meta["n_flights"])),
        ("Trajectory Points", str(meta["total_points"])),
        ("Quality Summary", "GOOD 99.91%"),
        ("Data Window", meta["time_window"]),
    ]
    for idx, (label, value) in enumerate(status_rows):
        y = panel_y[0] + 64 + idx * 22
        parts.append(f'<text x="{sidebar_x + 46}" y="{y}" class="small">{label}</text>')
        parts.append(f'<text x="{sidebar_x + 216}" y="{y}" class="mono">{value}</text>')

    parts.append(f'<text x="{sidebar_x + 46}" y="{panel_y[1] + 66}" class="small">Start</text>')
    parts.append(f'<text x="{sidebar_x + 210}" y="{panel_y[1] + 66}" class="mono">17:00 UTC</text>')
    parts.append(f'<text x="{sidebar_x + 46}" y="{panel_y[1] + 92}" class="small">End</text>')
    parts.append(f'<text x="{sidebar_x + 210}" y="{panel_y[1] + 92}" class="mono">18:00 UTC</text>')
    parts.append(f'<text x="{sidebar_x + 46}" y="{panel_y[1] + 118}" class="small">Playback</text>')
    parts.append(f'<text x="{sidebar_x + 210}" y="{panel_y[1] + 118}" class="mono">0.1x - 10x</text>')
    parts.append(f'<rect x="{sidebar_x + 44}" y="{panel_y[1] + 128}" width="314" height="8" rx="4" fill="rgba(148,163,184,0.18)" />')
    parts.append(f'<rect x="{sidebar_x + 44}" y="{panel_y[1] + 128}" width="188" height="8" rx="4" fill="url(#panel)" stroke="none" />')
    parts.append(f'<circle cx="{sidebar_x + 232}" cy="{panel_y[1] + 132}" r="10" fill="#67e8f9" />')

    parts.append(f'<text x="{sidebar_x + 46}" y="{panel_y[2] + 66}" class="small">Model</text>')
    parts.append(f'<text x="{sidebar_x + 210}" y="{panel_y[2] + 66}" class="mono">2-layer LSTM</text>')
    parts.append(f'<text x="{sidebar_x + 46}" y="{panel_y[2] + 92}" class="small">Steps</text>')
    parts.append(f'<text x="{sidebar_x + 210}" y="{panel_y[2] + 92}" class="mono">1 - 10</text>')
    parts.append(f'<text x="{sidebar_x + 46}" y="{panel_y[2] + 118}" class="small">Current Flight</text>')
    parts.append(f'<text x="{sidebar_x + 210}" y="{panel_y[2] + 118}" class="mono">{data["flights"][0]["callsign"]}</text>')

    deliverables = [
        "build_clean_adsb.py",
        "generate_clean_report.py",
        "export_map_sample.py",
        "flight_prediction_api.py",
        "flight-tracker.js",
    ]
    for idx, name in enumerate(deliverables):
        y = panel_y[3] + 60 + idx * 24
        parts.append(f'<circle cx="{sidebar_x + 50}" cy="{y - 4}" r="4" fill="#22c55e" />')
        parts.append(f'<text x="{sidebar_x + 64}" y="{y}" class="mono">{name}</text>')

    parts.append(f'<text x="{map_x + 34}" y="{map_y + 48}" class="title">地图监控主视图</text>')
    parts.append(f'<text x="{map_x + 34}" y="{map_y + 78}" class="subtitle">Leaflet 页面最终展示的是样本轨迹、时间轴、预测入口和数据状态，而这些都来自前面 Agent 驱动的流水线产物。</text>')

    bounds = (76.0, 128.0, 14.0, 51.5)
    frame = (map_x + 34, map_y + 110, map_w - 68, map_h - 170)
    draw_graticule(parts, bounds, frame)
    draw_outline(parts, bounds, frame)
    draw_routes(parts, data["flights"], bounds, frame)

    draw_badges(
        parts,
        [
            ("样本航班", "10"),
            ("轨迹点", "2034"),
            ("时间窗口", "1 hour"),
        ],
        map_x + 34,
        map_y + map_h - 50,
    )

    legend_x = map_x + map_w - 226
    legend_y = map_y + 34
    parts.append(f'<rect x="{legend_x}" y="{legend_y}" width="188" height="122" rx="18" fill="rgba(6,12,24,0.72)" stroke="rgba(148,163,184,0.14)" />')
    parts.append(f'<text x="{legend_x + 18}" y="{legend_y + 28}" class="label">Legend</text>')
    legend_items = [("历史轨迹", "#67e8f9"), ("实时位置", "#22c55e"), ("预测入口", "#f59e0b")]
    for idx, (name, color) in enumerate(legend_items):
        y = legend_y + 54 + idx * 22
        parts.append(f'<line x1="{legend_x + 20}" y1="{y}" x2="{legend_x + 52}" y2="{y}" stroke="{color}" stroke-width="4" stroke-linecap="round" />')
        parts.append(f'<text x="{legend_x + 66}" y="{y + 5}" class="small">{name}</text>')

    parts.append("</svg>")
    return "\n".join(parts)


def create_overview_svg(data: dict) -> str:
    width, height = 1500, 980
    parts = svg_header(width, height, "中国空域轨迹总览")
    parts.append(f'<rect width="{width}" height="{height}" fill="url(#bg)" />')
    parts.append('<rect x="34" y="30" width="1432" height="918" rx="34" fill="rgba(8,16,30,0.84)" stroke="rgba(103,232,249,0.12)" filter="url(#shadow)" />')
    parts.append('<text x="76" y="96" class="title">中国空域轨迹样本总览</text>')
    parts.append('<text x="76" y="130" class="subtitle">对话中导出的 sample_flights.json 包含 10 架飞机、2034 个点，这一步是前端 Leaflet 可视化真正吃进去的数据接口。</text>')
    draw_badges(parts, [("来源", "sample_flights.json"), ("时间", data["metadata"]["time_window"]), ("质量", "GOOD only")], 76, 152)

    bounds = (76.0, 128.0, 14.0, 51.5)
    frame = (74, 218, 1120, 654)
    draw_graticule(parts, bounds, frame)
    draw_outline(parts, bounds, frame)
    draw_routes(parts, data["flights"], bounds, frame)

    label_box_x, label_box_y = 1224, 216
    parts.append(f'<rect x="{label_box_x}" y="{label_box_y}" width="206" height="656" rx="26" fill="rgba(10,20,36,0.92)" stroke="rgba(148,163,184,0.14)" />')
    parts.append(f'<text x="{label_box_x + 22}" y="{label_box_y + 34}" class="label">Sample Flights</text>')
    for idx, flight in enumerate(data["flights"]):
        y = label_box_y + 72 + idx * 56
        color = PALETTE[idx % len(PALETTE)]
        parts.append(f'<rect x="{label_box_x + 18}" y="{y - 20}" width="170" height="42" rx="16" fill="rgba(15,35,56,0.74)" stroke="rgba(148,163,184,0.1)" />')
        parts.append(f'<circle cx="{label_box_x + 38}" cy="{y + 1}" r="7" fill="{color}" />')
        parts.append(f'<text x="{label_box_x + 54}" y="{y - 2}" class="label">{flight["callsign"]}</text>')
        parts.append(f'<text x="{label_box_x + 54}" y="{y + 16}" class="tiny">{flight["n_points"]} points</text>')

    annotation_targets = [data["flights"][0], data["flights"][3], data["flights"][5], data["flights"][9]]
    for flight in annotation_targets:
        idx = next(i for i, item in enumerate(data["flights"]) if item["callsign"] == flight["callsign"])
        color = PALETTE[idx % len(PALETTE)]
        point = flight["points"][-1]
        x, y = project(point["lng"], point["lat"], bounds, frame)
        parts.append(f'<line x1="{x:.2f}" y1="{y:.2f}" x2="{x + 42:.2f}" y2="{y - 24:.2f}" stroke="{color}" stroke-width="1.8" opacity="0.9" />')
        parts.append(f'<rect x="{x + 44:.2f}" y="{y - 44:.2f}" width="112" height="28" rx="14" fill="rgba(6,12,24,0.86)" stroke="rgba(148,163,184,0.12)" />')
        parts.append(f'<text x="{x + 56:.2f}" y="{y - 25:.2f}" class="tiny">{flight["callsign"]}</text>')

    parts.append("</svg>")
    return "\n".join(parts)


def create_prediction_svg(data: dict) -> str:
    width, height = 1380, 820
    parts = svg_header(width, height, "轨迹预测交互示意")
    parts.append(f'<rect width="{width}" height="{height}" fill="url(#bg)" />')
    parts.append('<rect x="30" y="30" width="1320" height="760" rx="34" fill="rgba(8,16,30,0.84)" stroke="rgba(103,232,249,0.12)" filter="url(#shadow)" />')
    parts.append('<text x="70" y="94" class="title">轨迹预测交互示意</text>')
    parts.append('<text x="70" y="126" class="subtitle">真实系统会把最近 10 个轨迹点送入 /api/predict，再把返回的未来坐标叠加到地图上。这里用 ETH673 生成一张页面说明图。</text>')

    flight = data["flights"][0]
    history = flight["points"][-72:]
    lookback = history[-8:]
    delta_lng = sum(lookback[i]["lng"] - lookback[i - 1]["lng"] for i in range(1, len(lookback))) / (len(lookback) - 1)
    delta_lat = sum(lookback[i]["lat"] - lookback[i - 1]["lat"] for i in range(1, len(lookback))) / (len(lookback) - 1)
    delta_alt = sum(lookback[i]["alt"] - lookback[i - 1]["alt"] for i in range(1, len(lookback))) / (len(lookback) - 1)
    delta_spd = sum(lookback[i]["spd"] - lookback[i - 1]["spd"] for i in range(1, len(lookback))) / (len(lookback) - 1)

    predicted = []
    last = history[-1].copy()
    for step in range(1, 9):
        last = {
            "lng": last["lng"] + delta_lng,
            "lat": last["lat"] + delta_lat,
            "alt": max(0.0, last["alt"] + delta_alt),
            "spd": max(0.0, last["spd"] + delta_spd),
        }
        predicted.append(last.copy())

    lngs = [p["lng"] for p in history] + [p["lng"] for p in predicted]
    lats = [p["lat"] for p in history] + [p["lat"] for p in predicted]
    margin_lng = (max(lngs) - min(lngs)) * 0.18 or 0.5
    margin_lat = (max(lats) - min(lats)) * 0.18 or 0.5
    bounds = (min(lngs) - margin_lng, max(lngs) + margin_lng, min(lats) - margin_lat, max(lats) + margin_lat)
    frame = (70, 182, 820, 548)

    draw_graticule(parts, bounds, frame, lng_step=2, lat_step=1)
    hist_coords = [project(p["lng"], p["lat"], bounds, frame) for p in history]
    pred_coords = [project(p["lng"], p["lat"], bounds, frame) for p in predicted]
    parts.append(f'<path d="{polyline_path(hist_coords)}" stroke="#67e8f9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />')
    parts.append(f'<path d="{polyline_path([hist_coords[-1], *pred_coords])}" stroke="#f59e0b" stroke-width="5" stroke-dasharray="12 10" stroke-linecap="round" stroke-linejoin="round" />')
    parts.append(f'<circle cx="{hist_coords[0][0]:.2f}" cy="{hist_coords[0][1]:.2f}" r="6" fill="#38bdf8" />')
    parts.append(f'<circle cx="{hist_coords[-1][0]:.2f}" cy="{hist_coords[-1][1]:.2f}" r="8" fill="#22c55e" stroke="#e2e8f0" stroke-width="2" />')
    parts.append(f'<circle cx="{pred_coords[-1][0]:.2f}" cy="{pred_coords[-1][1]:.2f}" r="7" fill="#f59e0b" stroke="#fff7ed" stroke-width="2" />')

    parts.append('<rect x="930" y="182" width="354" height="548" rx="28" fill="rgba(10,20,36,0.92)" stroke="rgba(148,163,184,0.14)" />')
    parts.append('<text x="960" y="220" class="label">交互解读</text>')
    info_rows = [
        ("Selected Flight", flight["callsign"]),
        ("History Window", "Latest 72 points"),
        ("Prediction API", "POST /api/predict"),
        ("Sequence Length", "10"),
        ("Visible Future", "1 - 10 steps"),
        ("Best Test Loss", "0.011108"),
        ("MAE (lat/lng)", "0.72° / 0.73°"),
    ]
    for idx, (label, value) in enumerate(info_rows):
        y = 268 + idx * 48
        parts.append(f'<text x="960" y="{y}" class="small">{label}</text>')
        parts.append(f'<text x="960" y="{y + 22}" class="mono">{value}</text>')

    parts.append('<rect x="958" y="564" width="298" height="122" rx="20" fill="rgba(15,35,56,0.74)" stroke="rgba(103,232,249,0.14)" />')
    parts.append('<text x="980" y="594" class="label">说明</text>')
    parts.append('<text x="980" y="620" class="tiny">蓝线 = 已有轨迹</text>')
    parts.append('<text x="980" y="642" class="tiny">橙线 = 页面中的预测叠加方式示意</text>')
    parts.append('<text x="980" y="664" class="tiny">真实预测由本地 Flask + LSTM 模型返回坐标</text>')

    parts.append("</svg>")
    return "\n".join(parts)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = json.loads(DATA_FILE.read_text())

    assets = {
        "dashboard-shot.svg": create_dashboard_svg(data),
        "overview-map.svg": create_overview_svg(data),
        "prediction-map.svg": create_prediction_svg(data),
    }

    for filename, content in assets.items():
        (OUT_DIR / filename).write_text(content, encoding="utf-8")
        print(f"wrote {OUT_DIR / filename}")


if __name__ == "__main__":
    main()
