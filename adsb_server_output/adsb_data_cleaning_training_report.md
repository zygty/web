# ADS-B 数据清洗与模型训练详细报告

> 生成时间：2026-06-09
> 服务器：lihaoxuan@servant-16（10.62.192.91:116）
> 项目目录：~/adsb_project

---

## 一、项目概述

### 1.1 数据来源

ADS-B（Automatic Dependent Surveillance-Broadcast，广播式自动相关监视）是中国空域飞机自动播报的位置、速度、高度等飞行数据。原始数据为 TXT 格式，已在之前完成解析，转换为 Parquet 格式存储。

### 1.2 数据规模

| 指标 | 值 |
|---|---|
| 数据时间范围 | 2025-12-10 ~ 2025-12-17（约一周） |
| 分区数量 | 228 个 |
| 总记录数 | **994,860,141**（约 9.95 亿条） |
| Parsed 层大小 | 36 GB |
| Clean 层大小 | 40 GB |
| Unique ICAO（按分区求和） | 596,880 |
| 空域范围 | 纬度 14°~51°N，经度 77°~127°E（中国空域） |

### 1.3 数据流转路径

```
原始 TXT 文件
    ↓ adsb_nas_direct_parse_verify.py
Parsed Parquet（36 GB，228 分区，23 列）
    ↓ build_clean_adsb.py
Clean Parquet（40 GB，228 分区，34 列 = 23 原始 + 11 质量标记）
    ↓ generate_clean_report.py
质量报告（CSV + Markdown）
    ↓ export_map_sample.py
地图样本 JSON
    ↓ train_trajectory_model.py
LSTM 模型（best_model.pth + norm_params.json）
```

### 1.4 处理环境

| 项目 | 值 |
|---|---|
| 操作系统 | Linux 6.1.0-32-amd64 |
| Python | 3.10（Conda 环境 `adsb`） |
| pandas | 2.3.3 |
| pyarrow | 23.0.1 |
| numpy | 2.2.5 |
| PyTorch | 2.6.0+cu124 |
| GPU | NVIDIA GeForce RTX 4060 Ti (8GB) |
| CUDA | 12.6（Driver 560.35.05） |
| 补装依赖 | tabulate（报告生成所需） |

---

## 二、Parsed 层数据（输入）

### 2.1 Schema（23 列）

| 列名 | 类型 | 说明 |
|---|---|---|
| icao | string | 飞机唯一标识（ICAO 24 位十六进制地址码） |
| aCode | string | 航空器代码 |
| callsign | string | 呼号（如 CSN6982、ETH673） |
| company | string | 航空公司代码（实际全为空） |
| country | string | 注册国家 |
| deviceCode | string | 接收设备代码 |
| type | string | 航空器类型（约 45% 为空） |
| lat | double | 纬度（度） |
| lng | double | 经度（度） |
| altitude | double | 海拔高度（米） |
| height | double | 相对高度（米） |
| speed | double | 速度（节或 km/h，存在 -1 无效值） |
| heading | double | 航向（度，存在 -1 无效值） |
| verSpeed | double | 垂直速度 |
| verSpeedType | string | 垂直速度类型 |
| positionTime | int64 | 位置时间戳（毫秒级 Unix epoch，如 1765385581184） |
| revTime | int64 | 接收时间戳（毫秒级） |
| speedTime | int64 | 速度时间戳（毫秒级） |
| source_file | string | 来源文件名 |
| source_line | int | 来源行号 |
| outer_deviceCode | string | 外部设备代码 |
| outer_revTime | int64 | 外部接收时间 |
| parse_time_utc | string | 解析时间（UTC） |
| source | string | 数据源标识 |

### 2.2 数据特征

- `positionTime` / `revTime` 为毫秒级时间戳（如 `1765385581184` ≈ 2025-12-10T16:34:41Z）
- `speed` 有效范围通常 0~600，存在 -1 无效标记值
- `heading` 有效范围 0~360，存在 -1 无效标记值
- `altitude` 单位为米，存在负值（如 -243.84，可能是低于海平面或传感器偏差）
- `company` 列全为空
- `type` 列约 45% 为空
- 纬度范围约 [14, 51]，经度范围约 [77, 127]，覆盖中国空域

