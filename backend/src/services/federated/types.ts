// ═══════════════════════════════════════════════════════════════
// Federated Learning + Differential Privacy — Types
// ═══════════════════════════════════════════════════════════════

export interface ZoneData {
  zoneId: string;
  name: string;
  nameZh: string;
  samples: number;       // number of training samples contributed
}

export interface FLConfig {
  rounds: number;         // federation rounds
  localEpochs: number;    // local training epochs per round
  learningRate: number;
  noiseMultiplier: number; // DP: Gaussian noise σ = multiplier * clipNorm
  clipNorm: number;        // DP: max gradient L2 norm
  delta: number;           // DP: δ parameter (typically 1e-5)
  sampleRate: number;      // fraction of zones participating per round
}

export const DEFAULT_FL_CONFIG: FLConfig = {
  rounds: 50,
  localEpochs: 5,
  learningRate: 0.01,
  noiseMultiplier: 1.0,
  clipNorm: 1.0,
  delta: 1e-5,
  sampleRate: 1.0,
};

export interface ZoneModel {
  zoneId: string;
  weights: number[][][];
  biases: number[][];
}

export interface PrivacyBudget {
  epsilon: number;       // current ε (lower = more privacy)
  delta: number;         // δ parameter
  noiseMultiplier: number;
  rounds: number;
}

export interface FLRoundMetrics {
  round: number;
  avgLoss: number;
  epsilon: number;
  participatedZones: number;
}

export type FLStatus = 'idle' | 'training' | 'completed' | 'error';

export interface FLProgress {
  status: FLStatus;
  currentRound: number;
  totalRounds: number;
  epsilon: number;
  noiseMultiplier: number;
  metrics: FLRoundMetrics[];
  zoneCount: number;
  elapsedMs: number;
  error?: string;
}
