// ═══════════════════════════════════════════════════════════════
// What-If Sandbox — Causal inference via paired simulation runs
// ═══════════════════════════════════════════════════════════════

// ─── Intervention Definition ─────────────────────────────────

export type InterventionType = 'road_closure' | 'solar_angle' | 'price_ratio' | 'signal_timing';

export interface InterventionSpec {
  id: string;
  type: InterventionType;
  label: string;
  labelZh: string;
  description: string;
  descriptionZh: string;
  params: Record<string, number>;
  /** Which simulation to use */
  target: 'traffic' | 'energy';
  /** Sim-minutes to run after intervention */
  durationMinutes: number;
}

// ─── Predefined Scenarios ────────────────────────────────────

export const PREDEFINED_SCENARIOS: InterventionSpec[] = [
  {
    id: 'nanshan_closure',
    type: 'road_closure',
    label: 'Nanshan Road Closure',
    labelZh: '南山区封路',
    description: 'Close main roads in Nanshan tech district',
    descriptionZh: '关闭南山区科技园周边主要道路，观察对福田区早高峰的影响',
    params: { area: 1 }, // area code: 1 = Nanshan tech area
    target: 'traffic',
    durationMinutes: 120, // 2 hours of morning rush
  },
  {
    id: 'futian_closure',
    type: 'road_closure',
    label: 'Futian CBD Road Closure',
    labelZh: '福田CBD封路',
    description: 'Close roads in Futian commercial district',
    descriptionZh: '关闭福田商业区道路，观察全市拥堵扩散效应',
    params: { area: 2 }, // area code: 2 = Futian commercial
    target: 'traffic',
    durationMinutes: 120,
  },
  {
    id: 'solar_angle',
    type: 'solar_angle',
    label: 'Solar Panel Angle 30°→35°',
    labelZh: '太阳能板倾角 30°→35°',
    description: 'Change panel tilt from 30° to 35°',
    descriptionZh: '将太阳能板倾角从 30° 调整为 35°，计算全年省电量',
    params: { fromAngle: 30, toAngle: 35 },
    target: 'energy',
    durationMinutes: 1440, // full day
  },
  {
    id: 'price_ratio',
    type: 'price_ratio',
    label: 'Peak/Valley Price 3:1→5:1',
    labelZh: '峰谷电价差 3:1→5:1',
    description: 'Widen peak-to-valley price spread',
    descriptionZh: '将峰谷电价差从 3:1 扩大到 5:1，观察储能收益变化',
    params: { fromRatio: 3, toRatio: 5 },
    target: 'energy',
    durationMinutes: 1440,
  },
  {
    id: 'signal_short',
    type: 'signal_timing',
    label: 'Short Signal Cycle (60s→45s)',
    labelZh: '缩短信号灯周期 60s→45s',
    description: 'Reduce all intersection signal cycles',
    descriptionZh: '将所有路口信号灯周期从 60s 缩短为 45s，测量通行效率变化',
    params: { fromCycle: 60, toCycle: 45 },
    target: 'traffic',
    durationMinutes: 120,
  },
  {
    id: 'signal_smart',
    type: 'signal_timing',
    label: 'Smart Priority for Main Roads',
    labelZh: '主干道优先信号',
    description: 'Give main roads 50% more green time',
    descriptionZh: '主干道绿灯时间增加 50%，辅路相应缩短',
    params: { mainBoost: 1.5 },
    target: 'traffic',
    durationMinutes: 120,
  },
];

// ─── Simulation Run Result ──────────────────────────────────

export interface RunMetrics {
  /** Average speed (km/h) — traffic only */
  avgSpeed?: number;
  /** Total vehicles queued — traffic only */
  totalQueue?: number;
  /** Average wait time (seconds) — traffic only */
  avgWaitTime?: number;
  /** Carbon estimate (kg CO2) — traffic only */
  carbonEstimate?: number;
  /** Solar generation (kWh in period) — energy only */
  solarGeneration?: number;
  /** Battery state of charge end (%) — energy only */
  batterySoc?: number;
  /** Grid import cost (元) — energy only */
  gridCost?: number;
  /** Total load served (kWh) — energy only */
  totalLoad?: number;
  /** Storage revenue (元) — energy only */
  storageRevenue?: number;
  /** Throughput (vehicles exited) — traffic only */
  throughput?: number;
}

// ─── Causal Effect per Metric ───────────────────────────────

export interface MetricEffect {
  metric: string;
  label: string;
  labelZh: string;
  unit: string;
  controlMean: number;
  treatmentMean: number;
  ate: number;
  relativeChange: number; // percentage, e.g. +5.2 or -3.1
  standardError: number;
  ci95Lower: number;
  ci95Upper: number;
  pValue: number;
  significant: boolean; // p < 0.05
}

// ─── Full Result ────────────────────────────────────────────

export interface WhatIfResult {
  id: string;
  scenario: InterventionSpec;
  timestamp: string;
  runs: number;
  durationMs: number;
  metrics: MetricEffect[];
  controls: RunMetrics[];
  treatments: RunMetrics[];
}

// ─── Progress ───────────────────────────────────────────────

export type WhatIfStatus = 'idle' | 'running' | 'completed' | 'error';

