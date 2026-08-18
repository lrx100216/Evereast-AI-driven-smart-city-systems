# 架构设计

## 数据流

```
Arduino UNO
  │
  ├─ 超声波 + LED      → Serial JSON
  ├─ 光敏 + 舵机       → Serial JSON
  └─ DHT11 温湿度      → Serial JSON
  │
  ▼
Node.js 后端 (3001)
  │
  ├─ 串口监听
  ├─ TrafficSimulationEngine   (IDM 交通仿真)
  ├─ EnergySimulationEngine    (能源仿真)
  ├─ MARLManager               (11个 DQN agent)
  ├─ JointSimEngine            (耦合优化)
  ├─ WhatIfEngine              (What-If)
  ├─ FederatedEngine           (联邦学习)
  ├─ GenerativeEngine          (生成式模拟)
  ├─ CityFoundationService     (CFM ONNX 推理)
  ├─ ThreadPool                (Worker 线程池)
  ├─ DeepSeek API              (AI 建议)
  └─ Socket.IO 推送
  │
  ▼
React 前端 (5173)
  │
  ├─ Dashboard
  ├─ Traffic
  ├─ Energy
  ├─ Weather
  └─ About
```

## 类型系统 (shared/types.ts)

分了三个层级，但其实有点过度设计了：

- L1: 老的传感器数据类型（向后兼容）
- L2: `CityGlobalState` / `CityGlobalActions`，为了 CFM 强行统一
- L3: `flattenCityState` / `parseModelOutput`，384维 <-> 13维 的转换

后续可能把 L3 的 feature engineering 做得更科学一点，
现在归一化的方式比较粗糙。

## Socket.IO 事件

后端向前端推送的主要事件：

- `traffic:sim` — 交通仿真快照
- `traffic:3d` — 3D 数据（Cesium 用）
- `energy:sim` — 能源仿真快照
- `hardware:data` — 传感器数据
- `marl:progress` — 训练进度
- `joint:snapshot` — 耦合面板数据
- `whatif:progress` — What-If 进度
- `federated:progress` — 联邦学习进度
- `generative:progress` — 生成式模拟进度

## REST API

主要路由：

- `/api/traffic-sim/*` — 交通仿真控制
- `/api/energy-sim/*` — 能源仿真控制
- `/api/weather/*` — 天气数据
- `/api/ai/advice` — AI 建议
- `/api/marl/*` — MARL 训练
- `/api/joint/*` — 耦合优化
- `/api/whatif/*` — What-If
- `/api/federated/*` — 联邦学习
- `/api/generative/*` — 生成式模拟
- `/api/cfm/*` — CFM 推理

具体参数看 `backend/src/routes/` 目录下的源码。

## 串口协议

9600 baud，JSON 行格式。Windows 下自动检测 COM 口，找不到就 fallback 到模拟模式。

示例：
```json
{"type":"traffic","carCount":12,"congestionLevel":45,"averageSpeed":32}
{"type":"energy","solarVoltage":4.2,"batteryLevel":67,"panelAngle":90}
{"type":"weather","temperature":26.5,"humidity":62,"lightIntensity":750}
```

## CFM 架构

输入：CityGlobalState 拍扁成 384 维向量
- 0~255：交通特征（16个路口 x 16维）
- 256~383：能源、天气、时间（128维）

模型：Transformer Encoder，3.2M 参数，ONNX 12.8MB
- 384 -> 4 tokens x 96d -> Linear 256d + PosEmbed
- 6层 Encoder，8头，Pre-LN，GELU
- Mean Pool -> MLP head -> 13维输出
- 输出激活：sigmoid（信号灯）、tanh（电池）、sigmoidx180（太阳能角度）

训练数据来自 IDM + Lyapunov 专家引擎，val_loss 0.0355，
CPU 推理 3-13ms。

## 多核并行

用了 Node.js 的 Worker Threads：

- GenerativeEngine：100 个 MC 场景 batch 分发，~5-8x 加速
- WhatIfEngine：200 次配对仿真 batch 分发，~5-8x 加速
- FederatedEngine：每轮 5 个园区并行训练，~3-4x 加速
- MARLManager：还在主线程，用 Promise.all 做的伪并行，后续考虑上 worker

线程数默认 `os.cpus().length - 1`，可以通过 `SMART_CITY_CPU_COUNT` 环境变量改。
