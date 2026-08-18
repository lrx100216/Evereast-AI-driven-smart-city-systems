// MARL 训练管理器 —— 11个路口，每个一个DQN agent，CTDE架构
//
// 这个实现非常基础：
//   - 全局reward共享（所有agent收到同一个reward）
//   - 没有参数共享（每个agent独立网络）
//   - 没有通信机制（agent之间不交换信息，除了通过simulation state）
//
// 训练的时候开一个新的 simulation 实例，不和主仿真抢资源
// 但 CPU 占用还是很高，建议训练的时候别同时跑 Generative / WhatIf
//
// Parallel mode (config.parallelMode): uses ThreadPool worker threads for
// agent inference & training. Weights are serialised per-step, which adds
// overhead but enables true multi-core parallelisation for 11 agents.
// Enable when training on multi-core machines (>4 cores).

import fs from 'fs';
import path from 'path';
import { DQNAgent } from './DQNAgent';
import { TrafficSimulationEngine, type TrafficMetrics } from '../trafficSimulation';
import type { Direction } from '../trafficSimulation';
import { getPool, type TaskSpec } from '../threadPool';
import {
  MARL_ACTIONS,
  DEFAULT_MARL_CONFIG,
  type MARLConfig, type AgentState, type EpisodeMetrics,
  type TrainingState, type TrainingStatus, type SignalMode,
  type MARLModelData, type AgentModelData,
} from './types';
import type { SelectActionInput, TrainInput } from './agentWorkerFns';

export class MARLManager {
  private agents: Map<string, DQNAgent>;
  private trainingSim: TrafficSimulationEngine | null = null;
  private config: MARLConfig;
  private status: TrainingStatus = 'idle';
  private mode: SignalMode = 'fixed';
  private currentEpisode = 0;
  private metrics: EpisodeMetrics[] = [];
  private episodeStartMs = 0;
  private totalElapsedMs = 0;
  private abortController: AbortController | null = null;
  private progressCallbacks: ((state: TrainingState) => void)[] = [];

  // For inference mode: track last action time per intersection
  private lastInferenceStep = new Map<string, number>();
  private inferenceStepInterval = 5; // sim-minutes between agent decisions

  // Weather state (updated externally)
  private cloudFactor = 0;
  private temperature = 25;

  // Grid stress factor for arbitrage reward shaping (0-1)
  private gridStressFactor = 0;
  private stressReliefWeight = 0.3;

  constructor(config: Partial<MARLConfig> = {}) {
    this.config = { ...DEFAULT_MARL_CONFIG, ...config };
    this.agents = new Map();
  }

  // ─── Initialization ───────────────────────────────────────

  /** Initialize agents for all intersections in the training simulation. */
  initialize(intersectionIds: string[]): void {
    this.agents.clear();
    for (const id of intersectionIds) {
      this.agents.set(id, new DQNAgent(id, this.config));
    }
  }

  // ─── Weather Input ────────────────────────────────────────

  setWeather(cloudFactor: number, temperature: number): void {
    this.cloudFactor = Math.max(0, Math.min(1, cloudFactor));
    this.temperature = temperature;
  }

  // ─── State Observation ────────────────────────────────────

  private buildAgentState(
    sim: TrafficSimulationEngine,
    intersectionId: string,
  ): AgentState {
    // Queue length per direction [N, S, E, W], normalized by typical lane capacity
    const laneData = sim.getIntersectionLaneData(intersectionId);
    const maxCars = 30; // typical lane capacity for normalization
    const queueByDir = laneData.map(d => Math.min(1, d.queueCount / maxCars));

    // Signal phase one-hot
    const phaseInfo = sim.getSignalPhaseInfo(intersectionId);
    const phaseNames = ['NS-through', 'NS-left', 'EW-through', 'EW-left'];
    const signalPhase = phaseNames.map((_, i) => i === phaseInfo.currentPhaseIdx ? 1 : 0);

    // Neighbor queues: average normalized queue of connected intersections
    const neighbors = sim.getNeighborIntersections(intersectionId);
    const neighborQueues = [0, 0, 0, 0]; // 4 values for consistency
    if (neighbors.length > 0) {
      let totalQ = 0;
      let count = 0;
      for (const nid of neighbors) {
        const nLanes = sim.getIntersectionLaneData(nid);
        for (const ld of nLanes) {
          totalQ += Math.min(1, ld.queueCount / maxCars);
          count++;
        }
      }
      const avgQ = count > 0 ? totalQ / count : 0;
      for (let i = 0; i < 4; i++) neighborQueues[i] = avgQ;
    }

    // Time features
    const { hour, minute } = sim.getSimTime();
    const timeFeatures = [
      Math.sin(2 * Math.PI * hour / 24),
      Math.cos(2 * Math.PI * hour / 24),
      minute / 60,
    ];

    // Weather
    const weatherFeatures = [this.cloudFactor, this.temperature / 50];

    return { queueByDir, signalPhase, neighborQueues, timeFeatures, weatherFeatures };
  }

