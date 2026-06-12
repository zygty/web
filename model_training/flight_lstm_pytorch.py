#!/usr/bin/env python3
"""
航空轨迹LSTM预测模型 - PyTorch实现
使用LSTM神经网络预测飞机的飞行轨迹
"""

import json
import numpy as np
import pandas as pd
from datetime import datetime
import logging
import os
from typing import Dict, Tuple, List, Optional

# PyTorch导入
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
    PYTORCH_AVAILABLE = True
except ImportError:
    PYTORCH_AVAILABLE = False
    print("警告: PyTorch未安装，请运行: pip install torch")

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FlightTrajectoryDataset(Dataset):
    """航班轨迹数据集"""

    def __init__(self, X: np.ndarray, y: np.ndarray):
        self.X = torch.FloatTensor(X)
        self.y = torch.FloatTensor(y)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


class FlightLSTM(nn.Module):
    """航班轨迹LSTM模型"""

    def __init__(self, input_size: int = 5, hidden_size: int = 64,
                 num_layers: int = 2, output_size: int = 4, dropout: float = 0.2):
        super(FlightLSTM, self).__init__()

        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.output_size = output_size

        # LSTM层
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0,
            batch_first=True
        )

        # Dropout层
        self.dropout = nn.Dropout(dropout)

        # 全连接层
        self.fc1 = nn.Linear(hidden_size, 16)
        self.relu = nn.ReLU()

        # 输出层
        self.fc2 = nn.Linear(16, output_size)

    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        last_output = lstm_out[:, -1, :]
        out = self.dropout(last_output)
        out = self.fc1(out)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc2(out)
        return out


