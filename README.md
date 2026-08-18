# Smart City Energy Regulation System

> Hack Harvard China 2026 · 高中组

一个 AI + IoT 的城市能源与交通协同优化平台。项目比较大，前后端加起来上万行，
主要是我（们）在课余时间断断续续写的，代码里还有不少 TODO 和临时方案。

## 主要功能

- **交通仿真**：基于 IDM 模型做的微观交通仿真，11个路口，支持 MARL 训练
- **MARL 信号控制**：每个路口一个 DQN agent，共享全局 reward，CTDE 架构
- **能源-交通耦合**：拥堵会影响 EV 充电需求，太阳能过剩会推充电优惠
- **What-If 沙盒**：跑对照/干预配对实验，算 ATE 和 p-value
- **联邦学习 + DP**：5个园区本地训练，梯度裁剪+加噪，FedAvg 聚合
- **生成式模拟**：100 次 Monte Carlo 仿真，算包络线
- **能源管理**：Lyapunov 优化电池充放电 + FSM 安全保护
- **天气**：接 Open-Meteo API，光伏出力随云量变
- **CFM 城市基础模型**：Transformer 端到端调度，ONNX 部署

## 技术栈

- 前端：React 19 + TypeScript + Vite + Ant Design + ECharts
- 后端：Node.js + Express + Socket.IO + Worker Threads
- AI：自研 DQN（纯 JS 实现，没依赖 TF.js）+ PyTorch 训练 Transformer
- 硬件：Arduino UNO + 超声波/温湿度/光敏/舵机

## 快速开始

```bash
# 后端
cd backend && npm install && npm run dev

# 前端（另开终端）
cd frontend && npm install && npm run dev
```

环境变量：复制 `backend/.env.example` 成 `backend/.env`，填上 DeepSeek API Key。
不用接硬件的话 `SERIAL_PORT` 留空就行，系统会自动用模拟数据。
`SMART_CITY_CPU_COUNT` 可以控制并行线程数，默认是 CPU 核心数减 1。

---

## 项目结构

```
smart-city/
├── hardware/main/main.ino         # Arduino 主控代码
├── ai_model/train_cfm.py          # CFM 训练脚本（PyTorch）
├── backend/models/city_foundation.onnx  # ONNX 模型
├── shared/types.ts                # 类型定义（有点大，塞了太多东西）
├── backend/src/
│   ├── services/                  # 各种仿真引擎和服务
│   │   ├── trafficSimulation.ts   # 交通仿真
│   │   ├── energySimulation.ts    # 能源仿真
│   │   ├── marl/                  # MARL 训练
│   │   ├── joint/                 # 耦合优化
│   │   ├── whatIf/                # What-If
│   │   ├── federated/             # 联邦学习
│   │   ├── generative/            # 生成式模拟
│   │   └── cityFoundationService.ts # CFM 推理
│   ├── routes/                    # API 路由
│   └── socket/                    # WebSocket
├── frontend/src/
│   ├── pages/                     # 5个页面
│   ├── components/                # 组件
│   └── hooks/                     # 自定义 hooks
└── docs/architecture.md
```

---

## 硬件

没接 Arduino 的话系统会自动用模拟数据，不影响软件运行。

传感器接线：
- HC-SR04 超声波 → D9/D10（测距，用来估车流）
- DHT11 → D7（温湿度）
- LDR 光敏电阻 → A0（光照）
- SG90 舵机 → D11（太阳能板角度）
- LED → D4/D5/D6（信号灯）

数据流：Arduino → Serial JSON → 后端 → Socket.IO → 前端

---

## API

主要接口：
- `GET /api/health` — 健康检查
- `GET /api/traffic-sim/snapshot` — 交通快照
- `GET /api/energy-sim/snapshot` — 能源快照
- `GET /api/weather/current` — 深圳天气
- `POST /api/marl/train/start` — 启动 MARL 训练
- `GET /api/marl/train/status` — 训练状态
- `POST /api/whatif/run` — What-If 仿真
- `POST /api/federated/train/start` — 联邦学习
- `POST /api/generative/run` — 生成式模拟
- `POST /api/cfm/predict` — CFM 推理
- `POST /api/cfm/fast-forward` — CFM 快进预测

完整列表看 `backend/src/routes/` 目录。

---

## 页面

- `/` — Dashboard，数据总览
- `/traffic` — 交通监控 + MARL 训练
- `/energy` — 能源管理
- `/weather` — 环境监测
- `/about` — 项目介绍

## 团队

Hack Harvard China 2026 · 高中组