---

## 三、Clean 层构建（数据清洗）

### 3.1 设计原则

**核心原则：保留所有原始记录，仅增加质量标记字段，不删除任何数据行。**

这一设计确保：
1. 原始数据完整性不受影响
2. 下游使用方可根据质量标记灵活过滤
3. 清洗规则可追溯、可调整

### 3.2 脚本信息

- **文件**：`scripts/build_clean_adsb.py`
- **输入**：`parsed/source=adsb_data_YYYYMMDD_HHMMSS/part-*.parquet`
- **输出**：`clean/source=adsb_data_YYYYMMDD_HHMMSS/clean_data.parquet`

### 3.3 新增质量标记字段（11 个）

#### 3.3.1 逐行质量标记（8 个字段）

##### (1) is_valid_position（int8）

**规则**：lat ∈ [-90, 90] AND lng ∈ [-180, 180] AND 非 null

**实现逻辑**：
```python
lat_ok = df["lat"].notna() & (df["lat"] >= -90) & (df["lat"] <= 90)
lng_ok = df["lng"].notna() & (df["lng"] >= -180) & (df["lng"] <= 180)
df["is_valid_position"] = (lat_ok & lng_ok).astype(np.int8)
```

**说明**：检查经纬度是否在合理范围内。中国空域 lat 约 14°~51°，lng 约 77°~127°，但此标记使用全球范围 [-90,90]/[-180,180] 做基本有效性检查。实际数据中发现少量 lat 超过 90 的异常值（如 172.96°）。

##### (2) is_valid_time（int8）

**规则**：positionTime 非 null 且在 [2020-01-01, 2030-01-01] 范围内

**实现逻辑**：
```python
TS_MIN = int(datetime(2020, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
TS_MAX = int(datetime(2030, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
ts = df["positionTime"]
ts_ok = ts.notna() & (ts >= TS_MIN) & (ts <= TS_MAX)
df["is_valid_time"] = ts_ok.astype(np.int8)
```

**说明**：时间戳阈值为 2020~2030 年（毫秒 epoch），过滤明显错误的时间值。实际数据中 100% 通过此检查。

##### (3) is_ground_point（int8）

**规则**：altitude == 0 AND height == 0

**实现逻辑**：
```python
alt_zero = df["altitude"].fillna(-1) == 0
hgt_zero = df["height"].fillna(-1) == 0
df["is_ground_point"] = (alt_zero & hgt_zero).astype(np.int8)
```

**说明**：标记飞机在地面停驻或滑行的数据点。这些点的高度和速度通常为 0，对于飞行轨迹预测无意义，但数据本身有效。约 6.0% 的记录为地面点。

##### (4) is_valid_speed（int8）

**规则**：speed ∈ [0, 600]

**实现逻辑**：
```python
spd = df["speed"]
spd_ok = spd.notna() & (spd >= 0) & (spd <= 600)
df["is_valid_speed"] = spd_ok.astype(np.int8)
```

**说明**：600 为宽松上界（约 1111 km/h），覆盖所有民用飞机速度。无效值主要为 speed=-1（传感器未返回有效速度时的标记值）。

##### (5) is_valid_heading（int8）

**规则**：heading ∈ [0, 360]

**实现逻辑**：
```python
hdg = df["heading"]
hdg_ok = hdg.notna() & (hdg >= 0) & (hdg <= 360)
df["is_valid_heading"] = hdg_ok.astype(np.int8)
```

**说明**：航向角为 0°~360°。无效值主要为 heading=-1（传感器未返回有效航向时的标记值）。这是异常最多的维度（868,920 条）。

##### (6) is_valid_icao（int8）

**规则**：icao 非空、非空白，且为 ≥ 6 位十六进制字符串

**实现逻辑**：
```python
icao = df["icao"].fillna("").astype(str).str.strip()
icao_ok = (icao.str.len() >= 6) & (icao.str.match(r'^[0-9A-Fa-f]+$'))
df["is_valid_icao"] = icao_ok.astype(np.int8)
```

