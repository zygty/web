# ADS-B 项目：Clean 层构建 & 数据处理流程

> 日期：2026-06-08
> 环境：远程服务器 `lihaoxuan@servant-16`（10.62.192.91:116）
> Conda 环境：`adsb`（pandas 2.3.3, pyarrow 23.0.1, numpy 2.2.5）

---

## 1. 项目背景与目标

项目目录：`~/adsb_project`

已有状态：
- 原始 TXT 已全部转换为 parsed parquet
- 228 个分区文件，227 PASS / 1 WARN / 0 FAIL
- parsed 总大小约 36 GB
- 数据覆盖时间：2025-12-10 ~ 2025-12-17（约一周的中国空域 ADS-B 数据）

本次目标：
1. 基于 parsed parquet 生成 clean 层（质量标记，不删除数据）
2. 生成质量统计报告（CSV + Markdown）
3. 导出地图展示小样本 JSON
4. 导出模型训练数据集

---

## 2. 环境确认

### 2.1 机器与用户

```
$ whoami && hostname && pwd
lihaoxuan
servant-16
/home/lihaoxuan
```

### 2.2 TEST_ONE_FILE 检查

`adsb_nas_direct_parse_verify.py` 中的 `TEST_ONE_FILE` 当前值：

```python
TEST_ONE_FILE = "adsb_data_20251217_172323.txt"
```

设置为单文件模式。**未修改**，因为不需要重跑 parsed。

### 2.3 Parsed 数据 Schema

```
23 列：icao, aCode, callsign, company, country, deviceCode, type,
       lat(double), lng(double), altitude(double), height(double),
       speed(double), heading(double), verSpeed(double), verSpeedType,
       positionTime(int64, ms epoch), revTime(int64), speedTime(int64),
       source_file, source_line, outer_deviceCode, outer_revTime,
       parse_time_utc, source
```

关键发现：
- `positionTime` / `revTime` 是毫秒级时间戳（如 `1765385581184` ≈ 2025-12-10T16:34）
- `speed` 有 -1 值（无效标记），`heading` 有 -1 值
- `lat` 范围 [14, 51]，`lng` 范围 [77, 127]（中国空域）
- `company` 列全为空，`type` 列约 45% 为空

---

## 3. 任务1：Clean 层脚本

### 3.1 脚本

**文件**：`scripts/build_clean_adsb.py`

**用法**：
```bash
# 测试模式（前 2 个分区，不写文件）
/home/lihaoxuan/.conda/envs/adsb/bin/python scripts/build_clean_adsb.py --test

# 正式全量运行
/home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/build_clean_adsb.py

# 后台运行（推荐）
nohup /home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/build_clean_adsb.py \
    > logs/build_clean_full.log 2>&1 &
```

### 3.2 设计思路

**核心原则：保留原始记录 + 增加质量标记字段，不删除任何数据。**

#### 逐行质量标记（8 个字段）

| 字段 | 类型 | 规则 |
|---|---|---|
| `is_valid_position` | int8 | lat ∈ [-90,90] AND lng ∈ [-180,180] AND 非 null |
| `is_valid_time` | int8 | positionTime 非 null 且在 [2020-01-01, 2030-01-01] 范围 |
| `is_ground_point` | int8 | altitude==0 AND height==0 |
| `is_valid_speed` | int8 | speed ∈ [0, 600] |
| `is_valid_heading` | int8 | heading ∈ [0, 360] |
| `is_valid_icao` | int8 | icao 非空且为 ≥6 位十六进制字符串 |
| `quality_flag` | string | GOOD / WARN / BAD（详见下方规则） |
| `quality_reason` | string | 人类可读的异常原因列表（分号分隔） |

#### quality_flag 分级规则

```
- 核心字段（position / time / icao）任一失败 → BAD
- 2 个及以上字段失败 → BAD
- 1 个非核心字段失败 → WARN
- 全部通过 → GOOD
```

#### 轨迹级标记（3 个字段）

| 字段 | 规则 |
|---|---|
| `track_point_count` | 同一 icao 在该分区内的轨迹点数 |
| `track_sparse` | 轨迹点数 < 3 |
| `track_time_disorder` | 同一 icao 内 positionTime 出现递减的次数 |

### 3.3 输出结构

```
clean/source=adsb_data_YYYYMMDD_HHMMSS/
├── clean_data.parquet    # 单个 parquet 文件，包含所有原始列 + 11 个新列
├── _summary.json         # 处理摘要
└── _SUCCESS              # 完成标记
```

### 3.4 验证结果（单分区，438 万行）

```
valid_position :  4,383,629 / 4,383,638  (9 条 lat 越界)
valid_time     :  4,383,638 / 4,383,638  (全部有效)
ground_points  :    235,703 / 4,383,638  (5.4%)
valid_speed    :  4,383,116 / 4,383,638  (522 条 speed=-1)
valid_heading  :  4,377,947 / 4,383,638  (5,691 条 heading=-1)
valid_icao     :  4,383,638 / 4,383,638  (全部有效)

quality_good   :  4,377,839  (99.87%)
quality_warn   :      5,367  (0.12%)
quality_bad    :        432  (0.01%)

处理耗时：~50 秒/分区
```