export interface WhatIfProgress {
  status: WhatIfStatus;
  scenarioId: string;
  completedRuns: number;
  totalRuns: number;
  elapsedMs: number;
  result?: WhatIfResult;
  error?: string;
}

// ─── DAG Node Definition ────────────────────────────────────

export interface DAGNode {
  id: string;
  label: string;
  labelZh: string;
  type: 'intervention' | 'mediator' | 'outcome';
  x: number;
  y: number;
}

export interface DAGEdge {
  from: string;
  to: string;
  effect?: number; // causal effect estimate
}

export interface DAGSpec {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export const SCENARIO_DAGS: Record<string, DAGSpec> = {
  road_closure: {
    nodes: [
      { id: 'closure', label: 'Road Closure', labelZh: '封路', type: 'intervention', x: 200, y: 20 },
      { id: 'local_q', label: 'Local Queue', labelZh: '本地排队', type: 'mediator', x: 100, y: 100 },
      { id: 'reroute', label: 'Rerouting', labelZh: '绕行', type: 'mediator', x: 300, y: 100 },
      { id: 'neighbor_q', label: 'Neighbor Queue', labelZh: '邻路排队', type: 'mediator', x: 200, y: 170 },
      { id: 'avg_speed', label: 'Avg Speed', labelZh: '平均车速', type: 'outcome', x: 100, y: 250 },
      { id: 'carbon', label: 'CO₂ Emission', labelZh: '碳排放', type: 'outcome', x: 300, y: 250 },
    ],
    edges: [
      { from: 'closure', to: 'local_q' },
      { from: 'closure', to: 'reroute' },
      { from: 'local_q', to: 'neighbor_q' },
      { from: 'reroute', to: 'neighbor_q' },
      { from: 'neighbor_q', to: 'avg_speed' },
      { from: 'neighbor_q', to: 'carbon' },
      { from: 'reroute', to: 'carbon' },
    ],
  },
  solar_angle: {
    nodes: [
      { id: 'angle', label: 'Panel Angle', labelZh: '倾角', type: 'intervention', x: 200, y: 20 },
      { id: 'irradiance', label: 'Effective Irradiance', labelZh: '有效辐照', type: 'mediator', x: 200, y: 100 },
      { id: 'solar_out', label: 'Solar Output', labelZh: '光伏出力', type: 'mediator', x: 100, y: 170 },
      { id: 'battery', label: 'Battery SOC', labelZh: '电池充放', type: 'mediator', x: 300, y: 170 },
      { id: 'grid_import', label: 'Grid Import', labelZh: '电网购电', type: 'outcome', x: 100, y: 250 },
      { id: 'cost', label: 'Total Cost', labelZh: '总费用', type: 'outcome', x: 300, y: 250 },
    ],
    edges: [
      { from: 'angle', to: 'irradiance' },
      { from: 'irradiance', to: 'solar_out' },
      { from: 'solar_out', to: 'battery' },
      { from: 'solar_out', to: 'grid_import' },
      { from: 'battery', to: 'grid_import' },
      { from: 'grid_import', to: 'cost' },
      { from: 'battery', to: 'cost' },
    ],
  },
  price_ratio: {
    nodes: [
      { id: 'price', label: 'Price Ratio', labelZh: '峰谷价比', type: 'intervention', x: 200, y: 20 },
      { id: 'charge_behavior', label: 'Charge/Discharge', labelZh: '充放策略', type: 'mediator', x: 200, y: 100 },
      { id: 'battery_cycles', label: 'Battery Cycles', labelZh: '循环次数', type: 'mediator', x: 100, y: 170 },
      { id: 'arbitrage', label: 'Price Arbitrage', labelZh: '价差套利', type: 'mediator', x: 300, y: 170 },
      { id: 'revenue', label: 'Storage Revenue', labelZh: '储能收益', type: 'outcome', x: 200, y: 250 },
    ],
    edges: [
      { from: 'price', to: 'charge_behavior' },
      { from: 'charge_behavior', to: 'battery_cycles' },
      { from: 'charge_behavior', to: 'arbitrage' },
      { from: 'battery_cycles', to: 'revenue' },
      { from: 'arbitrage', to: 'revenue' },
    ],
  },
  signal_timing: {
    nodes: [
      { id: 'signal', label: 'Signal Timing', labelZh: '信号配时', type: 'intervention', x: 200, y: 20 },
      { id: 'green_time', label: 'Green Time', labelZh: '绿灯时长', type: 'mediator', x: 200, y: 100 },
      { id: 'throughput', label: 'Intersection Throughput', labelZh: '路口通行量', type: 'mediator', x: 100, y: 170 },
      { id: 'wait_time', label: 'Wait Time', labelZh: '等待时间', type: 'mediator', x: 300, y: 170 },
      { id: 'avg_speed', label: 'Avg Speed', labelZh: '平均车速', type: 'outcome', x: 200, y: 250 },
    ],
    edges: [
      { from: 'signal', to: 'green_time' },
      { from: 'green_time', to: 'throughput' },
      { from: 'green_time', to: 'wait_time' },
      { from: 'throughput', to: 'avg_speed' },
      { from: 'wait_time', to: 'avg_speed' },
    ],
  },
};