  // ─── Training ─────────────────────────────────────────────

  async train(
    intersectionIds: string[],
    episodes?: number,
  ): Promise<void> {
    if (this.status === 'training') return;

    if (this.agents.size === 0) this.initialize(intersectionIds);
    const totalEpisodes = episodes || this.config.episodes;

    this.status = 'training';
    this.currentEpisode = 0;
    this.totalElapsedMs = 0;
    this.metrics = [];
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Create isolated simulation for training
    this.trainingSim = new TrafficSimulationEngine();
    this.trainingSim.stop();
    // Cap vehicles at 2000 — keeps simulation fast while providing sufficient traffic density
    // for agents to learn meaningful signal control policies
    this.trainingSim.setMaxVehicles(2000);

    this.emitProgress();

    try {
      for (let ep = 0; ep < totalEpisodes; ep++) {
        if (signal.aborted) break;

        this.currentEpisode = ep + 1;
        const epStartMs = Date.now();
        this.episodeStartMs = epStartMs;

        // Random start hour between 5-8 AM for varied initial conditions
        const startHour = 5 + Math.floor(Math.random() * 4);
        this.trainingSim.reset(startHour);

        let episodeReward = 0;
        let totalAvgSpeed = 0;
        let totalQueue = 0;
        let totalWait = 0;
        let totalCarbon = 0;
        let metricSamples = 0;
        let totalLoss = 0;
        let trainSteps = 0;

        const stepsPerEpisode = Math.floor(this.config.stepsPerEpisode / this.config.agentStepInterval);
        let prevMetrics: TrafficMetrics | null = null;

        for (let step = 0; step < stepsPerEpisode; step++) {
          if (signal.aborted) break;

          // Yield to event loop every 3 steps and emit mid-episode progress
          if (step % 3 === 0) {
            const now = Date.now();
            this.totalElapsedMs += now - this.episodeStartMs;
            this.episodeStartMs = now;
            this.emitProgress();
            await new Promise<void>(resolve => setImmediate(resolve));
          }

          // 1. Each agent observes state and selects action (batched for efficiency)
          const actions = new Map<string, number>();
          const prevStates = new Map<string, AgentState>();

          const agentIds = [...this.agents.entries()];
          const actionResults = await Promise.all(
            agentIds.map(async ([id, agent]) => {
              const state = this.buildAgentState(this.trainingSim!, id);
              const { actionIdx } = agent.selectAction(state);
              return { id, state, actionIdx };
            }),
          );

          for (const { id, state, actionIdx } of actionResults) {
            prevStates.set(id, state);
            actions.set(id, actionIdx);
          }

          // 2. Apply actions to simulation
          for (const [id, actionIdx] of actions) {
            this.trainingSim!.applyAgentAction(id, actionIdx);
          }

          // 3. Advance simulation
          const currMetrics = this.trainingSim!.advanceMinutes(this.config.agentStepInterval);

          // 4. Compute global reward
          const reward = this.computeReward(prevMetrics, currMetrics);
          prevMetrics = currMetrics;
          episodeReward += reward;

          totalAvgSpeed += currMetrics.avgSpeed;
          totalQueue += currMetrics.totalQueue;
          totalWait += currMetrics.avgWaitTime;
          totalCarbon += currMetrics.carbonEstimate;
          metricSamples++;

          // 5. Build next states, store experiences, and train agents
          let trainResults: (number | null)[];

          if (this.config.parallelMode && this.agents.size >= 2) {
            // ── Parallel: train agents in Worker Threads ─────
            // Store experiences on main thread first, then dispatch training
            const trainInputs: Array<{
              id: string;
              serializedWeights: { weights: number[][][]; biases: number[][] };
              layerSizes: number[];
              epsilon: number;
            }> = [];

            for (const [id, agent] of this.agents) {
              const prevState = prevStates.get(id)!;
              const actionIdx = actions.get(id)!;
              const nextState = this.buildAgentState(this.trainingSim!, id);
              const done = step === stepsPerEpisode - 1;
              agent.store(prevState, actionIdx, reward, nextState, done);
              // Collect agent data for worker dispatch
              trainInputs.push({
                id,
                serializedWeights: agent.getOnlineWeights(),
                layerSizes: agent.getLayerSizes(),
                epsilon: agent.getEpsilon(),
              });
            }

            // Dispatch training to worker threads
            const pool = getPool();
            const workerModule = path.resolve(__dirname, 'agentWorkerFns.js');

            const batchPerAgent = this.config.batchSize;
            const trainInputsForWorkers: TrainInput[] = trainInputs.map(ti => {
              const agent = this.agents.get(ti.id)!;
              const batchRaw = agent.isReadyToTrain()
                ? agent.sampleBatch(batchPerAgent)
                : [];
              return {
                agent: {
                  layerSizes: ti.layerSizes,
                  weights: ti.serializedWeights.weights,
                  biases: ti.serializedWeights.biases,
                  epsilon: ti.epsilon,
                  config: this.config,
                },
                batch: batchRaw,
                stepCount: agent.getStepCount(),
              };
            });

            // Run training in parallel workers
            const workerResults = await pool.map<TrainInput, any>(
              trainInputsForWorkers,
              (input) => ({
                modulePath: workerModule,
                exportName: 'agentTrain',
                args: [input],
              }),
            );

            // Apply worker results back to agents
            trainResults = [];
            let idx = 0;
            for (const [, agent] of this.agents) {
              const result = workerResults[idx];
              if (result && result.weights) {
                agent.updateOnlineWeights({ weights: result.weights, biases: result.biases });
                agent.setEpsilon(result.epsilon);
                if (result.shouldSyncTarget) agent.syncTarget();
                trainResults.push(result.loss);
              } else {
                // Fallback: train in-process
                trainResults.push(agent.train());
              }
              idx++;
            }
          } else {
            // ── Sequential: Promise.all in-process ──────────
            trainResults = await Promise.all(
              [...this.agents.entries()].map(async ([id, agent]) => {
                const prevState = prevStates.get(id)!;
                const actionIdx = actions.get(id)!;
                const nextState = this.buildAgentState(this.trainingSim!, id);
                const done = step === stepsPerEpisode - 1;
                agent.store(prevState, actionIdx, reward, nextState, done);
                return agent.train();
              }),
            );
          }

          for (const loss of trainResults) {
            if (loss !== null) {
              totalLoss += loss;
              trainSteps++;
            }
          }
        }

        // End of episode: sync target networks
        for (const [, agent] of this.agents) {
          agent.syncTarget();
        }

        // Add remaining time since last mid-yield, then snapshot episode total
        this.totalElapsedMs += Date.now() - this.episodeStartMs;
        const durationMs = Date.now() - epStartMs;

        const epMetrics: EpisodeMetrics = {
          episode: this.currentEpisode,
          totalReward: Math.round(episodeReward * 100) / 100,
          avgTravelTime: metricSamples > 0 ? Math.round(totalWait / metricSamples * 10) / 10 : 0,
          avgQueueLength: metricSamples > 0 ? Math.round(totalQueue / metricSamples * 10) / 10 : 0,
          avgSpeed: metricSamples > 0 ? Math.round(totalAvgSpeed / metricSamples * 10) / 10 : 0,
          carbonEstimate: Math.round(totalCarbon * 100) / 100,
          epsilon: this.getAverageEpsilon(),
          loss: trainSteps > 0 ? Math.round(totalLoss / trainSteps * 10000) / 10000 : undefined,
          durationMs,
        };

        this.metrics.push(epMetrics);
        this.emitProgress();
      }

      this.status = signal.aborted ? 'idle' : 'completed';

      // Auto-save model on completion
      if (this.status === 'completed') {
        try {
          const dir = path.resolve(process.cwd(), 'data', 'marl');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const filename = `marl-model-${Date.now()}.json`;
          const filepath = path.join(dir, filename);
          const model = this.saveModel();
          fs.writeFileSync(filepath, JSON.stringify(model, null, 2), 'utf-8');
          console.log(`[MARL] Training completed. Model auto-saved to: ${filepath}`);
        } catch (e) {
          console.warn('[MARL] Auto-save failed:', e instanceof Error ? e.message : String(e));
        }
      }
    } catch (err: any) {
      this.status = 'error';
      this.emitProgress();
      throw err;
    } finally {
      this.abortController = null;
      this.emitProgress();
    }
  }

