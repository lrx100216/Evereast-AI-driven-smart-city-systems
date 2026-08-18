// Traffic-related type definitions
// L1: simple data snapshots; L2: detailed junction state for IDM / MARL

import type { Direction } from './common';

/** L1: Simple traffic snapshot (used by older API surfaces) */
export interface TrafficData {
  carCount: number;
  pedestrianCount: number;
  congestionLevel: number;
  averageSpeed: number;
  timestamp: string;
}

/** Single-intersection full micro-state — IDM simulation + MARL observations */
export interface TrafficJunctionState {
  /** Unique junction id, e.g. 'tech-1' */
  id: string;
  /** Queue length per direction [0, +∞) */
  queueByDir: Record<Direction, number>;
  /** Arrival rate per direction (veh/h) */
  arrivalRateByDir: Record<Direction, number>;
  /** Average speed per direction (km/h) */
  speedByDir: Record<Direction, number>;
  /** Congestion level per direction [0, 100] */
  congestionByDir: Record<Direction, number>;
  /** Accumulated wait time per direction (s) */
  waitTimeByDir: Record<Direction, number>;
  /** Current signal phase 0-3 (NS-thru / NS-left / EW-thru / EW-left) */
  currentPhase: number;
  /** Remaining seconds in the current phase */
  phaseRemaining: number;
  /** Current light colour per direction */
  signalColorByDir: Record<Direction, 'green' | 'yellow' | 'red'>;
  /** Spillover index [0, 1]: whether the downstream queue is backing up into this junction */
  spilloverIndex: number;
  /** Pedestrian count */
  pedestrianCount: number;
  /** Zone type this junction belongs to */
  zoneType: string;
  /** MARL agent exploration rate ε (MARL mode only) */
  marlEpsilon?: number;
}

/** Per-junction signal control command (CFM / MARL output) */
export interface TrafficSignalAction {
  /** Junction id */
  junctionId: string;
  /** Target signal phase (0-3): NS-thru / NS-left / EW-thru / EW-left */
  targetPhase: number;
  /** Target green duration (s), [5, 90] */
  greenDuration: number;
}
