// 联邦学习引擎 —— FedAvg + 差分隐私
// 每个园区本地训一个小网络，传梯度前做裁剪+加噪
// 隐私预算 epsilon 用的是 moments accountant 的近似公式，不是严格上界
//
// 多核：每轮5个园区并行训练，但网络很小（4->16->8->1），通信开销比计算开销还大
// 实际性能提升有限，主要是为了 demo 效果
//
// TODO: 严格来说应该实现 Rényi DP 的 composition，现在的 epsilon 估计偏乐观

import { NeuralNetwork } from '../marl/NeuralNetwork';
import { getPool, type ThreadPool } from '../threadPool';
import {
  DEFAULT_FL_CONFIG, type FLConfig, type FLProgress,
  type FLRoundMetrics, type ZoneModel,
} from './types';

interface ZoneInfo {
  id: string; name: string; nameZh: string;
  hours: number[];
}

const ZONES: ZoneInfo[] = [
  { id: 'industrial', name: 'Industrial', nameZh: '工业区',
    hours: [25,22,20,18,18,20,35,60,95,100,98,95,90,85,88,92,95,90,80,65,50,40,35,30] },
  { id: 'tech_park', name: 'Tech Park', nameZh: '科技园',
    hours: [10,8,8,8,8,10,15,40,90,100,85,75,70,70,75,80,85,75,60,45,30,20,15,12] },
  { id: 'commercial', name: 'Commercial', nameZh: '商业区',
    hours: [15,12,10,10,10,15,20,30,55,75,85,90,95,90,85,88,92,95,100,90,75,55,35,25] },
  { id: 'school', name: 'School', nameZh: '学校区',
    hours: [5,5,5,5,5,5,10,35,75,80,60,55,50,50,55,60,70,40,25,15,10,8,6,5] },
  { id: 'residential', name: 'Residential', nameZh: '住宅区',
    hours: [40,35,30,28,28,30,55,70,55,35,30,28,28,28,30,35,45,55,70,85,90,80,65,55] },
];

const INPUT_SIZE = 4;
const HIDDEN_SIZES = [16, 8];
const OUTPUT_SIZE = 1;

interface TrainZoneArgs {
  zoneId: string;
  zoneHours: number[];
  globalWeights: number[][][];
  globalBiases: number[][];
  config: FLConfig;
}

interface TrainZoneResult {
  zoneId: string;
  grads: { weights: number[][][]; biases: number[][] };
  loss: number;
}

/** Standalone zone training — usable from worker threads. */
export function trainZoneStatic(args: TrainZoneArgs): TrainZoneResult {
  const model = new NeuralNetwork([INPUT_SIZE, ...HIDDEN_SIZES, OUTPUT_SIZE]);
  model.deserialize({ weights: args.globalWeights, biases: args.globalBiases });

  const before = model.serialize();
  let totalLoss = 0;
  let count = 0;

  for (let ep = 0; ep < args.config.localEpochs; ep++) {
    for (let h = 0; h < 24; h++) {
      const input = [
        Math.sin(2 * Math.PI * h / 24),
        Math.cos(2 * Math.PI * h / 24),
        25 / 50,
        0.3,
      ];
      const target = args.zoneHours[h] / 100;
      const { output } = model.forward(input);
      const error = output[0] - target;
      model.train(input, 0, target, args.config.learningRate);
      totalLoss += error * error;
      count++;
    }
  }

  const after = model.serialize();

  // Compute gradients = before - after
  const grads = { weights: [] as number[][][], biases: [] as number[][] };
  for (let l = 0; l < before.weights.length; l++) {
    const wl: number[][] = [];
    const bl: number[] = [];
    for (let o = 0; o < before.weights[l].length; o++) {
      const row: number[] = [];
      for (let i = 0; i < before.weights[l][o].length; i++) {
        row.push(before.weights[l][o][i] - after.weights[l][o][i]);
      }
      wl.push(row);
      bl.push(before.biases[l][o] - after.biases[l][o]);
    }
    grads.weights.push(wl);
    grads.biases.push(bl);
  }

  return {
    zoneId: args.zoneId,
    grads,
    loss: totalLoss / Math.max(1, count),
  };
}

export class FederatedEngine {
  private config: FLConfig;
  private localModels: Map<string, NeuralNetwork> = new Map();
  private globalModel: NeuralNetwork;
  private status: 'idle' | 'training' | 'completed' | 'error' = 'idle';
  private abortController: AbortController | null = null;
  private callbacks: ((p: FLProgress) => void)[] = [];
  private metrics: FLRoundMetrics[] = [];
  private totalEpsilon = 0;
  private totalElapsedMs = 0;
  private pool: ThreadPool | null = null;

