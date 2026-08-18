# 更新日志

项目开发记录，想到什么写什么，格式不太统一。

---

---

## 2026-05-24 — types.ts 大改，加了 CityGlobalState

之前类型定义散落在各个文件里，CFM 要统一输入的时候很痛苦。
于是把 traffic / energy / env 的状态全塞进一个 `CityGlobalState` 里，
再提供 `flattenCityState()` 拍成 384 维向量。

改动挺大的，但老的 L1 接口（TrafficData 那些）保留没动，怕改崩。

还写了 `shared/types.test.ts`，14个测试，主要测 flatten 和 parse 的维度对不对。

顺手更新了 README 和 setup.md。

文件：
- `shared/types.ts` 重写
- `shared/types.test.ts` 新增
- `docs/architecture.md` 更新

---

## 2026-05-24 — CFM 重训练，效果好了很多

v1 用随机数据训练，val_loss 1.99，所有路口输出都是 0.51 左右，完全没用。

v2 从 trafficSimulation + energySimulation 里采集了 10,000 条专家决策数据，
重训之后 val_loss 降到 0.0355，路口信号终于有区分度了。

还加了 `/api/cfm/fast-forward` 接口，从当前仿真状态直接推理，3ms，
比跑完整仿真快很多。

文件：
- `collectCfmData.ts` 新增
- `cfm_training.json` 新增（64MB）
- `city_foundation.onnx` 更新

---

## 2026-05-24 — CFM 城市基础模型初版

写了一个基于 Transformer Encoder 的调度模型，输入 384 维状态，输出 13 维控制。

参数量 3.2M，不算大，ONNX 推理 CPU 上 13ms，够用。

初版训练数据是随机合成的，效果很差（val_loss 1.99），
后续版本（见上一条）用专家数据重训后才好用。

加了 cityFoundationService.ts 做 ONNX Runtime 推理，
模型没加载的时候会自动降级成 heuristic 规则。

文件：
- `train_cfm.py` 新增
- `city_foundation.onnx` 新增
- `cityFoundationService.ts` 新增
- `cfm.ts` 路由新增

---

## 2026-05-24 — 修了两个 bug：调速精度和竞态条件

调速滑块拖了没反应，排查发现两个问题：

1. `getSpeed()` 精度丢失：用了 `Math.round(x*10)/10`，0.25 会变成 0.3。
   改成 `/100` 解决。

2. `setSpeed()` 有竞态：clearTimeout 挡不住已经触发但还没执行的 callback，
   结果出现两条 tick 链。加了 `tickGeneration` counter，旧 callback 发现 generation
   对不上就自动退出。

另外 energySimulation.ts 里 `intervalId` 的类型写错了，写的是 `setInterval`
的返回类型但实际用的是 `setTimeout` 递归，顺手修正。

文件：
- `trafficSimulation.ts`
- `energySimulation.ts`

---

## 2026-05-24 — MARL 训练提速，从 2.5h 降到 ~28min

调了几个参数：
- episodes: 1000 -> 500（500轮目测够收敛）
- stepsPerEpisode: 480 -> 180（只跑早高峰 3 小时，不用全天）
- hiddenLayers: [64,64] -> [48,32]（网络小了很多，算得快）
- learningRate: 0.001 -> 0.002（步子迈大一点）

综合下来 5 倍左右加速，训练质量没发现明显下降。

文件：
- `marl/types.ts` 默认配置
| `epsilonDecay` | 0.997 | 0.993 | 更快进入利用阶段 |
| `targetUpdateFreq` | 200 | 120 | 更频繁同步目标网络 |
| `trainStartSize` | 500 | 350 | 更早开始训练 |
| `rewardTravelWeight` | 0.6 | 0.5 | 排队与等待均衡 |
| `rewardQueueWeight` | 0.4 | 0.5 | 排队与等待均衡 |
| 车辆上限 | 2500 | 2000 | 减少物理计算量 |

**质量保障：**
- 500 回合 × 36 决策步 = 18,000 次训练迭代，足以学习有效信号策略
- 3 小时早高峰覆盖最关键的拥堵时段
- 更频繁的目标网络同步 + 双倍学习率补偿步数减少
- ε 衰减节奏保证前 100 回合充分探索

#### 修改文件
- `backend/src/services/marl/types.ts` — DEFAULT_MARL_CONFIG 全面调优
- `backend/src/services/marl/MarlManager.ts` — 车辆上限 2500→2000

---

## [2026-05-24] - 多核并行训练 + Bug 修复 + macOS 适配

### 多核并行化 — Worker Thread 池

- **ThreadPool** (`backend/src/services/threadPool.ts`): CPU 自适应工作线程池
  - 自动检测 `os.cpus().length`，默认使用 (全部核心 - 1)，可设 `SMART_CITY_CPU_COUNT` 覆盖
  - 持久化 Worker 复用（无重复 spawn 开销）
  - `pool.map()` — 轮询分发任务、按序收集结果、错误隔离
  - `pool.terminate()` — 优雅关闭所有线程
- **worker 入口**: `threadPool.worker.js` (CJS 引导) + `threadPool.worker.ts` (实际逻辑)
  - 采用 `require()` + `createRequire`，兼容 tsx / vitest / Windows 绝对路径
  - 支持同步与异步函数调用

