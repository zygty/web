#!/usr/bin/env python3
"""
航空轨迹预测API服务器
提供REST API接口用于飞机轨迹预测
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import numpy as np
import logging
import os

# PyTorch导入
try:
    import torch
    import torch.nn as nn
    PYTORCH_AVAILABLE = True
except ImportError:
    PYTORCH_AVAILABLE = False
    print("警告: PyTorch未安装，请运行: pip install torch")

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# 全局变量
model = None
norm_params = None
sequence_length = 10
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# 设置基础目录为model_training文件夹
BASE_DIR = '/Users/liziqi/Desktop/web/model_training'


class FlightLSTM(nn.Module):
    """航班轨迹LSTM模型"""

    def __init__(self, input_size=5, hidden_size=64, num_layers=2, output_size=4, dropout=0.2):
        super(FlightLSTM, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, dropout=dropout if num_layers > 1 else 0, batch_first=True)
        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden_size, 16)
        self.relu = nn.ReLU()
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


def load_model():
    """加载训练好的模型"""
    global model, norm_params, sequence_length

    model_path = os.path.join(BASE_DIR, 'best_model.pth')
    norm_params_path = os.path.join(BASE_DIR, 'norm_params.json')

    if not os.path.exists(model_path):
        logger.warning(f"模型文件不存在: {model_path}")
        return False

    if not os.path.exists(norm_params_path):
        logger.warning(f"标准化参数文件不存在: {norm_params_path}")
        return False

    try:
        with open(norm_params_path, 'r') as f:
            norm_params_data = json.load(f)
        norm_params = norm_params_data

        checkpoint = torch.load(model_path, map_location=device)

        model = FlightLSTM(
            input_size=checkpoint['model_config']['input_size'],
            hidden_size=checkpoint['model_config']['hidden_size'],
            num_layers=checkpoint['model_config']['num_layers'],
            output_size=checkpoint['model_config']['output_size'],
            dropout=checkpoint['model_config']['dropout']
        )

        model.load_state_dict(checkpoint['model_state_dict'])
        model.to(device)
        model.eval()

        sequence_length = checkpoint['sequence_length']

        logger.info(f"模型加载成功，使用设备: {device}")
        return True

    except Exception as e:
        logger.error(f"模型加载失败: {e}")
        return False


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'device': str(device)
    })


@app.route('/api/predict', methods=['POST'])
def predict_trajectory():
    """预测轨迹API"""
    if model is None:
        return jsonify({'error': '模型未加载'}), 500

    try:
        data = request.json
        trajectory = data.get('trajectory', [])
        steps = data.get('steps', 1)

        if len(trajectory) < sequence_length:
            return jsonify({'error': f'轨迹长度不足，需要至少{sequence_length}个点'}), 400

        current_trajectory = trajectory.copy()
        predictions = []

        for step in range(steps):
            sequence = []
            for point in current_trajectory[-sequence_length:]:
                sequence.append([
                    point['lat'],
                    point['lng'],
                    point['altitude'],
                    point['speed'],
                    point['heading']
                ])

            X = np.array([sequence])

            X_mean = np.array(norm_params['X_mean'])
            X_std = np.array(norm_params['X_std'])
            X_norm = (X - X_mean) / X_std

            X_tensor = torch.FloatTensor(X_norm).to(device)

            with torch.no_grad():
                y_pred_norm = model(X_tensor)
                y_pred = y_pred_norm.cpu().numpy()

            y_mean = np.array(norm_params['y_mean'])
            y_std = np.array(norm_params['y_std'])
            y_pred = y_pred * y_std + y_mean

            last_point = current_trajectory[-1]
            pred_point = {
                'lat': float(y_pred[0][0]),
                'lng': float(y_pred[0][1]),
                'altitude': float(y_pred[0][2]),
                'speed': float(y_pred[0][3]),
                'heading': last_point.get('heading', 0)
            }

            predictions.append(pred_point)
            current_trajectory.append(pred_point)

        return jsonify({
            'predictions': predictions,
            'sequence_used': sequence_length,
            'steps_predicted': steps
        })

    except Exception as e:
        logger.error(f"预测失败: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/predict/batch', methods=['POST'])
def predict_batch():
    """批量预测API"""
    if model is None:
        return jsonify({'error': '模型未加载'}), 500

    try:
        data = request.json
        flights = data.get('flights', {})
        steps = data.get('steps', 1)

        results = {}

        for flight_id, trajectory in flights.items():
            if len(trajectory) < sequence_length:
                results[flight_id] = {'error': f'轨迹长度不足，需要至少{sequence_length}个点'}
                continue

            current_trajectory = trajectory.copy()
            predictions = []

            for step in range(steps):
                sequence = []
                for point in current_trajectory[-sequence_length:]:
                    sequence.append([
                        point['lat'],
                        point['lng'],
                        point['altitude'],
                        point['speed'],
                        point['heading']
                    ])

                X = np.array([sequence])
                X_mean = np.array(norm_params['X_mean'])
                X_std = np.array(norm_params['X_std'])
                X_norm = (X - X_mean) / X_std

                X_tensor = torch.FloatTensor(X_norm).to(device)

                with torch.no_grad():
                    y_pred_norm = model(X_tensor)
                    y_pred = y_pred_norm.cpu().numpy()

                y_mean = np.array(norm_params['y_mean'])
                y_std = np.array(norm_params['y_std'])
                y_pred = y_pred * y_std + y_mean

                last_point = current_trajectory[-1]
                pred_point = {
                    'lat': float(y_pred[0][0]),
                    'lng': float(y_pred[0][1]),
                    'altitude': float(y_pred[0][2]),
                    'speed': float(y_pred[0][3]),
                    'heading': last_point.get('heading', 0)
                }

                predictions.append(pred_point)
                current_trajectory.append(pred_point)

            results[flight_id] = predictions

        return jsonify({'results': results})

    except Exception as e:
        logger.error(f"批量预测失败: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    if load_model():
        logger.info("启动预测API服务器...")
        logger.info("服务器将在 http://localhost:5001 上运行")
        app.run(host='0.0.0.0', port=5001, debug=True)
    else:
        logger.error("无法启动服务器：模型加载失败")