  constructor(config: Partial<FLConfig> = {}) {
    this.config = { ...DEFAULT_FL_CONFIG, ...config };
    this.globalModel = new NeuralNetwork([INPUT_SIZE, ...HIDDEN_SIZES, OUTPUT_SIZE]);
    this.initLocalModels();
  }

  private initLocalModels(): void {
    for (const z of ZONES) {
      this.localModels.set(z.id, new NeuralNetwork([INPUT_SIZE, ...HIDDEN_SIZES, OUTPUT_SIZE]));
    }
  }

  onProgress(cb: (p: FLProgress) => void): void { this.callbacks.push(cb); }

  offProgress(cb: (p: FLProgress) => void): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  getStatus(): string { return this.status; }
  getConfig(): FLConfig { return { ...this.config }; }

  setNoiseMultiplier(nm: number): void {
    this.config.noiseMultiplier = Math.max(0.1, Math.min(10, nm));
  }

  getPrivacyBudget() {
    return { epsilon: this.totalEpsilon, delta: this.config.delta, noiseMultiplier: this.config.noiseMultiplier, rounds: this.metrics.length };
  }

  getGlobalWeights(): ZoneModel {
    const s = this.globalModel.serialize();
    return { zoneId: 'global', weights: s.weights, biases: s.biases };
  }

  getZoneModels(): ZoneModel[] {
    const models: ZoneModel[] = [];
    for (const [id, model] of this.localModels) {
      const s = model.serialize();
      models.push({ zoneId: id, weights: s.weights, biases: s.biases });
    }
    return models;
  }

  stop(): void {
    if (this.abortController) { this.abortController.abort(); }
    this.status = 'idle';
  }

  async train(rounds?: number): Promise<void> {
    if (this.status === 'training') return;
    this.status = 'training';
    this.totalEpsilon = 0;
    this.metrics = [];
    this.totalElapsedMs = 0;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const totalRounds = rounds || this.config.rounds;
    const startMs = Date.now();

    if (!this.pool) this.pool = getPool();

    this.emit({
      status: 'training', currentRound: 0, totalRounds,
      epsilon: 0, noiseMultiplier: this.config.noiseMultiplier,
      metrics: [], zoneCount: ZONES.length, elapsedMs: 0,
    });

    try {
      for (let r = 0; r < totalRounds; r++) {
        if (signal.aborted) break;
        if (r % 3 === 0) await new Promise<void>((res) => setImmediate(res));

        // Serialize global model weights for workers
        const globalSerialized = this.globalModel.serialize();

        // 1. Each zone trains locally IN PARALLEL via thread pool
        const zoneResults = await this.pool.map<ZoneInfo, TrainZoneResult>(
          ZONES,
          (zone) => ({
            modulePath: __filename,
            exportName: 'trainZoneStatic',
            args: [{
              zoneId: zone.id,
              zoneHours: zone.hours,
              globalWeights: globalSerialized.weights,
              globalBiases: globalSerialized.biases,
              config: this.config,
            }],
          }),
        );

        // 2. Clip + add noise to each zone's gradients (DP)
        const zoneGradients: { zoneId: string; grads: { weights: number[][][]; biases: number[][] } }[] = [];
        let totalLoss = 0;

        for (const zr of zoneResults) {
          if (!zr) continue;
          totalLoss += zr.loss;
          const clipped = this.clipGradients(zr.grads, this.config.clipNorm);
          const noised = this.addNoise(clipped, this.config.noiseMultiplier * this.config.clipNorm);
          zoneGradients.push({ zoneId: zr.zoneId, grads: noised });
        }

        const avgLoss = totalLoss / Math.max(1, zoneResults.filter(Boolean).length);

        // 3. FedAvg
        const avgGrads = this.fedAvg(zoneGradients.map((zg) => zg.grads));

        // 4. Apply gradients to global model
        this.applyGradients(avgGrads, this.config.learningRate);

        // 5. Privacy budget
        const q = this.config.sampleRate;
        const sigma = this.config.noiseMultiplier;
        this.totalEpsilon = this.computeEpsilon(totalRounds, q, sigma, this.config.delta);

        const roundMetric: FLRoundMetrics = {
          round: r + 1,
          avgLoss: Math.round(avgLoss * 10000) / 10000,
          epsilon: Math.round(this.totalEpsilon * 100) / 100,
          participatedZones: ZONES.length,
        };
        this.metrics.push(roundMetric);
        this.totalElapsedMs = Date.now() - startMs;

        this.emit({
          status: 'training', currentRound: r + 1, totalRounds,
          epsilon: this.totalEpsilon, noiseMultiplier: this.config.noiseMultiplier,
          metrics: [...this.metrics], zoneCount: ZONES.length,
          elapsedMs: this.totalElapsedMs,
        });
      }

      this.status = signal.aborted ? 'idle' : 'completed';
      this.emit({
        status: this.status, currentRound: this.metrics.length, totalRounds,
        epsilon: this.totalEpsilon, noiseMultiplier: this.config.noiseMultiplier,
        metrics: [...this.metrics], zoneCount: ZONES.length,
        elapsedMs: this.totalElapsedMs,
      });
    } catch (err: any) {
      this.status = 'error';
      this.emit({
        status: 'error', currentRound: this.metrics.length, totalRounds,
        epsilon: this.totalEpsilon, noiseMultiplier: this.config.noiseMultiplier,
        metrics: [...this.metrics], zoneCount: ZONES.length,
        elapsedMs: this.totalElapsedMs, error: err.message,
      });
    } finally {
      this.abortController = null;
    }
  }