### 引擎并行化

| 引擎 | 策略 | 预期加速 |
|------|------|---------|
| **GenerativeEngine** | 100 个 Monte Carlo 场景分批发到所有核心 | ~5-8× |
| **WhatIfEngine** | 200 次成对仿真(对照+干预)并行执行 | ~5-8× |
| **FederatedEngine** | 每轮 5 个园区并行本地训练 | ~3-4× |
| **MARLManager** | `Promise.all` 批处理 Agent 动作选择+训练 | 结构优化 |

每个引擎均新增 `offProgress()` / `offTick()` 方法防止回调泄漏。

### Bug 修复（12 项）

| # | 严重度 | 位置 | 问题 | 修复 |
|---|--------|------|------|------|
| B1 | HIGH | `backend/src/index.ts:206` | `require.main===module` 在 tsx ESM 下失效导致服务器静默不启动 | 添加 `process.argv[1]` 兜底检测 |
| B2 | MEDIUM | `backend/src/index.ts:186` | `updateCloudFactor` 空 catch 吞掉所有错误无日志 | 添加 `console.warn` 日志 |
| B3 | MEDIUM | 6 个引擎文件 | `onProgress` 回调数组无界增长，重复注册 | 全部添加 `offProgress`/`offTick`，`index.ts` 在 SIGTERM/SIGINT 时清理 |
| B4 | LOW | `backend/src/services/aiService.ts` | `require('openai')` 与 ESM 不一致 | 改为 `await import('openai')` |
| B5 | HIGH | `frontend/src/hooks/useEnergySim.ts` | fetch 失败时 catch 未设 `loading=false` 导致永久 loading | 在 catch 中设置 `setLoading(false)` |
| B6 | MEDIUM | `frontend/src/hooks/useSocket.ts` | `sendCommand` 调用 `getSharedSocket()` 未释放引用，Socket 永远无法断开 | 添加 `releaseSharedSocket()` |
| B7 | MEDIUM | `frontend/src/hooks/useJoint.ts` | 孤立的 `/api/joint/status` fetch 无用途 | 移除 |
| B8 | LOW | `frontend/src/pages/Dashboard/index.tsx` | `useState(true)` 从不更新 | 改为 `const mounted = true` |
| B9 | MEDIUM | `serialManager.ts` + `useWeather.ts`(3处) | `new Date(toLocaleString(...))` 在 macOS 返回 Invalid Date | 改为 UTC+8 算术计算 |
| B10 | MEDIUM | `start.sh` | 后端启动超时无错误提示 | 添加 15s 超时检测 + 清理 + exit 1 |

### macOS 兼容性

- 时区解析：抛弃 `toLocaleString` + `new Date()` 模式，改用 `getUTCHours()+8` 算术
- Shell 脚本：`start.sh` 支持后端启动超时报错

### 测试

- 后端: 11 files, 89 tests passed (新增 threadPool.test.ts)
- 前端: 4 files, 30 tests passed
- 服务器启动验证通过

#### 新增/修改文件
- `backend/src/services/threadPool.ts` — 核心线程池 (NEW)
- `backend/src/services/threadPool.worker.js` — CJS Worker 引导 (NEW)
- `backend/src/services/threadPool.worker.ts` — Worker 实际逻辑 (NEW)
- `backend/src/services/threadPool.test.ts` — 线程池测试 (NEW)
- `backend/src/services/generative/GenerativeEngine.ts` — 多核并行 + offProgress
- `backend/src/services/whatIf/WhatIfEngine.ts` — 多核并行 + offProgress
- `backend/src/services/federated/FederatedEngine.ts` — 多核并行 + offProgress
- `backend/src/services/marl/MarlManager.ts` — Promise.all 批处理 + offProgress
- `backend/src/services/joint/JointSimEngine.ts` — offTick 方法
- `backend/src/index.ts` — B1/B2/B3 修复 + 回调清理
- `backend/src/services/aiService.ts` — B4 修复
- `backend/src/serial/serialManager.ts` — B9 修复
- `frontend/src/hooks/useEnergySim.ts` — B5 修复
- `frontend/src/hooks/useSocket.ts` — B6 修复
- `frontend/src/hooks/useJoint.ts` — B7 修复
- `frontend/src/hooks/useWeather.ts` — B9 修复
- `frontend/src/pages/Dashboard/index.tsx` — B8 修复
- `start.sh` — B10 修复

---

## [2026-05-23] - CesiumJS 深圳 3D 数字孪生

### 3D Digital Twin — Real Shenzhen Road Network

- **CesiumJS 3D 地球**: 暗色地图底图(CartoDB Dark)，深圳湾片区中心视角
- **实时车流粒子**: Vehicle3D → Canvas 彩色圆点 billboard，含类型/速度/朝向/目的地
- **路口信号灯 3D**: 每个路口 4 方向信号灯(红/黄/绿)，实时同步仿真状态
- **5 栋深圳地标建筑**: 平安金融中心/京基100/地王大厦/腾讯滨海/深圳湾体育中心 Box entities
- **道路连线**: PolylineGlowMaterial 蓝光道路网络
- **HUD 叠加层**: 车辆计数 + 时间 + 车类型图例
- **新增页面**: `/cesium` — 全屏 3D 视图，侧边栏"3D 数字孪生"入口
- **后端**: `Traffic3DSnapshot` (Vehicle3D + Intersection3D)，11 个路口映射真实深圳经纬度
- **Socket.IO**: `traffic:3d` 事件实时推送车辆位置