class FlightLSTMPredictor:
    """航班轨迹LSTM预测器"""

    def __init__(self, sequence_length: int = 10, hidden_size: int = 64,
                 num_layers: int = 2, learning_rate: float = 0.001,
                 batch_size: int = 32, epochs: int = 50):
        self.sequence_length = sequence_length
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.learning_rate = learning_rate
        self.batch_size = batch_size
        self.epochs = epochs

        self.model = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.norm_params = None

        logger.info(f"使用设备: {self.device}")

    def load_cleaned_data(self, data_file: str) -> Dict:
        """加载清洗后的数据"""
        logger.info(f"加载数据: {data_file}")
        with open(data_file, 'r') as f:
            data = json.load(f)
        return data

    def prepare_sequences(self, data: Dict) -> Tuple[np.ndarray, np.ndarray]:
        """准备训练序列"""
        logger.info("准备训练序列...")

        all_sequences_X = []
        all_sequences_y = []

        for flight in data['flights']:
            trajectory = flight['trajectory']

            if len(trajectory) < self.sequence_length + 1:
                continue

            for i in range(len(trajectory) - self.sequence_length):
                sequence_X = []
                for j in range(i, i + self.sequence_length):
                    point = trajectory[j]
                    features = [
                        point['lat'],
                        point['lng'],
                        point['altitude'],
                        point['speed'],
                        point['heading']
                    ]
                    sequence_X.append(features)

                next_point = trajectory[i + self.sequence_length]
                target_y = [
                    next_point['lat'],
                    next_point['lng'],
                    next_point['altitude'],
                    next_point['speed']
                ]

                all_sequences_X.append(sequence_X)
                all_sequences_y.append(target_y)

        X = np.array(all_sequences_X)
        y = np.array(all_sequences_y)

        logger.info(f"创建了 {len(X)} 个训练序列")
        logger.info(f"输入形状: {X.shape}")
        logger.info(f"输出形状: {y.shape}")

        return X, y

    def normalize_data(self, X: np.ndarray, y: np.ndarray) -> Tuple:
        """标准化数据"""
        logger.info("标准化数据...")

        X_reshaped = X.reshape(-1, X.shape[-1])
        X_mean = X_reshaped.mean(axis=0)
        X_std = X_reshaped.std(axis=0) + 1e-8

        X_norm = (X - X_mean) / X_std

        y_mean = y.mean(axis=0)
        y_std = y.std(axis=0) + 1e-8

        y_norm = (y - y_mean) / y_std

        self.norm_params = {
            'X_mean': X_mean.tolist(),
            'X_std': X_std.tolist(),
            'y_mean': y_mean.tolist(),
            'y_std': y_std.tolist()
        }

        logger.info(f"输入均值: {X_mean}")
        logger.info(f"输入标准差: {X_std}")

        return X_norm, y_norm

    def split_data(self, X: np.ndarray, y: np.ndarray,
                   train_ratio: float = 0.8) -> Tuple:
        """分割训练集和测试集"""
        split_idx = int(len(X) * train_ratio)

        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        logger.info(f"训练集大小: {len(X_train)}")
        logger.info(f"测试集大小: {len(X_test)}")

        return X_train, X_test, y_train, y_test

    def create_model(self):
        """创建LSTM模型"""
        logger.info("创建LSTM模型...")

        self.model = FlightLSTM(
            input_size=5,
            hidden_size=self.hidden_size,
            num_layers=self.num_layers,
            output_size=4,
            dropout=0.2
        )

        self.model.to(self.device)

        logger.info(f"模型结构:\n{self.model}")

        total_params = sum(p.numel() for p in self.model.parameters())
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)

        logger.info(f"总参数: {total_params}")
        logger.info(f"可训练参数: {trainable_params}")

    def train(self, X_train: np.ndarray, y_train: np.ndarray,
              X_test: np.ndarray, y_test: np.ndarray):
        """训练模型"""
        if not PYTORCH_AVAILABLE:
            logger.error("PyTorch未安装，无法训练模型")
            return None

        logger.info("开始训练模型...")

        train_dataset = FlightTrajectoryDataset(X_train, y_train)
        test_dataset = FlightTrajectoryDataset(X_test, y_test)

        train_loader = DataLoader(train_dataset, batch_size=self.batch_size, shuffle=True)
        test_loader = DataLoader(test_dataset, batch_size=self.batch_size, shuffle=False)

        self.create_model()

        criterion = nn.MSELoss()
        optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)

        best_loss = float('inf')
        train_losses = []
        test_losses = []

        for epoch in range(self.epochs):
            # 训练阶段
            self.model.train()
            train_loss = 0.0

            for batch_X, batch_y in train_loader:
                batch_X = batch_X.to(self.device)
                batch_y = batch_y.to(self.device)

                optimizer.zero_grad()
                outputs = self.model(batch_X)
                loss = criterion(outputs, batch_y)
                loss.backward()
                optimizer.step()

                train_loss += loss.item() * batch_X.size(0)

            train_loss /= len(train_dataset)
            train_losses.append(train_loss)

            # 验证阶段
            self.model.eval()
            test_loss = 0.0

            with torch.no_grad():
                for batch_X, batch_y in test_loader:
                    batch_X = batch_X.to(self.device)
                    batch_y = batch_y.to(self.device)

                    outputs = self.model(batch_X)
                    loss = criterion(outputs, batch_y)

                    test_loss += loss.item() * batch_X.size(0)

            test_loss /= len(test_dataset)
            test_losses.append(test_loss)

            if test_loss < best_loss:
                best_loss = test_loss
                self.save_model('best_model.pth')

            if (epoch + 1) % 10 == 0:
                logger.info(f'Epoch [{epoch+1}/{self.epochs}], '
                          f'Train Loss: {train_loss:.6f}, Test Loss: {test_loss:.6f}')

        logger.info(f"训练完成! 最佳测试损失: {best_loss:.6f}")

        return train_losses, test_losses

    def save_model(self, filename: str, save_dir: str = None):
        """保存模型"""
        if self.model is None:
            logger.warning("没有模型可以保存")
            return

        if save_dir is None:
            save_dir = '/Users/liziqi/Desktop/web/model_training'

        model_path = os.path.join(save_dir, filename)
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'model_config': {
                'input_size': 5,
                'hidden_size': self.hidden_size,
                'num_layers': self.num_layers,
                'output_size': 4,
                'dropout': 0.2
            },
            'norm_params': self.norm_params,
            'sequence_length': self.sequence_length
        }, model_path)

        logger.info(f"模型已保存: {model_path}")

    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> Dict:
        """评估模型性能"""
        if self.model is None:
            logger.error("模型未加载")
            return None

        logger.info("评估模型性能...")

        test_dataset = FlightTrajectoryDataset(X_test, y_test)
        test_loader = DataLoader(test_dataset, batch_size=self.batch_size, shuffle=False)

        self.model.eval()

        predictions = []
        actuals = []

        with torch.no_grad():
            for batch_X, batch_y in test_loader:
                batch_X = batch_X.to(self.device)
                batch_y = batch_y.to(self.device)

                outputs = self.model(batch_X)

                predictions.extend(outputs.cpu().numpy())
                actuals.extend(batch_y.cpu().numpy())

        predictions = np.array(predictions)
        actuals = np.array(actuals)

        y_mean = np.array(self.norm_params['y_mean'])
        y_std = np.array(self.norm_params['y_std'])

        predictions = predictions * y_std + y_mean
        actuals = actuals * y_std + y_mean

        lat_errors = np.abs(predictions[:, 0] - actuals[:, 0])
        lng_errors = np.abs(predictions[:, 1] - actuals[:, 1])
        alt_errors = np.abs(predictions[:, 2] - actuals[:, 2])
        speed_errors = np.abs(predictions[:, 3] - actuals[:, 3])

        results = {
            'lat_mae': float(np.mean(lat_errors)),
            'lng_mae': float(np.mean(lng_errors)),
            'alt_mae': float(np.mean(alt_errors)),
            'speed_mae': float(np.mean(speed_errors)),
            'lat_rmse': float(np.sqrt(np.mean((predictions[:, 0] - actuals[:, 0])**2))),
            'lng_rmse': float(np.sqrt(np.mean((predictions[:, 1] - actuals[:, 1])**2))),
            'alt_rmse': float(np.sqrt(np.mean((predictions[:, 2] - actuals[:, 2])**2))),
            'speed_rmse': float(np.sqrt(np.mean((predictions[:, 3] - actuals[:, 3])**2)))
        }

        logger.info("\n=== 模型评估结果 ===")
        logger.info(f"纬度 MAE: {results['lat_mae']:.6f}度")
        logger.info(f"经度 MAE: {results['lng_mae']:.6f}度")
        logger.info(f"高度 MAE: {results['alt_mae']:.2f}米")
        logger.info(f"速度 MAE: {results['speed_mae']:.2f}km/h")

        return results

    def run_training(self, data_file: str) -> Dict:
        """执行完整的训练流程"""
        logger.info("开始LSTM模型训练流程...")

        data = self.load_cleaned_data(data_file)
        X, y = self.prepare_sequences(data)
        X_norm, y_norm = self.normalize_data(X, y)
        X_train, X_test, y_train, y_test = self.split_data(X_norm, y_norm)
        train_losses, test_losses = self.train(X_train, y_train, X_test, y_test)
        evaluation_results = self.evaluate(X_test, y_test)

        base_dir = '/Users/liziqi/Desktop/web'
        with open(os.path.join(base_dir, 'norm_params.json'), 'w') as f:
            json.dump(self.norm_params, f, indent=2)

        logger.info("\n=== 训练完成 ===")
        logger.info(f"模型已保存: {os.path.join(base_dir, 'best_model.pth')}")
        logger.info(f"标准化参数: {os.path.join(base_dir, 'norm_params.json')}")

        return {
            'train_losses': train_losses,
            'test_losses': test_losses,
            'evaluation': evaluation_results
        }


def main():
    """主函数"""
    base_dir = '/Users/liziqi/Desktop/web'
    cleaned_data_file = os.path.join(base_dir, 'static/data/adsb_flights_cleaned.json')

    predictor = FlightLSTMPredictor(
        sequence_length=10,
        hidden_size=64,
        num_layers=2,
        learning_rate=0.001,
        batch_size=32,
        epochs=50
    )

    results = predictor.run_training(cleaned_data_file)

    logger.info("\n下一步:")
    logger.info("1. 模型已保存，可以用于实时预测")
    logger.info("2. 启动API服务器: python3 flight_prediction_api.py")


if __name__ == "__main__":
    main()