### 3.5 全量运行状态

- 进程 PID：3541919
- 日志：`logs/build_clean_full.log`
- 预计总耗时：~5 小时（228 分区 × ~80 秒）
- 进度可查看：`tail -f logs/build_clean_full.log`

---

## 4. 任务2：质量报告

### 4.1 脚本

**文件**：`scripts/generate_clean_report.py`

**用法**：
```bash
/home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/generate_clean_report.py
```

**输出**：
- `reports/clean_quality_summary.csv` — 每个分区的详细统计
- `reports/clean_quality_summary.md` — Markdown 可读报告

### 4.2 中间报告结果（24/228 分区已完成时生成）

**总体统计**：

| 指标 | 值 |
|---|---|
| 总记录 | 105,238,747 |
| Quality GOOD | 105,138,406 (99.90%) |
| Quality WARN | 66,378 (0.06%) |
| Quality BAD | 33,963 (0.03%) |
| 有效位置 | 105,236,667 |
| 有效时间 | 105,238,747 (100%) |
| 地面点 | 6,419,601 (6.1%) |
| 有效速度 | 105,202,944 |
| 有效航向 | 105,144,244 |
| 有效 ICAO | 105,238,747 (100%) |
| 稀疏轨迹 | 948 |

**异常原因分布**：

| 原因 | 数量 |
|---|---|
| invalid_heading | 94,503 |
| invalid_speed | 35,803 |
| lat_out_of_range | 2,080 |

### 4.3 Clean 全量完成后

需要重新运行 `generate_clean_report.py` 以生成完整 228 分区的最终报告。

---

## 5. 任务3：地图小样本导出

### 5.1 脚本

**文件**：`scripts/export_map_sample.py`

**用法**：
```bash
# 默认参数：10 架飞机，1 小时窗口，每架最多 200 点
/home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/export_map_sample.py

# 自定义参数
/home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/export_map_sample.py \
    --date 2025-12-10 \
    --aircraft 15 \
    --hours 1.5 \
    --max-pts 300
```

### 5.2 输出

**文件**：`map_data/sample_flights.json`（193 KB）

**选择策略**：
1. 过滤：仅有效位置、非地面点、GOOD 质量
2. 自动选择数据量最大的日期和小时
3. 在该时间窗口内找轨迹时长 ≥ 20 分钟的飞机
4. 按轨迹时长排序，取前 N 架
5. 每架飞机降采样至最多 200 个点（等间隔）

**JSON 结构**：
```json
{
  "metadata": {
    "generated": "2026-06-08T08:16:04Z",
    "n_flights": 10,
    "total_points": 2034,
    "time_window": "2025-12-10 17:00-18:00 UTC"
  },
  "flights": [
    {
      "icao": "040103",
      "callsign": "ETH673",
      "n_points": 202,
      "points": [
        {"lat": 39.48091, "lng": 117.82227, "alt": 10394, "spd": 216.8, "hdg": 316.2, "t": "2025-12-10T17:00:00Z"},
        ...
      ]
    },
    ...
  ]
}
```

**前端使用示例**（Leaflet / Hugo）：
- 每架飞机的 `points` 数组可直接用于绘制 Polyline
- `alt`、`spd`、`hdg` 可用于 tooltip 或颜色编码
- `t` 是 ISO 格式时间戳，可用于时间轴

### 5.3 样本中的 10 架飞机

| ICAO | Callsign | 点数 | 轨迹 |
|---|---|---|---|
| 040103 | ETH673 | 202 | 中国北方 |
| 4D0111 | CLX9362 | 205 | 西南方向 |
| 71BF20 | KAL658 | 203 | 南海方向 |
| 781309 | CSN6982 | 204 | 西北方向 |
| 782282 | CSN668 | 204 | 西部高原 |
| 789219 | CPA261 | 205 | 珠三角 |
| 789275 | CPA291 | 201 | 香港方向 |
| 888136 | VJC834 | 203 | 海南方向 |
| AA01A2 | CKS9744 | 201 | 西北方向 |
| AA781F | CKS624 | 206 | 东南沿海 |

---

## 6. 任务4：模型训练数据集

### 6.1 脚本

**文件**：`scripts/build_model_dataset.py`

**用法**：
```bash
# 默认参数：window_size=20, stride=5
/home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/build_model_dataset.py

# 自定义参数
/home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/build_model_dataset.py \
    --window-size 30 \
    --stride 10
```

### 6.2 设计思路

**Step 1: 质量过滤**
- 仅保留 is_valid_position + is_valid_time + is_valid_speed + is_valid_heading + is_valid_icao + is_ground_point==0 + quality_flag=="GOOD" + 非 sparse track

