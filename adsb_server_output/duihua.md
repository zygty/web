# ADS-B 项目：全流程记录

> 服务器：`lihaoxuan@servant-16`（10.62.192.91:116）
> Conda 环境：`adsb`（pandas 2.3.3, pyarrow 23.0.1, numpy 2.2.5, PyTorch 2.6.0+cu124）
> GPU: NVIDIA GeForce RTX 4060 Ti (8GB), CUDA 12.6
> 数据：2025-12-10 ~ 2025-12-17，约一周中国空域 ADS-B 数据

---

## 项目目录结构（最终状态）

```
~/adsb_project/
├── parsed/                     # 36 GB, 228 分区（原始解析，不动）
├── clean/                      # 40 GB, 228 分区 ✅（质量标记层）
├── map_data/
│   └── sample_flights.json     # ✅ 193 KB, 10 架飞机地图样本
├── model/
│   ├── best_model.pth          # ✅ v2 模型（修复 float32 精度后重训）
│   ├── norm_params.json        # ✅ 标准化参数
│   └── training_log.json       # ✅ 训练日志
├── reports/
│   ├── clean_quality_summary.csv  # ✅ 最终版（228 分区）
│   └── clean_quality_summary.md   # ✅ 最终版
├── scripts/
│   ├── build_clean_adsb.py          # Clean 层构建
│   ├── generate_clean_report.py     # 质量报告生成
│   ├── export_map_sample.py         # 地图样本导出
│   ├── train_trajectory_model.py    # 模型训练（已修复 float32 bug）
│   └── build_model_dataset.py       # 模型数据集构建
└── logs/
    ├── build_clean_full.log         # clean 构建日志
    ├── train_full.log               # v1 训练（有 bug）
    └── train_full_v2.log            # v2 训练（已修复）
```

---

## 1. 数据处理流水线（已完成）

### 原始数据 → Parsed

- 228 个 TXT → parquet，227 PASS / 1 WARN / 0 FAIL
- Schema（23 列）：icao, aCode, callsign, company, country, deviceCode, type, lat, lng, altitude, height, speed, heading, verSpeed, verSpeedType, positionTime(ms), revTime, speedTime, source_file, source_line, outer_deviceCode, outer_revTime, parse_time_utc, source

### Parsed → Clean（质量标记层）

- **脚本**：`scripts/build_clean_adsb.py`
- **原则**：保留全部原始记录 + 增加 11 个质量标记字段，不删除任何数据
- 新增字段：is_valid_position, is_valid_time, is_ground_point, is_valid_speed, is_valid_heading, is_valid_icao, quality_flag(GOOD/WARN/BAD), quality_reason, track_point_count, track_sparse, track_time_disorder
- **结果**：228/228 分区完成，40 GB

### Clean 质量报告

- **脚本**：`scripts/generate_clean_report.py`
- **结果**（9.95 亿条记录）：

| 指标 | 值 |
|---|---|
| 总记录 | **994,860,141** |
| Quality GOOD | 993,952,061（**99.91%**） |
| Quality WARN | 624,411（0.06%） |
| Quality BAD | 283,669（0.03%） |
| 有效时间戳 | 100% |
| 有效 ICAO | 100% |
| 地面点 | 59,306,261（6.0%） |

异常原因：invalid_heading(868,920) > invalid_speed(302,113) > lat_out_of_range(10,585)

### 地图样本导出

- **脚本**：`scripts/export_map_sample.py`
- **输出**：`map_data/sample_flights.json`（193 KB，10 架飞机，2034 个点）
- JSON 结构：`{metadata: {...}, flights: [{icao, callsign, n_points, points: [{lat, lng, alt, spd, hdg, t}]}]}`
- 前端可直接用于 Leaflet Polyline

---

## 2. 模型训练

### 模型结构（与本地 `flight_lstm_pytorch.py` 完全一致）

- **FlightLSTM**: 2 层 LSTM (hidden=64) → FC(64→16) → ReLU → FC(16→4)
- **输入** (5 features): lat, lng, altitude, speed, heading
- **输出** (4 targets): lat, lng, altitude, speed（下一时刻预测）
- **sequence_length**: 10，参数量：52,564

### 训练配置

- 序列数：5,000,000（前 2 个分区即满足，流式加载避免 OOM）
- 训练/测试：4,000,000 / 1,000,000
- Epochs：50，Batch size：256，lr：0.001
- 设备：RTX 4060 Ti，每 epoch ~28s，总训练 ~24 分钟

### ⚠️ v1 训练问题（2026-06-09 首次训练）

本地部署后发现**预测方向完全相反**（ETH673 航班测试：实际向北，预测向南）。