#### 坐标映射
| 路口 | 真实位置 | 经纬度 |
|------|---------|--------|
| 创新大道 | 南山科技园 | 22.540, 113.950 |
| AI大道 | 南山科技园 | 22.543, 113.955 |
| 主街 | 福田CBD | 22.545, 114.055 |
| 购物大道 | 福田CBD | 22.548, 114.060 |

#### 新增/修改文件
- `frontend/src/components/CesiumViewer/index.tsx` — 3D 查看器核心
- `frontend/src/pages/Cesium3D/index.tsx` — 3D 页面
- `frontend/vite.config.ts` — CESIUM_BASE_URL 配置
- `frontend/public/cesium/` — Cesium 静态资源
- `backend/src/services/trafficSimulation.ts` — +GeoPosition, +Vehicle3D, +get3DSnapshot()
- `backend/src/index.ts` — +traffic:3d Socket.IO 事件
- `frontend/src/App.tsx` — +/cesium 路由
- `frontend/src/components/Layout/index.tsx` — +3D 导航项
- `frontend/src/i18n/{types,zh,en}.ts` — +cesium nav 键
- `frontend/src/index.css` — +Cesium CSS 导入

---

### Privacy-Preserving Smart City — FL + DP

- **FederatedEngine**: 5园区本地训练 NN → 梯度裁剪(L2) + 高斯DP噪声 → FedAvg 聚合
- **隐私滑块**: σ ∈ [0.1, 10]，ε = √(2qR·log(1/δ))/σ
- **实测**: σ=1 → ε=15.17 (低隐私), σ=5 → ε=3.03 (高隐私)
- **前端**: 紫色主题面板 + SVG 权衡曲线 + 隐私滑块 + ε/loss/zones 指标
- **新增**: `federated/` 引擎, API routes, PrivacyPanel, i18n
- **测试**: 73+25=98 tests passed

---

## [2026-05-23] - 能源-交通耦合优化

### Joint Energy-Traffic Optimization

#### 数据链路打通
- **交通拥堵 → EV 充电需求**: 每个充电站根据所在路口排队长度动态计算充电车辆数，拥堵越严重充电需求越高
- **太阳能过剩 → 动态降价**: 光伏出力超过总负荷 20% 时触发降价，最高折扣 60%，电价可低于谷价 0.26 元
- **碳感知 Lyapunov 优化**: 综合成本 = 电费 + 碳价(0.06 ¥/kg CO₂) × 电网碳强度(基准 0.5, 峰值 +0.15)

#### 后端实现
- **JointSimEngine**: 每 5 模拟分钟同时推进交通 + 能量仿真
  - 8 个 EV 充电站分布于各主要路口（超充/快充/社区充电）
  - 充电需求 = 基础空载 + 拥堵驱动，排队机制
  - 太阳能折扣 = min(0.6, surplusRatio × 2)，surplusRatio = (solar - load) / load
  - 推送触发条件：折扣 > 30% 且当前价 < 谷价 × 0.7
- **API**: GET `/api/joint/stations` / `/api/joint/notifications`
- **Socket.IO**: `joint:snapshot` 实时推送完整耦合快照

#### 前端 JointPanel
- 太阳能过剩绿色 Banner + 推送消息显示
- 成本三分栏（电费/碳成本/综合成本蓝橙绿配色）
- 8 站充电卡片网格（动态价格、车辆数/容量、负荷 kW、排队提示）
- 底部汇总栏（总充电负荷 / 拥堵指数 / 电网负荷）

#### 新增/修改文件
- `backend/src/services/joint/JointSimEngine.ts` — 核心耦合引擎
- `backend/src/services/joint/types.ts` — 充电站 + 快照类型
- `backend/src/services/joint/index.ts`
- `backend/src/routes/joint.ts`
- `backend/src/services/energySimulation.ts` — 添加 `resetSimTime()` 方法
- `backend/src/index.ts` — 集成 joint simulation
- `frontend/src/components/JointPanel/index.tsx` — 耦合可视化面板
- `frontend/src/hooks/useJoint.ts`
- `frontend/src/pages/Dashboard/index.tsx` — 集成 JointPanel
- `frontend/src/i18n/{types,zh,en}.ts` — 新增 joint 翻译分区
- `frontend/src/i18n/translations.test.ts` — 新增测试

---