**Step 2: 轨迹分组**
- 按 icao 分组，按 positionTime 排序
- 过滤轨迹点 < 30 的飞机
- 检测时间间隔 > 300 秒的断裂，拆分为独立 segment

**Step 3: 滑动窗口**
- 每个段以 window_size=20（步长 stride=5）切割
- 特征列：lat, lng, altitude, height, speed, heading, verSpeed
- 目标列（下一个点）：target_lat, target_lng, target_alt, target_spd, target_hdg

### 6.3 输出

| 文件 | 描述 |
|---|---|
| `model/trajectory_sample.parquet` | 过滤后的高质量轨迹记录 |
| `model/trajectory_windows.parquet` | 滑动窗口序列（含特征数组 + 目标值） |
| `model/_dataset_metadata.json` | 数据集元信息 |

### 6.4 测试验证结果（2 个源）

```
Aircraft:       1,127
Segments:       1,277
Track points:   8,369,382
Windows:        1,669,608

trajectory_sample.parquet: 288.7 MB
trajectory_windows.parquet: 246.5 MB
```

仅 2 个源（~870 万行）就生成了 **167 万个训练窗口**。全量 228 个源预计产生 **~1.9 亿个窗口**。

---

## 7. 项目目录结构

```
~/adsb_project/
├── adsb_nas_direct_parse_verify.py          # 原始 parsed 解析脚本
├── debug_bad_adsb_segment.py                # 调试脚本
├── test_smb_list.py                         # SMB 测试
│
├── parsed/                                   # 36 GB, 228 分区（已存在）
│   └── source=adsb_data_YYYYMMDD_HHMMSS/
│       ├── part-*.parquet
│       ├── _summary.json
│       └── _SUCCESS
│
├── clean/                                    # ~6.4 GB（构建中，37/228 完成）
│   └── source=adsb_data_YYYYMMDD_HHMMSS/
│       ├── clean_data.parquet               # 原始列 + 11 个质量列
│       ├── _summary.json
│       └── _SUCCESS
│
├── map_data/
│   └── sample_flights.json                  # ✅ 193 KB, 10 flights
│
├── model/                                    # 全量待生成
│   ├── trajectory_sample.parquet
│   ├── trajectory_windows.parquet
│   └── _dataset_metadata.json
│
├── reports/
│   ├── clean_quality_summary.csv            # ✅ 中间版本
│   ├── clean_quality_summary.md             # ✅ 中间版本
│   └── nas_direct_parse_verify_report.csv   # 原始 parsed 验证报告
│
├── scripts/
│   ├── build_clean_adsb.py                  # ✅ Clean 层构建
│   ├── export_map_sample.py                 # ✅ 地图样本导出
│   ├── build_model_dataset.py               # ✅ 模型数据集构建
│   ├── generate_clean_report.py             # ✅ 质量报告生成
│   ├── parse_adsb_txt_to_parquet.py         # 原始解析
│   └── count_parquet_rows.py                # 行数统计
│
└── logs/
    ├── build_clean_full.log                 # ✅ clean 全量构建日志
    └── *.parse.log                          # 各分区的 parsed 日志
```

---

## 8. 可复现命令

```bash
# 激活环境
conda activate adsb

# 1. Clean 层构建（全量，后台运行）
nohup python -u scripts/build_clean_adsb.py > logs/build_clean_full.log 2>&1 &

# 2. 生成质量报告
python -u scripts/generate_clean_report.py

# 3. 导出地图样本
python -u scripts/export_map_sample.py

# 4. 构建模型数据集
python -u scripts/build_model_dataset.py

# 检查 clean 进度
ls clean/ | wc -l
tail -f logs/build_clean_full.log

# 检查进程
ps aux | grep build_clean_adsb | grep -v grep
```

---

## 9. 传回本地 Mac 的文件

**现在就可以传**（已生成）：
```bash
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/map_data/sample_flights.json ./
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/reports/clean_quality_summary.md ./
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/reports/clean_quality_summary.csv ./
```

**Clean 全量完成后再传**：
- 最终版质量报告（覆盖中间版本）
- `model/trajectory_sample.parquet` / `trajectory_windows.parquet`

**不要传**：`parsed/`（36 GB）、`clean/`（预计 30+ GB）、`raw_cache/`

---

## 10. 后续工作建议

1. **Clean 完成后**：重新运行 `generate_clean_report.py` 生成最终报告
2. **模型数据集**：全量 `build_model_dataset.py` 会生成大量数据（预计数亿窗口），可能需要采样
3. **地图展示**：`sample_flights.json` 可直接用于 Leaflet，需要写前端页面
4. **模型训练**：基于 `trajectory_windows.parquet` 的滑动窗口，适合 LSTM/Transformer 轨迹预测
5. **数据探索**：可进一步分析轨迹模式、机场进出港、航线密度等