**说明**：ICAO 24 位地址码应为 6 位十六进制字符。实际数据中 100% 通过此检查。

##### (7) quality_flag（string）

**取值**：GOOD / WARN / BAD

**分级规则**（核心 → 最严格）：

| 条件 | quality_flag |
|---|---|
| 全部 6 项检查通过 | GOOD |
| 核心字段（position / time / icao）任一失败 | BAD |
| 2 个及以上字段失败 | BAD |
| 1 个非核心字段（speed / heading）失败 | WARN |

**实现逻辑**：
```python
flag_cols = ["is_valid_position", "is_valid_time", "is_valid_icao"]      # 核心字段
metric_cols = ["is_valid_speed", "is_valid_heading"]                      # 非核心字段

fail_count = sum(~df[c].astype(bool) for c in flag_cols + metric_cols)

df["quality_flag"] = "GOOD"
df.loc[fail_count >= 1, "quality_flag"] = "WARN"
df.loc[fail_count >= 2, "quality_flag"] = "BAD"
# 核心字段失败直接降为 BAD
for c in flag_cols:
    df.loc[df[c].astype(bool) == False, "quality_flag"] = "BAD"
```

**设计思路**：
- 核心字段（位置、时间、ICAO）是飞行数据的基石，任一缺失则数据不可用
- 非核心字段（速度、航向）缺失虽影响分析，但不至于整条记录无效
- GOOD = 可直接用于分析和模型训练
- WARN = 可用但需注意缺失字段
- BAD = 建议排除

##### (8) quality_reason（string）

**规则**：人类可读的异常原因列表，分号分隔

**取值示例**：`"invalid_heading"`, `"invalid_speed;invalid_heading"`, `""`（无异常）

**可能的值**：
- `lat_out_of_range` — 纬度超出 [-90, 90]
- `lng_out_of_range` — 经度超出 [-180, 180]
- `invalid_positionTime` — 时间戳不在 [2020, 2030] 范围
- `invalid_speed` — 速度不在 [0, 600] 范围
- `invalid_heading` — 航向不在 [0, 360] 范围
- `invalid_icao` — ICAO 不符合格式要求

#### 3.3.2 轨迹级标记（3 个字段）

##### (9) track_point_count（int）

**规则**：同一 ICAO 在该分区内的轨迹点总数

**实现逻辑**：
```python
grouped = df.groupby("icao", sort=False)
counts = grouped.size().rename("track_point_count")
df = df.merge(counts, left_on="icao", right_index=True, how="left")
```

##### (10) track_sparse（bool）

**规则**：track_point_count < 3

**说明**：少于 3 个点的轨迹无法构成有意义的飞行路径，标记为稀疏轨迹用于下游过滤。

##### (11) track_time_disorder（int）

**规则**：同一 ICAO 内 positionTime 出现递减的次数

**实现逻辑**：
```python
df_sorted = df.sort_values(["icao", "positionTime"])
cum_disorder = df_sorted.groupby("icao")["positionTime"].transform(
    lambda s: (s < s.shift(1)).sum()
)
df_sorted["track_time_disorder"] = cum_disorder
```

**说明**：正常情况下，同一飞机的 positionTime 应单调递增。时间乱序可能由数据接收延迟、多接收站数据合并等原因导致。

### 3.4 处理流程

```
对每个 parsed 分区（共 228 个）：
  1. 读取 part-*.parquet（一个分区可能有多个 part 文件）
  2. pd.concat 合并为单个 DataFrame
  3. add_quality_flags()：添加 8 个逐行质量标记字段
     - 逐项检查 position, time, speed, heading, icao
     - 计算 quality_flag (GOOD/WARN/BAD) 和 quality_reason
  4. mark_track_anomalies()：添加 3 个轨迹级标记字段
     - 按 ICAO 分组统计轨迹点数、稀疏标记、时间乱序
  5. 写出为单个 clean_data.parquet（原始 23 列 + 新增 11 列 = 34 列）
  6. 写出 _summary.json（处理摘要）
  7. 写出 _SUCCESS 标记文件
```

