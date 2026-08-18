// WhatIf 引擎 —— 反事实因果推断
// 跑 N 次对照 vs 干预的配对实验，算 ATE、95% CI、p-value
// 底层复用了 trafficSimulation 和 energySimulation，算是 SCM（结构因果模型）的简化版
//
// 多核：用 ThreadPool 分发，worker 启动有开销，runs < 50 的时候不一定比单线程快
//
// FIXME: t-test 的 CDF 实现是数值近似的，df 很大的时候精度一般，但没发现明显问题

import { TrafficSimulationEngine } from '../trafficSimulation';
import { EnergySimulationEngine } from '../energySimulation';
import { getPool, type ThreadPool } from '../threadPool';
import {
  PREDEFINED_SCENARIOS,
  type InterventionSpec, type RunMetrics, type MetricEffect,
  type WhatIfResult, type WhatIfProgress,
} from './types';

const DEFAULT_RUNS = 100;

interface TrafficTaskArgs {
  scenario: InterventionSpec;
  treatment: boolean;
}

interface EnergyTaskArgs {
  scenario: InterventionSpec;
  treatment: boolean;
}

/** Standalone traffic simulation run — usable from worker threads. */
export function runTrafficSimStatic(args: TrafficTaskArgs): RunMetrics {
  const sim = new TrafficSimulationEngine();
  sim.stop();
  sim.setMaxVehicles(1200);
  sim.reset(7);

  if (args.treatment && args.scenario.type === 'road_closure') {
    const area = args.scenario.params.area;
    const targetIsecs = area === 1
      ? ['tech-1', 'tech-2', 'sch-1', 'sch-2']
      : ['com-1', 'com-2'];
    sim.closeSegmentsAround(targetIsecs);
  }

  if (args.treatment && args.scenario.type === 'signal_timing') {
    const toCycle = args.scenario.params.toCycle;
    const mainBoost = args.scenario.params.mainBoost;
    const ids = sim.getIntersectionIds();
    for (const id of ids) {
      if (mainBoost && mainBoost !== 1) {
        sim.setSignalCycle(id, Math.round(35 * mainBoost), 'N');
        sim.setSignalCycle(id, Math.round(35 * mainBoost), 'S');
      } else if (toCycle) {
        for (const dir of ['N', 'S', 'E', 'W'] as const) {
          sim.setSignalCycle(id, Math.round(toCycle / 4), dir);
        }
      }
    }
  }

  sim.advanceMinutes(10);
  const metrics = sim.advanceMinutes(Math.min(args.scenario.durationMinutes, 60));

  return {
    avgSpeed: metrics.avgSpeed,
    totalQueue: metrics.totalQueue,
    avgWaitTime: metrics.avgWaitTime,
    carbonEstimate: metrics.carbonEstimate,
    throughput: sim.getExitedCount(),
  };
}

/** Standalone energy simulation run — usable from worker threads. */
export function runEnergySimStatic(args: EnergyTaskArgs): RunMetrics {
  const sim = new EnergySimulationEngine();
  sim.stop();

  let totalSolarKwh = 0;
  let totalGridCost = 0;
  let totalLoadKwh = 0;
  let finalSoc = 55;
  let storageRevenue = 0;

  if (args.treatment && args.scenario.type === 'solar_angle') {
    const fromAngle = args.scenario.params.fromAngle || 30;
    const toAngle = args.scenario.params.toAngle || 35;
    const fromEff = Math.sin((fromAngle * Math.PI) / 180) / Math.sin((20 * Math.PI) / 180);
    const toEff = Math.sin((toAngle * Math.PI) / 180) / Math.sin((20 * Math.PI) / 180);
    const factor = toEff / fromEff;
    sim.setSolarMultiplier(factor);
  }

  if (args.treatment && args.scenario.type === 'price_ratio') {
    const fromRatio = args.scenario.params.fromRatio || 3;
    const toRatio = args.scenario.params.toRatio || 5;
    const scale = toRatio / fromRatio;
    sim.setPriceMultiplier(scale);
  }

  for (let i = 0; i < args.scenario.durationMinutes; i++) {
    sim.tickRawWithState();
    const snap = sim.getCurrentSnapshot();
    totalLoadKwh += snap.grid.totalLoad / 60;
    totalGridCost += snap.grid.gridImport * snap.grid.price / 60 / 1000;
    totalSolarKwh += (snap.grid.totalSupply - (snap.battery.chargePower < 0 ? Math.abs(snap.battery.chargePower) : 0)) / 60;
    finalSoc = snap.battery.soc;

    const cp = snap.battery.chargePower;
    if (cp < 0) {
      storageRevenue += Math.abs(cp) * snap.grid.price / 60 / 1000;
    } else if (cp > 0) {
      storageRevenue -= cp * snap.grid.price / 60 / 1000;
    }
  }

  return {
    solarGeneration: Math.round(totalSolarKwh * 100) / 100,
    batterySoc: Math.round(finalSoc * 10) / 10,
    gridCost: Math.round(totalGridCost * 100) / 100,
    totalLoad: Math.round(totalLoadKwh * 100) / 100,
    storageRevenue: Math.round(storageRevenue * 100) / 100,
  };
}