  private clipGradients(grads: { weights: number[][][]; biases: number[][] }, clipNorm: number): { weights: number[][][]; biases: number[][] } {
    let totalNorm = 0;
    for (const wl of grads.weights) for (const row of wl) for (const v of row) totalNorm += v * v;
    for (const bl of grads.biases) for (const v of bl) totalNorm += v * v;
    const norm = Math.sqrt(totalNorm);
    if (norm <= clipNorm || norm === 0) return grads;
    const scale = clipNorm / norm;
    return {
      weights: grads.weights.map((wl) => wl.map((row) => row.map((v) => v * scale))),
      biases: grads.biases.map((bl) => bl.map((v) => v * scale)),
    };
  }

  private addNoise(grads: { weights: number[][][]; biases: number[][] }, noiseStd: number): { weights: number[][][]; biases: number[][] } {
    return {
      weights: grads.weights.map((wl) => wl.map((row) => row.map((v) => {
        const u1 = Math.max(1e-10, Math.random());
        const u2 = Math.random();
        return v + noiseStd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }))),
      biases: grads.biases.map((bl) => bl.map((v) => {
        const u1 = Math.max(1e-10, Math.random());
        const u2 = Math.random();
        return v + noiseStd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      })),
    };
  }

  private fedAvg(gradsList: { weights: number[][][]; biases: number[][] }[]): { weights: number[][][]; biases: number[][] } {
    const n = gradsList.length;
    if (n === 0) return { weights: [], biases: [] };
    const avgWeights: number[][][] = [];
    const avgBiases: number[][] = [];
    for (let l = 0; l < gradsList[0].weights.length; l++) {
      const wl: number[][] = [];
      const bl: number[] = [];
      for (let o = 0; o < gradsList[0].weights[l].length; o++) {
        wl.push(new Array(gradsList[0].weights[l][o].length).fill(0));
        bl.push(0);
      }
      avgWeights.push(wl);
      avgBiases.push(bl);
    }
    for (const grads of gradsList) {
      for (let l = 0; l < grads.weights.length; l++) {
        for (let o = 0; o < grads.weights[l].length; o++) {
          for (let i = 0; i < grads.weights[l][o].length; i++) {
            avgWeights[l][o][i] += grads.weights[l][o][i] / n;
          }
          avgBiases[l][o] += grads.biases[l][o] / n;
        }
      }
    }
    return { weights: avgWeights, biases: avgBiases };
  }

  private applyGradients(grads: { weights: number[][][]; biases: number[][] }, lr: number): void {
    // grads = before - after = weight decrease during client training = lr * raw_gradient.
    // In FedAvg, server aggregates client weight changes: w_new = w_global + avg(w_client - w_global).
    // w_client - w_global = -lr * raw_grad = -(before - after) = -grads.
    // So w_new = w_global + avg(-grads) = w_global - avg(grads).
    // The lr parameter is unused here because grads already incorporate client-side lr scaling.
    const current = this.globalModel.serialize();
    for (let l = 0; l < current.weights.length; l++) {
      for (let o = 0; o < current.weights[l].length; o++) {
        for (let i = 0; i < current.weights[l][o].length; i++) {
          current.weights[l][o][i] -= (grads.weights[l]?.[o]?.[i] ?? 0);
        }
        current.biases[l][o] -= (grads.biases[l]?.[o] ?? 0);
      }
    }
    this.globalModel.deserialize(current);
  }

  private computeEpsilon(rounds: number, q: number, sigma: number, delta: number): number {
    if (sigma < 0.01) return 999;
    const logDelta = Math.log(1 / Math.max(delta, 1e-12));
    return Math.min(100, Math.sqrt(2 * q * rounds * logDelta) / sigma);
  }

  private emit(p: FLProgress): void {
    for (const cb of this.callbacks) cb(p);
  }
}

export const federatedEngine = new FederatedEngine();