**跳过机制**：如果某分区已存在 `_SUCCESS` 和 `_summary.json`，则跳过该分区，支持断点续跑。

### 3.5 Clean 层输出结构

```
clean/source=adsb_data_YYYYMMDD_HHMMSS/
├── clean_data.parquet    # 34 列（23 原始 + 11 质量标记）
├── _summary.json         # { total_rows_read, total_rows_written, elapsed_seconds, ... }
└── _SUCCESS              # 完成标记（空文件）
```

### 3.6 执行方式

```bash
# 测试模式（前 2 个分区，不写文件）
/home/lihaoxuan/.conda/envs/adsb/bin/python scripts/build_clean_adsb.py --test

# 正式全量运行（后台，nohup 防断开中断）
nohup /home/lihaoxuan/.conda/envs/adsb/bin/python -u scripts/build_clean_adsb.py \
    > logs/build_clean_full.log 2>&1 &
```

### 3.7 处理耗时

- 每个分区约 50~80 秒（含读取、质量标记、写出）
- 228 个分区总耗时约 5 小时
- 日志文件：`logs/build_clean_full.log`

---

## 四、质量报告生成

### 4.1 脚本信息

- **文件**：`scripts/generate_clean_report.py`
- **输入**：`clean/source=*/clean_data.parquet`（逐个读取全量数据）
- **输出**：
  - `reports/clean_quality_summary.csv`（每分区一行，机器可读）
  - `reports/clean_quality_summary.md`（含总计 + 228 分区逐行表格，人类可读）

### 4.2 报告内容

每个分区的统计列：

| 列名 | 说明 |
|---|---|
| source | 分区名 |
| total_rows | 总记录数 |
| valid_position | 有效位置数 |
| valid_time | 有效时间数 |
| ground_points | 地面点数 |
| valid_speed | 有效速度数 |
| valid_heading | 有效航向数 |
| valid_icao | 有效 ICAO 数 |
| quality_good | GOOD 质量记录数 |
| quality_warn | WARN 质量记录数 |
| quality_bad | BAD 质量记录数 |
| unique_icao | 唯一 ICAO 数 |
| sparse_tracks | 稀疏轨迹数 |
| reason_counts | 异常原因分布（JSON 字符串） |

### 4.3 最终质量统计（全量 228 分区）

| 指标 | 数值 | 占比 |
|---|---|---|
| **总记录** | **994,860,141** | — |
| Quality GOOD | 993,952,061 | **99.91%** |
| Quality WARN | 624,411 | 0.06% |
| Quality BAD | 283,669 | 0.03% |
| 有效位置 | 994,849,556 | 99.999% |
| 有效时间 | 994,860,141 | 100.00% |
| 地面点 | 59,306,261 | 6.0% |
| 有效速度 | 994,558,028 | 99.970% |
| 有效航向 | 993,991,221 | 99.913% |
| 有效 ICAO | 994,860,141 | 100.00% |
| 稀疏轨迹 | 8,457 | — |

### 4.4 异常原因分布

| 异常原因 | 数量 | 说明 |
|---|---|---|
| invalid_heading | 868,920 | 航向为 -1（传感器未返回） |
| invalid_speed | 302,113 | 速度为 -1（传感器未返回） |
| lat_out_of_range | 10,585 | 纬度超出 [-90, 90] |

**分析**：
- 主要异常来源是速度/航向的 -1 无效标记值（传感器在特定飞行阶段不返回这些数据）
- 纬度越界极少（仅 10,585 条，占 0.001%），可能为数据传输错误
- 经度和时间无显著异常
- 整体数据质量非常高，99.91% 为 GOOD

---

## 五、地图样本导出

### 5.1 脚本信息

- **文件**：`scripts/export_map_sample.py`
- **输入**：clean parquet
- **输出**：`map_data/sample_flights.json`（193 KB）

### 5.2 导出策略

1. **质量过滤**：仅选 is_valid_position=1、is_ground_point=0、quality_flag="GOOD" 的记录
2. **自动选时间窗口**：统计数据量，自动选择最密集的日期和小时（结果：2025-12-10 17:00-18:00 UTC）
3. **筛选飞机**：在该时间窗口内，找轨迹时长 ≥ 20 分钟的飞机，按轨迹时长降序排列
4. **采样**：取前 10 架飞机，每架等间隔降采样至最多 200 个点

