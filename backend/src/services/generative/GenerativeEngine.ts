// 生成式模拟 —— 名字起得有点唬人，其实就是 Monte Carlo 集成预测
// 跑 100 次带随机种子的仿真，然后算 P5/P50/P95 包络线
// 和真正的"扩散模型"没啥关系，就是借用了一下概念
//
// 多核：ThreadPool 分发，100个场景在小核电脑上可能内存吃紧
// 实际跑下来最耗时的是 trafficSimulation 的 advanceMinutes，不是并行开销

import { TrafficSimulationEngine } from '../trafficSimulation';
import { getPool, type ThreadPool } from '../threadPool';

const DEFAULT_SCENARIOS = 100;
const SAMPLE_INTERVAL = 5;
const TOTAL_MINUTES = 120;
const SNAPSHOTS = 24;

interface TimePoint {
  minute: number;
  avgSpeed: number;
  queueLength: number;
  congestion: number;
  solarOutput: number;
  batterySoc: number;
  gridPrice: number;
}

interface Scenario {
  id: number;
  seed: number;
  timeline: TimePoint[];
  finalAvgSpeed: number;
  finalQueue: number;
  finalSolar: number;
  finalSoc: number;
}

/** Lightweight scenario summary (no timeline) — sent over Socket.IO for frontend display. */
export interface ScenarioSummary {
  id: number;
  seed: number;
  finalAvgSpeed: number;
  finalQueue: number;
  finalSolar: number;
  finalSoc: number;
}

export interface GenerativeResult {
  timestamp: string;
  totalScenarios: number;
  durationMs: number;
  /** Full scenarios with timelines (heavy — API only) */
  scenarios: Scenario[];
  /** Top 5 scenario summaries (lightweight — Socket.IO display) */
  top5: ScenarioSummary[];
  envelope: {
    minute: number;
    p5_speed: number;  p50_speed: number;  p95_speed: number;
    p5_queue: number;  p50_queue: number;  p95_queue: number;
    p5_solar: number;  p50_solar: number;  p95_solar: number;
  }[];
}

interface ScenarioTaskArgs {
  seed: number;
  totalMin: number;
  interval: number;
  snapshots: number;
}

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Standalone function — usable from worker threads. Creates its own sim instance. */
export function runOneScenarioStatic(args: ScenarioTaskArgs): Scenario {
  const { seed, totalMin, interval, snapshots } = args;
  const rng = mulberry32(seed);

  const sim = new TrafficSimulationEngine();
  sim.stop();
  sim.setMaxVehicles(1200);

  const startHour = 7 + (rng() * 2 - 1);
  sim.reset(Math.round(startHour));
  sim.setSpeed(1.0 + (rng() - 0.5) * 0.4);

  const timeline: TimePoint[] = [];

  for (let m = 0; m < totalMin; m++) {
    sim.advanceMinutes(1);

    if ((m + 1) % interval === 0) {
      const metrics = sim.getGlobalMetrics();
      const simHour = (startHour + m / 60) % 24;
      const solar = simHour >= 6 && simHour < 18
        ? 380 * Math.sin(Math.PI * (simHour - 6) / 12) * (0.8 + rng() * 0.4)
        : 0;

      timeline.push({
        minute: m + 1,
        avgSpeed: metrics.avgSpeed,
        queueLength: metrics.totalQueue,
        congestion: metrics.totalQueue / Math.max(1, metrics.totalVehicles) * 100,
        solarOutput: Math.round(solar),
        batterySoc: 55 + (solar > 200 ? 20 : 0) * rng(),
        gridPrice: 0.7 + (simHour >= 9 && simHour < 11.5 ? 0.47 : 0),
      });
    }
  }

  return {
    id: seed,
    seed,
    timeline,
    finalAvgSpeed: timeline[timeline.length - 1]?.avgSpeed || 0,
    finalQueue: timeline[timeline.length - 1]?.queueLength || 0,
    finalSolar: timeline[timeline.length - 1]?.solarOutput || 0,
    finalSoc: timeline[timeline.length - 1]?.batterySoc || 55,
  };
}

export class GenerativeEngine {
  private status: 'idle' | 'running' = 'idle';
  private abortController: AbortController | null = null;
  private callbacks: ((p: any) => void)[] = [];
  private lastResult: GenerativeResult | null = null;
  private pool: ThreadPool | null = null;

  onProgress(cb: (p: any) => void): void { this.callbacks.push(cb); }

  offProgress(cb: (p: any) => void): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  getStatus(): string { return this.status; }
  getLastResult(): GenerativeResult | null { return this.lastResult; }