  /** Stop training gracefully. */
  stopTraining(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.status = 'idle';
    this.emitProgress();
  }

  // ─── Reward Computation ───────────────────────────────────

  private computeReward(prev: TrafficMetrics | null, curr: TrafficMetrics): number {
    if (!prev || prev.totalVehicles === 0) return 0;

    const queueImprovement = prev.totalQueue > 0
      ? (prev.totalQueue - curr.totalQueue) / Math.max(1, prev.totalQueue)
      : 0;

    const waitImprovement = prev.avgWaitTime > 0
      ? (prev.avgWaitTime - curr.avgWaitTime) / Math.max(1, prev.avgWaitTime)
      : 0;

    const carbonImprovement = prev.carbonEstimate > 0
      ? (prev.carbonEstimate - curr.carbonEstimate) / Math.max(0.01, prev.carbonEstimate)
      : 0;

    // Cross-domain arbitrage: penalize actions that increase grid stress
    const stressPenalty = -this.stressReliefWeight * this.gridStressFactor;

    return (
      this.config.rewardQueueWeight * queueImprovement +
      this.config.rewardTravelWeight * waitImprovement +
      (1 - this.config.rewardTravelWeight - this.config.rewardQueueWeight) * carbonImprovement
      + stressPenalty
    );
  }