### 5.3 JSON 结构

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

前端（Leaflet）可直接用 `points` 数组绘制 Polyline。

---

## 六、模型训练

### 6.1 模型结构

与本地已有模型 `web/model_training/flight_lstm_pytorch.py` 完全一致：

```
FlightLSTM:
  输入层: (batch, seq_len=10, features=5)
    features = [lat, lng, altitude, speed, heading]
  ↓
  LSTM: 2 层, hidden_size=64, dropout=0.2, batch_first=True
  ↓
  取最后一步输出: (batch, 64)
  ↓
  Dropout(0.2)
  ↓
  FC: 64 → 16
  ↓
  ReLU
  ↓
  Dropout(0.2)
  ↓
  FC: 16 → 4
    targets = [lat, lng, altitude, speed]
```

**参数量**：52,564

### 6.2 训练脚本

- **文件**：`scripts/train_trajectory_model.py`
- **关键设计**：流式逐分区处理，避免 OOM

### 6.3 训练数据处理流程

#### Step 1: 流式加载与质量过滤

逐个分区加载 clean parquet，每次只读一个分区到内存：

```python
feature_cols = ["lat", "lng", "altitude", "speed", "heading"]
```

**过滤条件**（7 项全部满足）：
```python
mask = (
    (df["is_valid_position"] == 1)    # 有效位置
    & (df["is_valid_time"] == 1)      # 有效时间
    & (df["is_valid_speed"] == 1)     # 有效速度
    & (df["is_valid_heading"] == 1)   # 有效航向
    & (df["is_valid_icao"] == 1)      # 有效 ICAO
    & (df["is_ground_point"] == 0)    # 非地面点
    & (df["quality_flag"] == "GOOD")  # 整体质量 GOOD
)
```

比 clean 层的 GOOD 标记更严格：额外排除了地面点和缺少速度/航向的记录。

#### Step 2: 排序与短轨迹过滤

```python
df = df.sort_values(["icao", "positionTime"]).reset_index(drop=True)
counts = df.groupby("icao")["positionTime"].transform("count")
df = df[counts >= 15].copy()  # 至少 15 个点
```

#### Step 3: 轨迹断裂检测与分段

```python
df["time_diff"] = df.groupby("icao")["positionTime"].diff()
df["gap_flag"] = (df["time_diff"] > 300_000) | df["time_diff"].isna()  # 300 秒
df["segment_id"] = df.groupby("icao")["gap_flag"].cumsum()
df["segment_id"] = df["icao"] + "_seg" + df["segment_id"].astype(str)
```

同一架飞机如果两个相邻点时间间隔超过 5 分钟，视为轨迹断裂，拆分为独立 segment。

#### Step 4: 滑动窗口构建

```python
for seg_id, grp in df.groupby("segment_id"):
    features = grp[feature_cols].values.astype(np.float32)  # shape: (n, 5)
    for i in range(n - sequence_length):                     # sequence_length = 10
        all_X.append(features[i : i + 10])                   # 输入: 10 个连续点, 5 个特征
        all_y.append(features[i + 10, :4])                   # 输出: 下一个点的 lat, lng, alt, spd
```

滑动窗口以步长 1 在每条 segment 上移动：
- **输入 X**：(seq_len=10, features=5) = 10 个历史时刻的 [lat, lng, altitude, speed, heading]
- **输出 y**：(4,) = 第 11 个时刻的 [lat, lng, altitude, speed]

#### Step 5: 内存管理

- 每个分区处理完后 `del df` 释放内存
- 设置 `max_sequences` 上限，达到后立即停止（实际前 2 个分区即产生 500 万序列）
- 内存占用从理论 ~27GB 降至 ~3GB

### 6.4 数据标准化

#### v1 版本（有 bug）

```python
# ❌ 错误：float32 在大数据量下精度丢失
X_reshaped = X.reshape(-1, X.shape[-1])
X_mean = X_reshaped.mean(axis=0)  # float32 运算
```

