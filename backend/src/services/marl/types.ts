// ═══════════════════════════════════════════════════════════════
// MARL Type Definitions — Multi-Agent DQN Traffic Signal Control
// ═══════════════════════════════════════════════════════════════

import type { Direction, SimZoneType } from '../trafficSimulation';

// ─── Action Space ───────────────────────────────────────────

export type MARLAction = 'extend_green' | 'shorten_red' | 'maintain';
export const MARL_ACTIONS: MARLAction[] = ['extend_green', 'shorten_red', 'maintain'];
export const ACTION_INDEX: Record<MARLAction, number> = { extend_green: 0, shorten_red: 1, maintain: 2 };

/** Seconds to add/subtract from phase green time per action */
export const ACTION_GREEN_DELTA = 5;
export const MIN_GREEN_TIME = 5;
export const MAX_GREEN_TIME = 90;

// ─── State Space ─────────────────────────────────────────────

export interface AgentState {
  /** Queue length per direction [N, S, E, W] normalized to [0,1] */
  queueByDir: number[];
  /** Current signal phase one-hot [NS-thru, NS-left, EW-thru, EW-left] */
  signalPhase: number[];
  /** Average queue of connected neighbor intersections, normalized */
  neighborQueues: number[];
  /** Time features: [sin(2π·h/24), cos(2π·h/24), minute/60] */
  timeFeatures: number[];
  /** Weather factors: [cloudCover(0-1), temperature(°C)/50] */
  weatherFeatures: number[];
}

/** Total state vector size */
export const STATE_SIZE = 4 + 4 + 4 + 3 + 2; // = 17

export function flattenState(s: AgentState): number[] {
  return [...s.queueByDir, ...s.signalPhase, ...s.neighborQueues, ...s.timeFeatures, ...s.weatherFeatures];
}

// ─── Experience Replay ──────────────────────────────────────

export interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

// ─── Training Config ────────────────────────────────────────

export interface MARLConfig {
  episodes: number;
  stepsPerEpisode: number;       // sim-minutes per episode (default 1440 = 24h)
  agentStepInterval: number;     // how often agents decide (sim-minutes, default 5)
  gamma: number;                 // discount factor
  epsilonStart: number;
  epsilonEnd: number;
  epsilonDecay: number;
  learningRate: number;
  batchSize: number;
  replayCapacity: number;
  targetUpdateFreq: number;      // steps between target network updates
  trainStartSize: number;        // min replay size before training starts
  hiddenLayers: number[];        // e.g. [64, 64]
  rewardTravelWeight: number;    // weight for travel time reduction
  rewardQueueWeight: number;     // weight for queue reduction
  parallelMode: boolean;         // use Worker Threads for agent train() calls
}

export const DEFAULT_MARL_CONFIG: MARLConfig = {
  episodes: 500,              // 500 episodes, 3h rush per episode → ~28 min total
  stepsPerEpisode: 180,       // 3 sim-hours (morning rush 6:00-9:00, peak traffic patterns)
  agentStepInterval: 5,       // agents decide every 5 sim-minutes = 36 decisions per episode
  gamma: 0.95,                // discount factor — unchanged
  epsilonStart: 1.0,          // full exploration at start
  epsilonEnd: 0.05,           // minimum exploration rate
  epsilonDecay: 0.993,        // faster decay (0.997→0.993), reaches min in ~430 episodes
  learningRate: 0.002,        // doubled from 0.001 for faster convergence
  batchSize: 64,              // unchanged — good gradient estimates without memory bloat
  replayCapacity: 10000,      // unchanged — ample for 18,000 total experiences
  targetUpdateFreq: 120,      // more frequent sync (200→120) stabilizes faster learning
  trainStartSize: 350,        // start training sooner (500→350) to use early experiences
  hiddenLayers: [48, 32],     // slimmer network (was [64,64]): 2.2× fewer weights, ~2× faster
  rewardTravelWeight: 0.5,    // balanced reward: queue + wait time equally weighted
  rewardQueueWeight: 0.5,     // carbon weight = 0 (less informative early in training)
  parallelMode: false,        // off by default; enable on multi-core machines for ~30-40% speedup
};

// ─── Episode Metrics ────────────────────────────────────────

export interface EpisodeMetrics {
  episode: number;
  totalReward: number;
  avgTravelTime: number;         // seconds
  avgQueueLength: number;        // vehicles
  avgSpeed: number;              // km/h
  carbonEstimate: number;        // kg CO2
  epsilon: number;
  loss?: number;
  durationMs: number;
}

// ─── Training Status ────────────────────────────────────────

export type TrainingStatus = 'idle' | 'training' | 'paused' | 'completed' | 'error';
export type SignalMode = 'fixed' | 'marl';

export interface TrainingState {
  status: TrainingStatus;
  mode: SignalMode;
  currentEpisode: number;
  totalEpisodes: number;
  metrics: EpisodeMetrics[];
  agentCount: number;
  elapsedMs: number;
  error?: string;
}

// ─── Agent Model Persistence ────────────────────────────────

export interface AgentModelData {
  intersectionId: string;
  weights: number[][][];
  biases: number[][];
  epsilon: number;
  episode: number;
}

export interface MARLModelData {
  version: 1;
  timestamp: string;
  agents: AgentModelData[];
  config: MARLConfig;
  currentEpisode: number;
}