**根因**：`normalize_data()` 中用 **float32 计算 mean/std**，5M×10=5000 万个值累加求和超出 float32 精确表示范围，导致 X_mean 严重失真：

| 参数 | float32（错误） | float64（正确） | 偏差 |
|---|---|---|---|
| X_mean lat | 21.47 | **31.11** | -9.6° |
| X_mean lng | 42.99 | **109.49** | -66.5° |
| y_mean lat | 31.34 | **31.11** | 正常 |
| y_mean lng | 110.78 | **109.49** | 正常 |

X 有 5000 万个值（5M×10）需要求和，sum ≈ 15 亿，float32 在此量级丢失精度。
y 只有 500 万个值，float32 尚可。X 和 y 的标准化参数不一致，导致预测完全错误。

**修复**：`train_trajectory_model.py` 的 `normalize_data()` 函数中，先 `.astype(np.float64)` 再计算 mean/std。

### ✅ v2 训练结果（修复后重训）

| 指标 | v1（有 bug） | v2（修复后） |
|---|---|---|
| Best Test Loss | 0.011218 | 0.011108 |
| 纬度 MAE | 0.80° | **0.72°** |
| 经度 MAE | 0.97° | **0.73°** |
| 高度 MAE | 340 m | **339 m** |
| 速度 MAE | 4.36 | **4.20** |
| 纬度 RMSE | 0.94° | **0.92°** |
| 经度 RMSE | 1.23° | **0.99°** |

修复后标准化参数一致：
- X_mean: [31.11, 109.49, 8420.04, 212.73, 180.11]
- y_mean: [31.11, 109.49, 8418.90, 212.71]
- X 和 y 的 lat/lng/altitude/speed 均值已对齐 ✅

---

## 3. 传回本地文件

**目标目录**：`~/Desktop/web/adsb_server_output/`

```bash
mkdir -p ~/Desktop/web/adsb_server_output/{model,reports,map_data}

# 模型文件（v2，已修复）
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/model/best_model.pth ~/Desktop/web/adsb_server_output/model/
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/model/norm_params.json ~/Desktop/web/adsb_server_output/model/
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/model/training_log.json ~/Desktop/web/adsb_server_output/model/

# 质量报告
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/reports/clean_quality_summary.md ~/Desktop/web/adsb_server_output/reports/
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/reports/clean_quality_summary.csv ~/Desktop/web/adsb_server_output/reports/

# 地图样本
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/map_data/sample_flights.json ~/Desktop/web/adsb_server_output/map_data/
```

### 文件说明

```
~/Desktop/web/adsb_server_output/
├── model/
│   ├── best_model.pth       # PyTorch 模型（含 state_dict + model_config + norm_params + sequence_length）
│   │                        # 兼容本地 flight_prediction_api.py，直接替换 web/model_training/best_model.pth 即可
│   ├── norm_params.json     # 标准化参数（X_mean/std 5维, y_mean/std 4维）
│   └── training_log.json    # 训练日志（epoch loss 曲线 + 评估指标 MAE/RMSE）
├── reports/
│   ├── clean_quality_summary.md   # 质量报告（总计 + 228 分区逐行）
│   └── clean_quality_summary.csv  # 同上 CSV 格式
└── map_data/
    └── sample_flights.json        # 地图样本（10 架飞机，Leaflet Polyline 可用）
```

### 模型与本地 API 兼容性

- 本地 API：`web/model_training/flight_prediction_api.py`
- 模型定义：`web/model_training/flight_lstm_pytorch.py`
- 替换 `web/model_training/best_model.pth` 即可使用新模型
- norm_params 也内嵌在 pth 文件中，API 可从 pth 直接读取

---

## 4. 可复现命令速查

```bash
conda activate adsb

# Clean 层构建
nohup python -u scripts/build_clean_adsb.py > logs/build_clean_full.log 2>&1 &

# 质量报告
python -u scripts/generate_clean_report.py

# 地图样本
python -u scripts/export_map_sample.py

# 模型训练（已修复 float32 精度）
nohup python -u scripts/train_trajectory_model.py \
    --max-windows 5000000 --epochs 50 --batch-size 256 --lr 0.001 \
    > logs/train_full_v2.log 2>&1 &
```

---

## 5. 后续建议

1. **地图展示**：`sample_flights.json` 可直接用于 Leaflet，写前端页面展示航线
2. **模型调优**：增大 hidden_size、增加 epochs、尝试 Transformer 架构
3. **数据探索**：轨迹模式分析、机场进出港统计、航线密度热力图
4. **部署**：将新模型替换到 `web/model_training/best_model.pth`，验证预测方向正确