**问题**：X 有 5M×10 = 5000 万个 float32 值，求和后 sum ≈ 15 亿，超出 float32 精确表示范围（float32 尾数仅 24 位，约 7 位有效十进制数字），导致 X_mean 严重失真：

| 参数 | float32 计算（错误） | float64 计算（正确） | 偏差 |
|---|---|---|---|
| X_mean lat | 21.47 | 31.11 | **-9.6°** |
| X_mean lng | 42.99 | 109.49 | **-66.5°** |

X 和 y 的标准化参数不一致 → 预测方向完全相反。

#### v2 版本（已修复）

```python
# ✅ 正确：先转 float64 再计算统计量
X_reshaped = X.reshape(-1, X.shape[-1]).astype(np.float64)
X_mean = X_reshaped.mean(axis=0)
X_std = X_reshaped.std(axis=0) + 1e-8
X_norm = ((X.astype(np.float64) - X_mean) / X_std).astype(np.float32)

y_f64 = y.astype(np.float64)
y_mean = y_f64.mean(axis=0)
y_std = y_f64.std(axis=0) + 1e-8
y_norm = ((y_f64 - y_mean) / y_std).astype(np.float32)
```

修复后 X_mean 和 y_mean 一致（lat ≈ 31.11, lng ≈ 109.49）。

### 6.5 训练配置

| 参数 | 值 |
|---|---|
| 训练序列数 | 5,000,000 |
| 训练集 | 4,000,000（80%） |
| 测试集 | 1,000,000（20%） |
| Epochs | 50 |
| Batch size | 256 |
| 学习率 | 0.001 |
| 优化器 | Adam |
| 损失函数 | MSELoss |
| Dropout | 0.2 |
| 设备 | NVIDIA RTX 4060 Ti (CUDA) |
| 每 epoch 时间 | ~28 秒 |
| 总训练时间 | ~24 分钟 |

### 6.6 训练过程

| Epoch | Train Loss | Test Loss | Best Loss | 时间 |
|---|---|---|---|---|
| 1 | 0.0980 | 0.0139 | 0.0139 | 28.3s |
| 5 | 0.0899 | 0.0154 | 0.0116 | 28.1s |
| 10 | 0.0894 | 0.0118 | 0.0114 | 28.0s |
| 15 | 0.0889 | 0.0113 | 0.0111 | 27.8s |
| 20 | 0.0889 | 0.0124 | 0.0111 | 28.1s |
| 30 | 0.0888 | 0.0149 | 0.0111 | 28.3s |
| 50 | 0.0885 | 0.0140 | **0.0111** | 28.3s |

Best test loss 在 epoch 15~16 附近达到，之后 train loss 继续缓慢下降但 test loss 轻微上升（轻微过拟合趋势）。

### 6.7 评估结果（反标准化后）

| 指标 | v1（float32 bug） | v2（修复后） |
|---|---|---|
| Best Test Loss | 0.011218 | **0.011108** |
| 纬度 MAE | 0.80° | **0.72°** |
| 经度 MAE | 0.97° | **0.73°** |
| 高度 MAE | 339.85 m | **339.44 m** |
| 速度 MAE | 4.36 | **4.20** |
| 纬度 RMSE | 0.94° | **0.92°** |
| 经度 RMSE | 1.23° | **0.99°** |

### 6.8 输出文件

| 文件 | 内容 |
|---|---|
| `model/best_model.pth` | PyTorch checkpoint（含 model_state_dict、model_config、norm_params、sequence_length） |
| `model/norm_params.json` | 标准化参数（X_mean/std: 5 维, y_mean/std: 4 维） |
| `model/training_log.json` | 训练日志（每 epoch 的 loss + 最终评估指标） |

### 6.9 模型与本地 API 兼容性

新模型完全兼容本地已有的 Flask API：
- 模型结构、输入输出格式、sequence_length 均未改变
- `best_model.pth` 内嵌 norm_params，API 可直接从 pth 文件读取
- 替换 `web/model_training/best_model.pth` 即可使用新模型

---