  stop(): void {
    if (this.abortController) { this.abortController.abort(); }
    this.status = 'idle';
  }

  async generate(nScenarios = DEFAULT_SCENARIOS): Promise<GenerativeResult> {
    if (this.status === 'running') throw new Error('Already running');
    this.status = 'running';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const startMs = Date.now();

    // Lazy-init pool (first call or after terminate)
    if (!this.pool) this.pool = getPool();
    const workers = this.pool.getWorkerCount();

    try {
      // Build all scenario task args
      const tasks: ScenarioTaskArgs[] = [];
      for (let i = 0; i < nScenarios; i++) {
        tasks.push({
          seed: i * 137 + 42,
          totalMin: TOTAL_MINUTES,
          interval: SAMPLE_INTERVAL,
          snapshots: SNAPSHOTS,
        });
      }

      // Batch size: distribute evenly, process in chunks for progress
      const BATCH = Math.max(1, Math.ceil(nScenarios / (workers * 2)));

      const allScenarios: Scenario[] = [];
      for (let offset = 0; offset < nScenarios; offset += BATCH) {
        if (signal.aborted) break;
        const batch = tasks.slice(offset, offset + BATCH);
        const batchResults = await this.pool.map<ScenarioTaskArgs, Scenario>(batch, (t) => ({
          modulePath: __filename,
          exportName: 'runOneScenarioStatic',
          args: [t],
        }));
        allScenarios.push(...batchResults.filter((s): s is Scenario => s != null));
        this.emit({
          status: 'running',
          completed: allScenarios.length,
          total: nScenarios,
          elapsedMs: Date.now() - startMs,
        });
      }

      // Sort by final avg speed (best scenarios first)
      allScenarios.sort((a, b) => b.finalAvgSpeed - a.finalAvgSpeed);

      // Compute percentile envelope
      const envelope: GenerativeResult['envelope'] = [];
      for (let t = 0; t < SNAPSHOTS; t++) {
        const speeds = allScenarios.map((s) => s.timeline[t]?.avgSpeed ?? 0).sort((a, b) => a - b);
        const queues = allScenarios.map((s) => s.timeline[t]?.queueLength ?? 0).sort((a, b) => a - b);
        const solars = allScenarios.map((s) => s.timeline[t]?.solarOutput ?? 0).sort((a, b) => a - b);
        const p5  = Math.floor(allScenarios.length * 0.05);
        const p50 = Math.floor(allScenarios.length * 0.50);
        const p95 = Math.floor(allScenarios.length * 0.95);
        envelope.push({
          minute: t * SAMPLE_INTERVAL,
          p5_speed: speeds[p5] ?? 0, p50_speed: speeds[p50] ?? 0, p95_speed: speeds[p95] ?? 0,
          p5_queue: queues[p5] ?? 0, p50_queue: queues[p50] ?? 0, p95_queue: queues[p95] ?? 0,
          p5_solar: solars[p5] ?? 0, p50_solar: solars[p50] ?? 0, p95_solar: solars[p95] ?? 0,
        });
      }

      // Build top 5 summaries (lightweight — no timeline)
      const top5 = allScenarios.slice(0, 5).map((s) => ({
        id: s.id,
        seed: s.seed,
        finalAvgSpeed: s.finalAvgSpeed,
        finalQueue: s.finalQueue,
        finalSolar: s.finalSolar,
        finalSoc: s.finalSoc,
      }));

      this.lastResult = {
        timestamp: new Date().toISOString(),
        totalScenarios: allScenarios.length,
        durationMs: Date.now() - startMs,
        scenarios: allScenarios.slice(0, 20),
        top5,
        envelope,
      };

      this.status = 'idle';
      // Emit lightweight result — top5 + envelope only (no heavy timeline data)
      this.emit({
        status: 'completed',
        completed: allScenarios.length,
        total: nScenarios,
        elapsedMs: Date.now() - startMs,
        result: {
          timestamp: this.lastResult.timestamp,
          totalScenarios: this.lastResult.totalScenarios,
          durationMs: this.lastResult.durationMs,
          envelope: this.lastResult.envelope,
          top5: this.lastResult.top5,
        },
      });
      return this.lastResult;
    } catch (err: any) {
      if (!signal.aborted) {
        this.status = 'idle';
        this.emit({ status: 'error', error: err.message });
      }
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  private emit(p: any): void {
    for (const cb of this.callbacks) cb(p);
  }
}

export const generativeEngine = new GenerativeEngine();
