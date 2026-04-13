#!/usr/bin/env python3
"""
ADSB数据处理脚本
功能：合并多个ADSB数据文件，按时间排序，生成前端可用的轨迹数据
"""

import json
import os
from datetime import datetime
from collections import defaultdict
import glob

# 数据文件路径
DATA_DIR = os.path.expanduser("~/Desktop/test")
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

def parse_adsb_file(filepath):
    """
    解析单个ADSB数据文件
    文件格式：每行一个JSON对象，用"JLsplitJL"分隔
    """
    print(f"正在处理文件: {filepath}")
    flight_data = []
    line_count = 0

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line == 'JLsplitJL':
                continue

            try:
                data = json.loads(line)
                if 'decodeDataList' in data and data['decodeDataList']:
                    for flight in data['decodeDataList']:
                        # 提取关键数据
                        flight_info = {
                            'callsign': flight.get('callsign', ''),
                            'icao': flight.get('icao', ''),
                            'lat': flight.get('lat', 0),
                            'lng': flight.get('lng', 0),
                            'altitude': flight.get('altitude', 0),
                            'speed': flight.get('speed', 0),
                            'heading': flight.get('heading', 0),
                            'type': flight.get('type', ''),
                            'timestamp': flight.get('positionTime', 0),
                            'country': flight.get('country', '')
                        }

                        # 只保留有位置信息的数据
                        if flight_info['lat'] != 0 and flight_info['lng'] != 0:
                            flight_data.append(flight_info)

                line_count += 1
                if line_count % 100000 == 0:
                    print(f"  已处理 {line_count} 行...")

            except json.JSONDecodeError as e:
                continue

    print(f"  完成! 解析出 {len(flight_data)} 条有效数据")
    return flight_data

def group_by_flight(flight_data):
    """
    按航班号(callsign)分组数据
    """
    print("正在按航班分组...")
    flights = defaultdict(list)

    for data in flight_data:
        callsign = data.get('callsign', 'UNKNOWN')
        if callsign:
            flights[callsign].append(data)

    print(f"  共发现 {len(flights)} 个独立航班")
    return flights

def sort_and_filter_trajectories(flights):
    """
    对每个航班的轨迹按时间排序，并过滤质量差的数据
    """
    print("正在排序和过滤轨迹...")
    processed_flights = {}

    for callsign, trajectory in flights.items():
        # 按时间戳排序
        trajectory.sort(key=lambda x: x['timestamp'])

        # 过滤：只保留轨迹点数>=10的航班（去除噪声数据）
        if len(trajectory) >= 10:
            # 计算时间范围
            if trajectory:
                time_start = trajectory[0]['timestamp']
                time_end = trajectory[-1]['timestamp']
                duration_hours = (time_end - time_start) / (1000 * 3600)

                # 只保留合理时长内的轨迹（0.1-24小时）
                if 0.1 < duration_hours < 24:
                    processed_flights[callsign] = {
                        'callsign': callsign,
                        'icao': trajectory[0].get('icao', ''),
                        'type': trajectory[0].get('type', ''),
                        'country': trajectory[0].get('country', ''),
                        'point_count': len(trajectory),
                        'time_start': time_start,
                        'time_end': time_end,
                        'duration_hours': round(duration_hours, 2),
                        'trajectory': trajectory
                    }

    print(f"  保留 {len(processed_flights)} 个有效航班轨迹")
    return processed_flights

def generate_summary(flights):
    """
    生成数据摘要
    """
    print("\n=== 数据摘要 ===")
    total_flights = len(flights)
    total_points = sum(f['point_count'] for f in flights.values())

    # 统计国家
    countries = defaultdict(int)
    for flight in flights.values():
        countries[flight.get('country', 'Unknown')] += 1

    # 统计机型
    aircraft_types = defaultdict(int)
    for flight in flights.values():
        atype = flight.get('type', 'Unknown')
        if atype:
            aircraft_types[atype] += 1

    print(f"总航班数: {total_flights}")
    print(f"总轨迹点数: {total_points:,}")
    print(f"平均每航班点数: {total_points // total_flights if total_flights else 0}")
    print(f"\n前10个国家/地区:")
    for country, count in sorted(countries.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {country}: {count}")
    print(f"\n前10种机型:")
    for atype, count in sorted(aircraft_types.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {atype}: {count}")

def save_processed_data(flights, output_file):
    """
    保存处理后的数据
    """
    print(f"\n正在保存数据到: {output_file}")
    data = {
        'metadata': {
            'total_flights': len(flights),
            'generated_at': datetime.now().isoformat(),
            'description': '合并并排序后的ADSB航班轨迹数据'
        },
        'flights': list(flights.values())
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  保存完成!")

    # 同时生成简化版（用于快速加载预览）
    simplified_file = output_file.replace('.json', '_simplified.json')
    print(f"正在生成简化版: {simplified_file}")

    simplified_data = {
        'metadata': data['metadata'],
        'flights': []
    }

    # 简化：只保留前100个航班，每个航班最多100个轨迹点
    for flight_data in list(flights.values())[:100]:
        simplified_flight = flight_data.copy()
        if len(flight_data['trajectory']) > 100:
            # 均匀采样
            step = len(flight_data['trajectory']) // 100
            simplified_flight['trajectory'] = flight_data['trajectory'][::step]
        simplified_data['flights'].append(simplified_flight)

    with open(simplified_file, 'w', encoding='utf-8') as f:
        json.dump(simplified_data, f, ensure_ascii=False, indent=2)

    print(f"  简化版保存完成!")

def main():
    print("=" * 50)
    print("ADSB数据处理工具")
    print("=" * 50)

    # 查找所有数据文件
    data_files = glob.glob(os.path.join(DATA_DIR, "adsb_data_*.txt"))
    data_files.sort()

    if not data_files:
        print("错误: 未找到ADSB数据文件")
        return

    print(f"\n找到 {len(data_files)} 个数据文件:")
    for f in data_files:
        size_mb = os.path.getsize(f) / (1024 * 1024)
        print(f"  - {os.path.basename(f)} ({size_mb:.1f} MB)")

    # 解析所有文件
    all_flight_data = []
    for filepath in data_files:
        flight_data = parse_adsb_file(filepath)
        all_flight_data.extend(flight_data)

    print(f"\n总共解析出 {len(all_flight_data):,} 条原始数据")

    # 按航班分组
    flights = group_by_flight(all_flight_data)

    # 排序和过滤
    processed_flights = sort_and_filter_trajectories(flights)

    # 生成摘要
    generate_summary(processed_flights)

    # 保存数据
    output_file = os.path.join(OUTPUT_DIR, 'adsb_flights_combined.json')
    save_processed_data(processed_flights, output_file)

    print("\n" + "=" * 50)
    print("处理完成!")
    print("=" * 50)

if __name__ == '__main__':
    main()