## 七、v1 问题排查过程

### 7.1 问题发现

本地部署 v1 模型后，用 ETH673 航班测试，发现预测方向与实际完全相反：

| 项目 | 实际变化 | v1 预测 |
|---|---|---|
| 纬度 | 39.70 → 39.82（向北 ↑） | 39.70 → 38.95（向南 ↓） |
| 经度 | 117.55 → 117.40（向西 ←） | 117.55 → 116.27（大幅向西 ←←） |
| 高度 | 10386 → 10394（爬升 ↑） | 10386 → 10081（下降 ↓） |

### 7.2 定位过程

1. **检查 norm_params.json**：发现 X_mean（输入特征均值）与 y_mean（输出目标均值）严重不一致
   - X lng_mean = 42.99°（❌ 不在中国空域范围）
   - y lng_mean = 110.78°（✅ 正常）

2. **检查 clean 数据**：直接读取 parquet 验证，lat_mean ≈ 30.2, lng_mean ≈ 110.5，数据本身正确

3. **定位根因**：在 `normalize_data()` 中，X 以 float32 格式计算 mean，5M×10=5000 万个值累加超出 float32 精度
   - 用 100K 序列测试 → 正常（float32 尚可处理）
   - 用 5M 序列测试 → X_mean 失真（lat 偏差 9.6°, lng 偏差 66.5°）
   - float64 对比验证 → 确认是 float32 精度问题

4. **修复**：标准化计算前先 `.astype(np.float64)`

### 7.3 教训

- **大数据量下 float32 的 mean/std 计算不可靠**：5000 万个 float32 值求和会丢失精度
- **始终验证标准化参数**：X_mean 和 y_mean 来自同一数据源，理应一致
- **模型评估指标可能掩盖问题**：v1 的 MAE 看似合理（0.80°），但预测方向完全错误

---

## 八、项目最终状态

### 8.1 服务器文件清单

```
~/adsb_project/
├── parsed/                     # 36 GB, 228 分区（原始解析，只读）
├── clean/                      # 40 GB, 228 分区 ✅（含 11 个质量标记字段）
├── map_data/
│   └── sample_flights.json     # ✅ 193 KB, 10 架飞机
├── model/
│   ├── best_model.pth          # ✅ v2 模型（修复后）
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
│   └── build_model_dataset.py       # 模型数据集构建（备用）
└── logs/
    ├── build_clean_full.log         # Clean 构建日志
    ├── train_full.log               # v1 训练日志（有 bug）
    └── train_full_v2.log            # v2 训练日志（已修复）
```

### 8.2 传回本地文件

目标目录：`~/Desktop/web/adsb_server_output/`

```bash
mkdir -p ~/Desktop/web/adsb_server_output/{model,reports,map_data}

# 模型（v2，已修复）
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/model/best_model.pth ~/Desktop/web/adsb_server_output/model/
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/model/norm_params.json ~/Desktop/web/adsb_server_output/model/
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/model/training_log.json ~/Desktop/web/adsb_server_output/model/

# 质量报告
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/reports/clean_quality_summary.md ~/Desktop/web/adsb_server_output/reports/
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/reports/clean_quality_summary.csv ~/Desktop/web/adsb_server_output/reports/

# 地图样本
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/map_data/sample_flights.json ~/Desktop/web/adsb_server_output/map_data/

# 本报告
scp -P 116 lihaoxuan@10.62.192.91:~/adsb_project/adsb_data_cleaning_training_report.md ~/Desktop/web/adsb_server_output/
```

---

## 九、后续优化建议

1. **模型架构**：当前 LSTM 效果尚可（纬度 MAE 0.72° ≈ 80km），可尝试 Transformer 或更大的 hidden_size
2. **特征工程**：加入时间间隔 Δt、经纬度变化率等衍生特征
3. **数据量**：当前仅用 500 万序列（2 个分区），全量 228 个分区预计可产生 ~1.9 亿序列
4. **地图展示**：`sample_flights.json` 可直接用于 Leaflet，建议开发交互式前端
5. **数据探索**：航线密度热力图、机场进出港统计、空域拥堵分析