export class WhatIfEngine {
  private status: 'idle' | 'running' = 'idle';
  private abortController: AbortController | null = null;
  private progressCallbacks: ((p: WhatIfProgress) => void)[] = [];
  private results: Map<string, WhatIfResult> = new Map();
  private pool: ThreadPool | null = null;

  onProgress(cb: (p: WhatIfProgress) => void): void { this.progressCallbacks.push(cb); }

  offProgress(cb: (p: WhatIfProgress) => void): void {
    this.progressCallbacks = this.progressCallbacks.filter((c) => c !== cb);
  }

  getStatus(): string { return this.status; }
  getResult(scenarioId: string): WhatIfResult | undefined { return this.results.get(scenarioId); }
  getAllResults(): WhatIfResult[] { return [...this.results.values()]; }
  getScenarios(): InterventionSpec[] { return PREDEFINED_SCENARIOS; }

  stop(): void {
    if (this.abortController) { this.abortController.abort(); }
    this.status = 'idle';
  }

  async run(scenarioId: string, runs = DEFAULT_RUNS): Promise<WhatIfResult> {
    const scenario = PREDEFINED_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    if (this.status === 'running') throw new Error('Another scenario is already running');

    this.status = 'running';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const startMs = Date.now();

    if (!this.pool) this.pool = getPool();
    const workers = this.pool.getWorkerCount();

    // Build all tasks: N controls + N treatments = 2N total
    const isTraffic = scenario.target === 'traffic';
    const modulePath = __filename;
    const exportName = isTraffic ? 'runTrafficSimStatic' : 'runEnergySimStatic';

    interface TaskItem { idx: number; treatment: boolean }
    const taskItems: TaskItem[] = [];
    for (let i = 0; i < runs; i++) {
      taskItems.push({ idx: i, treatment: false });
      taskItems.push({ idx: i, treatment: true });
    }

    const BATCH = Math.max(2, Math.ceil(taskItems.length / (workers * 2)));

    const allResults: (RunMetrics | undefined)[] = new Array(taskItems.length);
    let completed = 0;

    try {
      for (let offset = 0; offset < taskItems.length; offset += BATCH) {
        if (signal.aborted) break;
        const batch = taskItems.slice(offset, offset + BATCH);
        const batchResults = await this.pool.map<TaskItem, RunMetrics>(batch, (item) => ({
          modulePath,
          exportName,
          args: [{ scenario, treatment: item.treatment }],
        }));
        for (let j = 0; j < batch.length; j++) {
          allResults[offset + j] = batchResults[j];
        }
        completed += batch.length;
        this.emit({
          status: 'running', scenarioId,
          completedRuns: Math.floor(completed / 2),
          totalRuns: runs,
          elapsedMs: Date.now() - startMs,
        });
      }

      // Separate controls and treatments — only keep PAIRED runs (both must succeed)
      const controls: RunMetrics[] = [];
      const treatments: RunMetrics[] = [];
      for (let i = 0; i < runs; i++) {
        const c = allResults[i * 2];
        const t = allResults[i * 2 + 1];
        if (c && t) {
          controls.push(c);
          treatments.push(t);
        }
      }

      const metrics = this.computeEffects(scenario, controls, treatments);
      const result: WhatIfResult = {
        id: scenarioId, scenario,
        timestamp: new Date().toISOString(),
        runs: controls.length,
        durationMs: Date.now() - startMs,
        metrics, controls, treatments,
      };

      this.results.set(scenarioId, result);
      this.status = 'idle';
      this.emit({
        status: 'completed', scenarioId,
        completedRuns: controls.length, totalRuns: runs,
        elapsedMs: Date.now() - startMs, result,
      });
      return result;
    } catch (err: any) {
      if (!signal.aborted) {
        this.status = 'idle';
        this.emit({
          status: 'error', scenarioId,
          completedRuns: 0, totalRuns: runs,
          elapsedMs: Date.now() - startMs, error: err.message,
        });
      }
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  private computeEffects(scenario: InterventionSpec, controls: RunMetrics[], treatments: RunMetrics[]): MetricEffect[] {
    const metrics: MetricEffect[] = [];
    const n = controls.length;
    if (scenario.target === 'traffic') {
      metrics.push(this.metricEffect('avgSpeed', 'Avg Speed', '平均车速', 'km/h', controls, treatments, n));
      metrics.push(this.metricEffect('totalQueue', 'Queue Length', '排队长度', 'veh', controls, treatments, n));
      metrics.push(this.metricEffect('avgWaitTime', 'Avg Wait', '平均等待', 's', controls, treatments, n));
      metrics.push(this.metricEffect('carbonEstimate', 'CO₂ Emission', '碳排放', 'kg', controls, treatments, n));
      metrics.push(this.metricEffect('throughput', 'Throughput', '通行量', 'veh', controls, treatments, n));
    } else {
      metrics.push(this.metricEffect('solarGeneration', 'Solar Gen', '光伏发电', 'kWh', controls, treatments, n));
      metrics.push(this.metricEffect('gridCost', 'Grid Cost', '电网费用', '¥', controls, treatments, n));
      metrics.push(this.metricEffect('storageRevenue', 'Storage Revenue', '储能收益', '¥', controls, treatments, n));
      metrics.push(this.metricEffect('batterySoc', 'Battery SOC', '电池余量', '%', controls, treatments, n));
    }
    return metrics;
  }

  private metricEffect(
    metric: string, label: string, labelZh: string, unit: string,
    controls: RunMetrics[], treatments: RunMetrics[], n: number,
  ): MetricEffect {
    const cVals = controls.map((c) => (c as any)[metric] || 0);
    const tVals = treatments.map((t) => (t as any)[metric] || 0);
    const cMean = this.mean(cVals);
    const tMean = this.mean(tVals);
    const ate = tMean - cMean;
    const relChange = cMean !== 0 ? (ate / Math.abs(cMean)) * 100 : 0;

    const diffs = tVals.map((t, i) => t - cVals[i]);
    const diffMean = this.mean(diffs);
    const diffStd = this.std(diffs, diffMean);
    const se = diffStd / Math.sqrt(n);

    let pValue: number;
    let ciHalf: number;
    if (diffStd === 0 && diffMean === 0) {
      pValue = 1; ciHalf = 0;
    } else if (diffStd === 0 && diffMean !== 0) {
      pValue = 0; ciHalf = 0;
    } else {
      const tStat = Math.abs(diffMean / se);
      pValue = this.tTestPValue(tStat, n - 1);
      ciHalf = 1.96 * se;
    }

    return {
      metric, label, labelZh, unit,
      controlMean: this.round(cMean),
      treatmentMean: this.round(tMean),
      ate: this.round(ate),
      relativeChange: this.round(relChange),
      standardError: this.round(se),
      ci95Lower: this.round(ate - ciHalf),
      ci95Upper: this.round(ate + ciHalf),
      pValue: this.round(pValue),
      significant: pValue < 0.05,
    };
  }

  private mean(vals: number[]): number { return vals.reduce((s, v) => s + v, 0) / vals.length; }

  private std(vals: number[], mean: number): number {
    if (vals.length < 2) return 0;
    const ss = vals.reduce((s, v) => s + (v - mean) ** 2, 0);
    return Math.sqrt(ss / (vals.length - 1));
  }

  private round(v: number): number { return Math.round(v * 100) / 100; }

  private tTestPValue(tVal: number, df: number): number {
    if (df <= 0 || isNaN(tVal)) return 1;
    if (tVal > 100) return 0;
    const x = df / (df + tVal * tVal);
    let a: number;
    if (df % 2 === 0) {
      a = this.evenCDF(df, x);
    } else {
      a = this.oddCDF(df, x, tVal);
    }
    a = Math.max(0, Math.min(1, a));
    const p = Math.max(0, Math.min(1, 2 * (1 - a)));
    return p;
  }

  private evenCDF(df: number, x: number): number {
    let prod = 1;
    for (let k = df - 2; k >= 2; k -= 2) { prod = 1 + x * k / (k + 1) * prod; }
    prod = Math.sqrt(x) * prod;
    return 0.5 + 0.5 * prod;
  }

  private oddCDF(df: number, x: number, tVal: number): number {
    if (df === 1) { return 0.5 + Math.atan(tVal) / Math.PI; }
    let prod = 1;
    for (let k = df - 2; k >= 3; k -= 2) { prod = 1 + x * k / (k + 1) * prod; }
    prod = Math.sqrt(x) * prod;
    const theta = Math.atan(tVal / Math.sqrt(df));
    return 0.5 + (theta + prod * Math.sqrt(x * (1 - x))) / Math.PI;
  }

  private emit(p: WhatIfProgress): void {
    for (const cb of this.progressCallbacks) cb(p);
  }
}

export const whatIfEngine = new WhatIfEngine();
