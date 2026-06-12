#!/usr/bin/env python3
"""
航空轨迹数据清洗脚本
用于LSTM轨迹预测模型的数据预处理
"""

import json
import numpy as np
from datetime import datetime
from typing import List, Dict, Any
import logging
import os

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FlightDataCleaner:
    """航空轨迹数据清洗器"""

    def __init__(self, input_file: str, output_file: str):
        self.input_file = input_file
        self.output_file = output_file
        self.stats = {
            'total_flights': 0,
            'total_points': 0,
            'removed_flights': 0,
            'removed_points': 0,
            'negative_altitude': 0,
            'zero_speed': 0,
            'invalid_coordinates': 0
        }

    def load_data(self) -> Dict[str, Any]:
        """加载原始数据"""
        logger.info(f"加载数据: {self.input_file}")
        with open(self.input_file, 'r') as f:
            data = json.load(f)
        self.stats['total_flights'] = len(data['flights'])
        return data

    def clean_point(self, point: Dict[str, Any]) -> bool:
        """
        清洗单个轨迹点
        返回: True-保留, False-删除
        """
        # 检查必要字段
        required_fields = ['lat', 'lng', 'altitude', 'speed', 'timestamp']
        for field in required_fields:
            if field not in point:
                return False

        try:
            lat = float(point['lat'])
            lng = float(point['lng'])
            alt = float(point['altitude'])
            speed = float(point['speed'])
            timestamp = float(point['timestamp'])
        except (ValueError, TypeError):
            return False

        # 检查坐标有效性
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            self.stats['invalid_coordinates'] += 1
            return False

        # 保留负高度值（可能是相对高度或飞行阶段信息）
        is_negative_alt = alt < 0
        if is_negative_alt:
            self.stats['negative_altitude'] += 1

        # 处理零速度
        if speed < 0:
            speed = 0
            self.stats['zero_speed'] += 1

        # 处理航向
        heading = float(point.get('heading', 0))
        if heading < 0 or heading >= 360:
            heading = heading % 360

        # 更新清洗后的点
        point.update({
            'lat': lat,
            'lng': lng,
            'altitude': alt,
            'speed': speed,
            'heading': heading,
            'timestamp': timestamp,
            'is_negative_altitude': is_negative_alt
        })

        return True

    def clean_flight(self, flight: Dict[str, Any]) -> Dict[str, Any]:
        """清洗单个航班数据"""
        trajectory = flight.get('trajectory', [])

        cleaned_trajectory = []
        for point in trajectory:
            if self.clean_point(point):
                cleaned_trajectory.append(point)
            else:
                self.stats['removed_points'] += 1

        flight['trajectory'] = cleaned_trajectory
        flight['point_count'] = len(cleaned_trajectory)

        if len(cleaned_trajectory) < 10:
            self.stats['removed_flights'] += 1
            return None

        if cleaned_trajectory:
            timestamps = [p['timestamp'] for p in cleaned_trajectory]
            flight['time_start'] = min(timestamps)
            flight['time_end'] = max(timestamps)
            flight['duration_hours'] = (max(timestamps) - min(timestamps)) / 3600000

        return flight

    def sort_trajectory(self, flight: Dict[str, Any]) -> Dict[str, Any]:
        """按时间戳排序轨迹点"""
        if 'trajectory' in flight:
            flight['trajectory'] = sorted(
                flight['trajectory'],
                key=lambda x: x['timestamp']
            )
        return flight

    def add_derived_features(self, flight: Dict[str, Any]) -> Dict[str, Any]:
        """添加衍生特征"""
        trajectory = flight['trajectory']

        for i in range(len(trajectory)):
            point = trajectory[i]

            if i == 0:
                point['time_delta'] = 0
            else:
                point['time_delta'] = (point['timestamp'] - trajectory[i-1]['timestamp']) / 1000

            if i > 0:
                prev_point = trajectory[i-1]
                lat_diff = point['lat'] - prev_point['lat']
                lng_diff = point['lng'] - prev_point['lng']
                alt_diff = point['altitude'] - prev_point['altitude']
                speed_diff = point['speed'] - prev_point['speed']

                point['lat_delta'] = lat_diff
                point['lng_delta'] = lng_diff
                point['alt_delta'] = alt_diff
                point['speed_delta'] = speed_diff

                if point['time_delta'] > 0:
                    point['vertical_speed'] = alt_diff / point['time_delta']
                else:
                    point['vertical_speed'] = 0
            else:
                point['lat_delta'] = 0
                point['lng_delta'] = 0
                point['alt_delta'] = 0
                point['speed_delta'] = 0
                point['vertical_speed'] = 0

        return flight

    def run(self) -> Dict[str, Any]:
        """执行完整的清洗流程"""
        logger.info("开始数据清洗...")

        data = self.load_data()
        flights = data['flights']

        cleaned_flights = []
        for i, flight in enumerate(flights):
            if i % 10 == 0:
                logger.info(f"处理航班 {i+1}/{len(flights)}...")

            flight = self.clean_flight(flight)
            if flight is None:
                continue

            flight = self.sort_trajectory(flight)
            flight = self.add_derived_features(flight)

            cleaned_flights.append(flight)

        data['flights'] = cleaned_flights
        data['metadata'] = {
            'total_flights': len(cleaned_flights),
            'cleaned_at': datetime.now().isoformat(),
            'total_trajectory_points': sum(f['point_count'] for f in cleaned_flights),
            'description': '清洗后的ADSB航班轨迹数据（用于LSTM预测）',
            'cleaning_stats': self.stats
        }

        logger.info(f"保存清洗后的数据: {self.output_file}")
        with open(self.output_file, 'w') as f:
            json.dump(data, f, indent=2)

        self.print_stats()

        return data

    def print_stats(self):
        """打印清洗统计信息"""
        logger.info("\n=== 数据清洗统计 ===")
        logger.info(f"原始航班数: {self.stats['total_flights']}")
        logger.info(f"清洗后航班数: {self.stats['total_flights'] - self.stats['removed_flights']}")
        logger.info(f"删除航班数: {self.stats['removed_flights']}")
        logger.info(f"删除轨迹点数: {self.stats['removed_points']}")
        logger.info(f"修正负高度: {self.stats['negative_altitude']}")
        logger.info(f"修正零速度: {self.stats['zero_speed']}")
        logger.info(f"无效坐标: {self.stats['invalid_coordinates']}")


def main():
    """主函数"""
    # 使用web文件夹中的路径
    base_dir = '/Users/liziqi/Desktop/web'
    input_file = os.path.join(base_dir, 'static/data/adsb_flights_combined_simplified.json')
    output_file = os.path.join(base_dir, 'static/data/adsb_flights_cleaned.json')

    cleaner = FlightDataCleaner(input_file, output_file)
    cleaner.run()

    logger.info(f"清洗完成！数据已保存到: {output_file}")


if __name__ == "__main__":
    main()