  /** Set grid stress factor for arbitrage reward shaping (0-1) */
  setGridStressFactor(factor: number): void {
    this.gridStressFactor = Math.max(0, Math.min(1, factor));
  }

  /** Get current grid stress factor */
  getGridStressFactor(): number { return this.gridStressFactor; }

  // ─── Inference Mode ───────────────────────────────────────

  /** Set the operating mode. In MARL mode, agents override signal timings. */
  setMode(mode: SignalMode): void {
    this.mode = mode;
    if (mode === 'fixed') {
      this.lastInferenceStep.clear();
    }
    this.emitProgress();
  }

  getMode(): SignalMode { return this.mode; }

  /**
   * Called each simulation tick during inference mode.
   * Agents evaluate state and apply actions every inferenceStepInterval sim-minutes.
   */
  onSimulationTick(sim: TrafficSimulationEngine): void {
    if (this.mode !== 'marl') return;

    const { hour, minute } = sim.getSimTime();
    const simMinuteOfDay = hour * 60 + minute;

    for (const [id, agent] of this.agents) {
      const lastStep = this.lastInferenceStep.get(id) || -Infinity;
      if (simMinuteOfDay - lastStep < this.inferenceStepInterval) continue;

      const state = this.buildAgentState(sim, id);
      const { actionIdx } = agent.selectGreedy(state);
      sim.applyAgentAction(id, actionIdx);
      this.lastInferenceStep.set(id, simMinuteOfDay);
    }
  }

  // ─── Progress Callbacks ───────────────────────────────────

  onProgress(cb: (state: TrainingState) => void): void {
    this.progressCallbacks.push(cb);
  }

  offProgress(cb: (state: TrainingState) => void): void {
    this.progressCallbacks = this.progressCallbacks.filter((c) => c !== cb);
  }

  private emitProgress(): void {
    const state = this.getTrainingState();
    for (const cb of this.progressCallbacks) cb(state);
  }

  getTrainingState(): TrainingState {
    return {
      status: this.status,
      mode: this.mode,
      currentEpisode: this.currentEpisode,
      totalEpisodes: this.config.episodes,
      metrics: [...this.metrics],
      agentCount: this.agents.size,
      elapsedMs: this.totalElapsedMs,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────

  private getAverageEpsilon(): number {
    let sum = 0;
    for (const [, agent] of this.agents) sum += agent.getEpsilon();
    return this.agents.size > 0 ? Math.round(sum / this.agents.size * 1000) / 1000 : 0;
  }

  getAgentEpsilons(): Record<string, number> {
    const eps: Record<string, number> = {};
    for (const [id, agent] of this.agents) eps[id] = agent.getEpsilon();
    return eps;
  }

  // ─── Persistence ──────────────────────────────────────────

  saveModel(): MARLModelData {
    const agentData: AgentModelData[] = [];
    for (const [id, agent] of this.agents) {
      const serialized = agent.serialize();
      agentData.push({
        intersectionId: id,
        weights: serialized.weights,
        biases: serialized.biases,
        epsilon: agent.getEpsilon(),
        episode: this.currentEpisode,
      });
    }

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      agents: agentData,
      config: this.config,
      currentEpisode: this.currentEpisode,
    };
  }

  loadModel(data: MARLModelData): void {
    this.config = { ...DEFAULT_MARL_CONFIG, ...data.config };
    this.currentEpisode = data.currentEpisode;

    for (const ad of data.agents) {
      let agent = this.agents.get(ad.intersectionId);
      if (!agent) {
        agent = new DQNAgent(ad.intersectionId, this.config);
        this.agents.set(ad.intersectionId, agent);
      }
      agent.deserialize({ weights: ad.weights, biases: ad.biases });
      agent.setEpsilon(ad.epsilon);
    }
  }

  /** Get intersection IDs that have trained agents. */
  getAgentIds(): string[] {
    return [...this.agents.keys()];
  }

  /** Get the Q-values for an agent's current state (for visualization). */
  getAgentQValues(sim: TrafficSimulationEngine, intersectionId: string): number[] | null {
    const agent = this.agents.get(intersectionId);
    if (!agent) return null;
    const state = this.buildAgentState(sim, intersectionId);
    const { qValues } = agent.selectGreedy(state);
    return qValues;
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const marlManager = new MARLManager();