### MARL 训练进度区域美化
- **环形百分比指示器**: conic-gradient 圆环 + 中心百分比数字，发光阴影随进度增强
- **渐变进度条**: 绿色渐变 linear-gradient(90deg, #43a047, #66bb6a, #81c784) + glow box-shadow
- **大三色时间卡片**: 已用时间(蓝) / 单轮平均(橙) / 预计剩余(绿)，每卡带图标、渐变背景、彩色边框
- **Episode 计数**: 大号数字 (26px, 700 weight) + `/ 1000` 对照，视觉层次分明
- **底部速览条**: ε 探索率 + loss + avg speed 一行展示
- **完成状态卡片**: 总用时(绿) / 完成回合(蓝) 双卡布局
- **指标卡改为双列网格**: 6 个指标分两列排布，更紧凑
- 移除未使用的 antd Progress 导入

---

### 因果推理 · What-If 沙盒

#### 核心实现
- **WhatIfEngine**: 成对仿真（对照 vs 干预）→ ATE + 95% CI + p-value，以现有仿真引擎为结构因果模型（SCM）
- **6 个预定义场景**: 南山区封路 / 福田CBD封路 / 太阳能倾角 / 峰谷电价差 / 短信号周期 / 主干道优先
- **配对 t 检验**: 零方差边界处理（确定系统 ATE≠0→p=0，ATE=0→p=1），极端 t 值 p-value 钳制 [0,1]

#### 交通仿真增强
- `closeSegment()` / `closeSegmentsAround()` / `reopenSegment()` — 路段封闭支持
- `isSegmentClosed()` — 封闭状态查询
- 生成和路口处理中跳过封闭路段，车辆自动绕行或退出

#### 能量仿真增强
- `tickRaw()` — 无回调静默 tick（WhatIf 快进用）
- `setSolarMultiplier()` / `setPriceMultiplier()` — 干预参数注入
- `solarMultiplier` 集成到 `getSolarOutput()`, `priceMultiplier` 集成到电价计算
- 导出 `EnergySimulationEngine` 类

#### API (`backend/src/routes/whatIf.ts`)
- `GET  /api/whatif/scenarios` — 预定义场景列表
- `POST /api/whatif/run` — 启动 WhatIf 仿真（异步）
- `POST /api/whatif/stop` — 停止
- `GET  /api/whatif/results/:id` — 单场景结果
- `GET  /api/whatif/results` — 所有结果
- Socket.IO `whatif:progress` 事件 — 实时推送进度

#### 前端 WhatIfPanel
- 场景下拉选择器（中英双语标签）
- 仿真次数可调 (10-200)
- 进度条实时显示
- 结果表：每个指标的 ATE、对照/干预均值、95% CI、p-value、显著性标签
- SVG DAG 因果图（干预→中介→结果，交通/能源两类图）
- 对照组 vs 干预组横向柱状对比图

#### 实测结果示例（福田 CBD 封路，10 runs）
| 指标 | ATE | 95% CI | P |
|------|-----|--------|---|
| 平均车速 | **-1.9 km/h** (-16.6%) | [-2.1, -1.8] | 0.07 |
| 排队长度 | **+93 veh** (+14.0%) | [84.7, 101.7] | 0.08 |
| 平均等待 | **+139 s** (+27.3%) | [116.2, 161.6] | 0.12 |
| 通行量 | **-1001 veh** (-7.1%) | [-1237, -766] | 0.14 |

#### 新增/修改文件
- `backend/src/services/whatIf/WhatIfEngine.ts` — 核心引擎
- `backend/src/services/whatIf/types.ts` — 类型 + 6 场景 + DAG 定义
- `backend/src/services/whatIf/index.ts`
- `backend/src/routes/whatIf.ts`
- `frontend/src/components/WhatIfPanel/index.tsx` — 完整面板（DAG+图表+结果表）
- `frontend/src/hooks/useWhatIf.ts`
- `backend/src/index.ts` — 路由 + Socket.IO 事件
- `backend/src/services/trafficSimulation.ts` — 路段封闭支持
- `backend/src/services/energySimulation.ts` — tickRaw + 干预参数注入
- `frontend/src/pages/{Traffic,Energy}/index.tsx` — 集成 WhatIfPanel
- `frontend/src/i18n/{types,zh,en}.ts` — 新增 whatIf 翻译分区
- `frontend/src/i18n/translations.test.ts` — 新增测试

---

### MARL 训练性能修复 — 车辆上限 + 中回合进度

#### 问题诊断
- 训练仿真中车辆无限堆积（80 分钟达 12,747 辆），导致 IDM 计算量爆炸
- 每集从 137ms 增长到 1175ms/步，单集需 130 秒，1000 集需 36 小时
- 只在回合结束推送进度，用户看到 0% 长时间无反馈

#### 修复
- **车辆上限**: `setMaxVehicles(2500)` — 仿真达到上限后暂停生成，同时记录退出计数确保流通
- **中回合进度推送**: 每 3 步（15 模拟分钟）yield 事件循环 + 推送 `marl:progress`
- **回合长度**: `stepsPerEpisode` 从 1440 → 480（8 模拟小时），96 个决策步
- **修复结果**: 每步稳定 ~94ms，每集 ~8 秒，1000 集约 2.2 小时
- **时间追踪修复**: 中回合 yield 和回合结束不再双重累加 `totalElapsedMs`
- **前端增强**: 添加已用时间/单轮平均/预计剩余三列卡片显示
- **文件命名修复**: `MARLManager` → `MarlManager` 消除 TypeScript 大小写警告

---

#### 核心实现
- **DQN 智能体** (`backend/src/services/marl/DQNAgent.ts`): 每个路口一个独立 DQN Agent，在线/目标双网络架构
- **神经网络** (`backend/src/services/marl/NeuralNetwork.ts`): 从零实现的轻量级前馈神经网络，He 初始化 + ReLU 激活 + MSE 损失 + 梯度裁剪，无外部依赖
- **经验回放** (`backend/src/services/marl/ReplayBuffer.ts`): 固定容量环形缓冲区，随机批量采样
- **MARL 管理器** (`backend/src/services/marl/MARLManager.ts`): CTDE 架构，集中训练/分散执行，1000 episode 训练循环，全局奖励（排队减少 + 通行时间 + 碳排放）

#### 状态/动作空间
- **状态 (17维)**: 各方向排队长度 [4] + 信号相位 one-hot [4] + 相邻路口排队 [4] + 时间特征(正余弦) [3] + 天气(云量/温度) [2]
- **动作 (3个)**: 延长绿灯 / 缩短红灯 / 保持 → 对应调整当前相位绿时 ±5s 或不变
- **奖励**: α·排队减少 + β·等待时间减少 + (1-α-β)·碳排放减少

#### 交通仿真增强 (`backend/src/services/trafficSimulation.ts`)
- `advanceMinutes()` — 训练用快进仿真，无 WebSocket 回调开销
- `collectMetrics()` — 收集平均速度、排队数、等待时间、碳排放估算
- `getIntersectionLaneData()` / `getNeighborIntersections()` / `getSignalPhaseInfo()` — 智能体状态观测接口
- `applyAgentAction()` — MARL 动作映射到信号控制器相位时长修改

#### API 路由 (`backend/src/routes/marl.ts`)
- `POST /api/marl/train/start` — 启动训练（后台异步）
- `POST /api/marl/train/stop` — 停止训练
- `GET  /api/marl/train/status` — 训练进度与指标
- `POST /api/marl/mode` — 切换 fixed/marl 控制模式
- `POST /api/marl/model/save|load` — 模型持久化
- Socket.IO `marl:progress` 事件 — 实时推送训练进度

#### 前端 MARL 面板 (`frontend/src/components/MARLPanel/`)
- 玻璃拟态风格面板，显示训练进度条、回合指标（奖励/等待/排队/速度/碳）、ε 探索率、Loss
- 固定配时 / MARL 智能控制模式切换开关
- 开始/停止训练、保存/加载模型按钮
- 中英文完整翻译（新增 `marl` 翻译分区，22 个键）

#### 新增文件
- `backend/src/services/marl/NeuralNetwork.ts`
- `backend/src/services/marl/ReplayBuffer.ts`
- `backend/src/services/marl/DQNAgent.ts`
- `backend/src/services/marl/MARLManager.ts`
- `backend/src/services/marl/types.ts`
- `backend/src/services/marl/index.ts`
- `backend/src/routes/marl.ts`
- `frontend/src/components/MARLPanel/index.tsx`
- `frontend/src/hooks/useMARL.ts`

#### 修改文件
- `backend/src/index.ts` — MARL 路由注册 + 推理钩子 + 天气转发
- `backend/src/services/trafficSimulation.ts` — 导出 TrafficSimulationEngine + MARL 方法
- `frontend/src/pages/Traffic/index.tsx` — 集成 MARL 面板
- `frontend/src/i18n/types.ts` / `zh.ts` / `en.ts` — 新增 marl 翻译
- `frontend/src/i18n/translations.test.ts` — 新增 marl 键结构测试
- `CHANGELOG.md` — 本条目

#### 设计原则
- **零破坏**: MARL 默认不启用，固定配时模式完全不受影响，所有现有测试通过
- **隔离训练**: 训练使用独立的 TrafficSimulationEngine 实例，不影响实时仿真
- **轻量无依赖**: 神经网络从零实现，无需 TensorFlow.js

---

## [2026-05-23] - 第九次更新

### UI 全面升级 — 液态玻璃 + 环保绿主题
- 高斯模糊深度增强：卡片 backdrop-filter: blur(28px) saturate(140%)，背景光斑 4 个
- 环保绿配色：主色改为 #66bb6a，侧边栏深绿玻璃，全站文字 #1a3c1a
- 液态玻璃效果：悬浮渐变流光边框、角落柔光、入场动画加 blur→0
- 新增 ecoBreath / liquidShimmer 动画，统计图标更大更立体

### 能源模型升级
- 天气-光伏耦合：后端定时拉取 Open-Meteo 云量，线性衰减光伏输出(最高 70%)
- 碳追踪面板：累计碳排放(kg)、电网碳强度(kg/kWh)、太阳能减排量
- 电池健康度：充放电循环次数计算容量衰减(0.02%/cycle)

### 无人机 ⇄ 交通深度融合
- 巡逻路线热力图：节点颜色/大小根据拥堵率实时变化
- 摄像头聚焦最拥堵路口，检测事件与交通模型联动

### 仿真速度滑轨
- Traffic: 0.25× ~ 8×，Energy: 0.1× ~ 4×，前后端 API + 滑块

### Traffic 图表实时化
- 车流量折线图改为仿真滚动窗口，统计卡片来自引擎实时计算

### 文档
- README 精简重写，团队更新 4 人

---

## [2026-05-23] - 第八次更新

### 交通仿真引擎完全重写 — 高保真基于代理的微观仿真

原有简单随机数生成模型替换为基于物理的微观交通仿真引擎：

#### 核心模型
- **智能驾驶员模型 (IDM)**: 每个车辆作为一个独立 agent,加速度由前方车辆间距、速度差、期望速度等参数实时计算
- **四种车型**: 小汽车(82%)/公交车(6%)/卡车(7%)/应急车辆(5%),各有不同的车长、最大速度、加减速、期望时距参数
- **物理时间步长**: 0.25 仿真秒,每 tick 运行 240 个子步,总计算量约 72k 次 IDM/秒

#### 路网
- **连通路网**: 11 个路口通过 30+ 条道路段连接,每个路段有长度(200-900m)、限速、车道数
- **BFS 最短路径路由**: 车辆从网络边界生成,经过多路口到达随机目的地
- **队列溢出检测**: 下游路口拥堵会传播到上游路口

#### 信号控制
- **四相位系统**: N/S 直行+右转(35s) → N/S 左转(18s) → E/W 直行+右转(30s) → E/W 左转(15s)
- **黄灯过渡** (3s) + **全红清空** (1.5s) 保护间隔
- **随机相位偏移**: 各路口初始相位不同,避免所有路口同步

#### 车辆行为
- **红灯/黄灯减速停车**: 根据当前速度和距离计算所需减速度,平滑停车
- **左转让行**: 对向直行车流有优先权,左转车概率让行
- **排队时间追踪**: 每个车辆记录等待时长

#### 需求模型
- **泊松到达**: 基于 24 小时需求模式的时间变化到达率
- **各区域独立需求**: 工业区峰时 800vph,商业区 900vph,科技园 650vph,住宅区 500vph,学校区 400vph

#### 快照生成
- 每个路口 4 个方向,汇总本方向所有来车,计算车辆数/平均速度/拥堵率
- 拥堵率基于车道物理容量(路段长度 ÷ (车长+最小间距))
- 信号状态准确反映当前相位和剩余时间
- **安全加固**: 移除 hardcoded API Key → `.env.example` 模板；`setup.md` 更新指引
- **统一配置**: 前端 15 处 `localhost:3001` 硬编码提取到 `config.ts` 单一入口
- **共享类型**: 创建 `shared/types.ts`，消除 backend/frontend 间 3 份重复的 TrafficData/EnergyData/WeatherData 定义
- **Dashboard Hook 修复**: `useCountUp` 从 `stats.map()` 内部调用改为独立 `StatCard` 子组件，符合 React Hook 规则
- **Traffic 页面**: 4 个统计卡片从硬编码改为实时从交通仿真数据计算
- **Energy 页面**: 新增太阳能/储能/负荷/电网购入 4 个 CountUp 数字滚动指标卡
- **ErrorBoundary**: 新增全局错误边界组件，页面崩溃显示友好提示+重试按钮
- **Charts 空状态**: 数据为空时显示"暂无数据"占位
- **AIAdvice 标签**: 真实 API 调用显示 "AI"，缓存显示 "CACHED+Local"，不再一律标 "Mock"
- **CSS 去重**: 移除 `.ant-layout-content > div` 重复的 `fadeIn` 动画定义
- **串口模拟智能化**: 模拟数据根据深圳实际昼夜加 solarFactor，夜间光照/太阳能归零
- **仿真引擎 reset**: `trafficSimulation.ts` 新增 `reset(startHour)` 方法
- **API 层增强**: 10s 超时、500/网络错误 2 次重试、GET 请求去重
- **TS 配置**: backend `tsconfig.json` rootDir→`..`，frontend `tsconfig.app.json` include→`["src", "../shared"]`
- **团队**: README 更新为 4 人团队；`index.html` title 改为 "Smart City"

### 全栈测试套件搭建

#### 后端测试（73 tests, 8 files）
- 新增 `vitest.config.ts` + supertest 集成测试框架
- **Store 测试** (`store.test.ts`): 默认值、部分更新、历史记录推入、MAX_HISTORY 上限（200）
- **Traffic Service 测试** (`trafficService.test.ts`): 默认值、部分更新、历史上限（100）、信号配时优化算法
- **Energy Service 测试** (`energyService.test.ts`): 默认值、面板角度钳制、储能策略（store/release/idle）
- **Weather Service 测试** (`weatherService.test.ts`): 默认值、太阳能效率预测（晴/多云/雨）
- **AI Service 测试** (`aiService.test.ts`): Mock 建议生成、15s TTL 缓存、无效 Key 降级
- **交通仿真测试** (`trafficSimulation.test.ts`): 快照结构、5 大区域、11 路口、4 方向、高峰检测
- **能源仿真测试** (`energySimulation.test.ts`): 5 园区、电厂模型、李雅普诺夫指标、FSM 状态、TOU 定价
- **路由集成测试** (`routes.test.ts`): 16 个 HTTP 端点（健康检查、数据查询、历史、变更、AI、仿真快照）

#### 前端测试（21 tests, 3 files）
- 新增 vitest + jsdom + @testing-library/react 测试环境
- **翻译键一致性** (`translations.test.ts`): 中英文 11 个分区完整键结构匹配，无空值
- **CountUp 动画 Hook** (`useCountUp.test.ts`): 起点、中点插值、终点、disabled、零值
- **类型定义** (`types/index.test.ts`): TrafficData/EnergyData/WeatherData/HardwareData 结构验证

#### 修复
- 3 个路由文件 `require()` → ESM `import`，修复 vitest 下模块加载失败
- `getPeakType()` 导出为模块公有，支持单测访问
- 移除 flaky 时间戳相等断言

---

## [2026-05-23] - 第六次更新

### 能源板块全面重写 — 李雅普诺夫优化 + FSM 混合架构

#### 后端能源仿真引擎 (`backend/src/services/energySimulation.ts`)
- **5 大园区负荷模拟**：工业区、科技园、商业区、学校区、住宅区，各有独立 24h 负荷曲线
- **深圳真实峰谷电价**：谷电 0.26 元/kWh（23:00-7:00）、平电 0.70 元/kWh、峰电 1.17 元/kWh（9:00-11:30/14:00-16:30/19:00-21:00）
- **李雅普诺夫优化核心**：
  - 虚拟队列 Q(t) = SOC 偏差 × 电池容量
  - 漂移-加-惩罚：min [Δ(t) + V·Cost(t)]
  - 7 级离散动作搜索（满充/半充/轻充/静置/轻放/半放/满放）
  - $O(1)$ 复杂度，每 tick 毫秒级决策
- **确定性 FSM 硬件保护**：
  - 状态 1：物理越限强切（SOC≥95% 停充 / ≤5% 停放）
  - 状态 2：防逆流硬锁（限制放电避免倒灌电网）
  - 状态 3：死区休眠（功率 < 3% 额定值时静置）
- **深圳 5 大电厂模型**：大亚湾核电站（1968MW，全天基载）、妈湾/前湾燃气（调峰）、深圳能源热电、光明光伏

#### 前端能源页面 (`frontend/src/pages/Energy/index.tsx`)
- **建筑群灯光动画**：8×16 网格窗户，夜间自动亮起（暖黄辉光），白天熄灭；星空/月亮/太阳背景切换
- **能量流图**：光伏 → 储能 → 电网 → 负荷，四层实时数据链路
- **各园区负荷柱状图**：5 大园区实时用电对比
- **李雅普诺夫面板**：Q(t)、V、目标 SOC、Δ(t)、Cost(t)、DPP 值实时展示
- **FSM 状态指示器**：正常/越限/防逆流/死区状态实时显示
- **发电厂卡片**：5 大电厂实时出力/离线状态
- **状态栏**：仿真时间、峰平谷电价标签、充放电状态

#### 新增文件
- `backend/src/services/energySimulation.ts`
- `backend/src/routes/energySim.ts`
- `frontend/src/hooks/useEnergySim.ts`

---

## [2026-05-23] - 第五次更新

### 交通仿真时间调整
- 仿真引擎启动时间从深圳实时时间改为固定 6:00 开始，用户希望仿真时间独立于真实时间

### About 页背景图替换
- Hero 区域条状天际线 SVG 替换为用户提供的深圳实景图片（shenzhen-hero.png）
- 右侧四宫格插图保留原样

### 昼夜光照 & 太阳能计算
- `useWeather.ts` 新增 `getSolarFactor()` 函数：基于深圳当前时间（Asia/Shanghai）计算太阳因子（0~1）
  - 6:00~18:00 为正弦曲线，12:00 峰值 1
  - 18:00~6:00 为 0（夜间）
- `lightIntensity` 光照强度改为 `每日总光照 × solarFactor`，夜间归零
- `solarOutput` 太阳能输出 = 天气基础值 × solarFactor，夜间为 0 kW
- `batteryLevel` 电池电量 = 日间充电值 × solarFactor + 夜间放电基数 × (1-solarFactor)
- Weather 页太阳能效率卡片夜间自动切换为 🌙 图标，显示"夜间模式 — 电池放电中"

---

## [2026-05-23] - 第四次更新

### 深圳时间统一
- 后端交通仿真引擎初始时间改为深圳当前时间（Asia/Shanghai），不再硬编码从 6:00 开始
- 页面头部时钟显示深圳时间（24 小时制，Asia/Shanghai 时区）

### 一键启动脚本优化
- `start.bat` 改版：彩色 banner、显示深圳时间、并行启动前后端
- 依赖自动检测安装、后端健康检查、超时容错
- 启动完成后展示服务地址、深圳时间、功能状态信息

## [2026-05-23] - 第三次更新

### 导航调整
- 侧边栏导航顺序调整：**项目介绍** → **总控大屏** → **交通监控** → **能源管理** → **环境监测**
- 项目介绍内容只保留在 About 页面，Dashboard 不再重复展示

### 车流量图表对接交通仿真模型
- Dashboard 车流量折线图数据源改为后端交通仿真引擎的实时数据
- 每 tick 采集全市车辆总数，12 个样本滚动窗口
- 图表标题显示实时仿真时间、高峰/平峰标签、全市车辆数

### 环境监测接入深圳实时天气
- Dashboard 温度/湿度/天气状况从 Open-Meteo API 读取深圳实时数据（22.5431, 114.0579）
- 状态栏显示当前仿真时间 + 深圳实时温湿度

### Dashboard 重构：集成项目介绍 + 实时数据
- 将 About 页的项目介绍（深圳天际线 Hero、使命卡片）移至 Dashboard 顶部，使其成为真正的总控大屏入口
- Dashboard 统计卡片接入 Open-Meteo API 深圳实时天气数据
- Dashboard 温度、天气状况、湿度与 Open-Meteo 保持同步
- 交通流量统计接入后端交通仿真引擎（Socket.IO），显示实时拥堵指数
- 状态栏实时显示深圳温度与湿度
- 底部新增技术栈展示条

### 粒子背景大幅增强
- 粒子系统重构为三种类型：`star`（发光星点）、`orb`（大光晕）、`dust`（微尘）
- 粒子总数从 100 提升至 232（140 星点 + 12 光晕 + 80 微尘）
- 星点：五色渐变（蓝/绿/橙/红/紫），径向辉光，呼吸闪烁
- 光晕：大半径柔光斑，支持轨道运动
- 微尘：极慢漂移，正弦波动
- 连线：基于星点色相混合的渐变色连线
- 鼠标交互：斥力推动粒子，光晕在鼠标附近被推开
- 响应式：支持触摸事件

### 新增 CSS 动画
- 新增 12 个关键帧动画：fadeInRight, floatRotate, scaleInBounce, glowPulse, spinSlow, pageEnter, borderGlow, numberRoll, shimmerText, ripple, slideUpFade, scaleInBounce
- 新增动画工具类：anim-slide-right, anim-scale-bounce, anim-float-rotate, anim-ripple, anim-glow-pulse, anim-spin-slow, anim-number, anim-border-glow
- 扩展 stagger 支持到 10 个子元素
- 新增 hover-lift 卡片悬浮效果类
- 新增 shimmer-text 渐变闪烁文本类
- 页面进入过渡动画增强

### 其他
- `api.docx` 包含明文 API 密钥，需妥善保管
- CHANGELOG 顶部添加更新提醒横幅
- 搭建全栈工程：React 19 + TypeScript + Vite 前端，Node.js + Express + TypeScript 后端
- Ant Design 6 + ECharts 6 组件库集成
- Socket.IO 双向实时通信
- 玻璃拟态（Glassmorphism）UI 主题

### AI 集成
- 接入 DeepSeek API（环境变量 `DEEPSEEK_API_KEY`）
- 本地 mock 降级策略（15s 缓存）
- 交通信号配时 + 能源调度双模式 AI 建议

### 交通仿真系统
- `backend/src/services/trafficSimulation.ts` — 完整仿真引擎（5 大区域、24 小时流量模式、早晚高峰）
- 每方向独立信号灯控制（N/S/E/W 各自 green/remaining/cycleLen）
- `frontend/src/components/TrafficSystem/` — Canvas 动画组件（220×220px）
  - 车道、停车线、信号灯（发光 + 倒计时）
  - 车辆彩色圆点（速度颜色映射：绿/橙/红）
  - 转弯逻辑（25% 左转 / 20% 右转 / 55% 直行）
  - 红灯完全停止、独立方向控制

### Bug 修复
- `start.bat` — 中文编码导致 cmd 乱码 → 改为纯 ASCII；`curl` 不可用 → 改用 PowerShell `Invoke-WebRequest`
- Weather 白屏 — `useCountUp` Hook 顺序违规导致 React 报错 → 移到所有 early return 之前
- 信号灯不同步 — N+S 初始化值不一致 → 强制同步初始值

### 深圳范本切换
- `useWeather.ts` — 坐标从北京 (39.9042, 116.4074) 改为深圳 (22.5431, 114.0579)
- 时区改为 `Asia/Shanghai`

### Dashboard 重写
- 从仪表盘改为项目介绍页：深圳天际线 SVG、使命卡片、深圳范本介绍、软硬件架构展示
- 中英文国际化支持（新增 15 个翻译键）

### 无人机 ⇄ 交通联动
- 交通仿真数据自动转换为无人机检测事件（车辆/行人/拥堵/事故）
- `DroneFeed` 新增 `externalDetections` 注入

### UI 优化
- 增强玻璃拟态效果（更亮边框、更柔阴影）
- 页面过渡动画、卡片弹性入场
- 滚动条美化、文字渲染优化
- 按钮悬浮动画

### 硬件接口预留
- `DroneFeed` — 完整硬件集成文档注释（Arduino / Tello / 传感器）
- `serialManager.ts` — 自动串口检测 + 模拟降级，JSON 数据格式文档
- 顶栏 Arduino / Drone 就绪指示灯
- `.env` — `SERIAL_PORT` 配置

### 项目介绍独立页面
- Dashboard 恢复为总控大屏（状态栏 + 统计卡片 + 图表 + AI 建议）
- 新建 `pages/About/index.tsx` — 项目介绍页（深圳天际线、使命卡片、范本介绍、软硬件架构）
- 新增 `/about` 路由，侧边栏导航添加"项目介绍"入口
- i18n 重构：`dashboard` 恢复原始键，新增独立 `about` 翻译分区
