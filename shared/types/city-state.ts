// City-wide global state & actions
// Pulls together traffic, energy, environment, and time context into a single snapshot
// for CFM inference (384-dim input → 13-dim output)

import type { TrafficJunctionState, TrafficSignalAction } from './traffic';
import type { EnergyGridState } from './energy';
import type { EnvironmentState } from './weather';

/** Time & calendar metadata */
export interface TimeContext {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Simulation time "HH:MM:SS" */
  simTime: string;
  /** Simulation hour [0, 23] */
  simHour: number;
  /** Simulation minute [0, 59] */
  simMinute: number;
  /** Day of week [0, 6], 0 = Sunday */
  dayOfWeek: number;
  /** Month [1, 12] */
  month: number;
  /** Day of month [1, 31] */
  dayOfMonth: number;
  /** Whether it's morning or evening rush hour */
  isRushHour: boolean;
  /** Time-of-day description */
  timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
}

/**
 * City-wide global state — the unified snapshot consumed by the CFM.
 *
 * NOTE: Deep-copying this struct is slow due to its size;
 *       currently adequate but may need optimisation for high-frequency use.
 */
export interface CityGlobalState {
  /** Time & calendar metadata */
  time: TimeContext;
  /** 11 junction full traffic micro-states */
  traffic: TrafficJunctionState[];
  /** Energy grid full state */
  energy: EnergyGridState;
  /** Environment & weather full state */
  environment: EnvironmentState;
}

/** City-wide control actions — 13-dim CFM output, consumed by each subsystem */
export interface CityGlobalActions {
  /** Timestamp matching the input snapshot */
  timestamp: string;
  /** Signal control commands for 11 junctions */
  trafficSignals: TrafficSignalAction[];
  /** Battery charge / discharge rate [-1, +1]: negative = discharge, positive = charge, 0 = idle */
  batteryChargeRate: number;
  /** Solar panel servo target angle [0, 180] degrees */
  solarPanelAngle: number;
}
