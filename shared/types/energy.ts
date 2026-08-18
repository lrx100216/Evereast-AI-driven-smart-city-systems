// Energy-related type definitions
// L1: simple snapshot; L2: full grid state for Lyapunov optimisation + joint simulation

import type { PeakType, FsmState } from './common';

/** L1: Simple energy snapshot (used by older API surfaces) */
export interface EnergyData {
  solarVoltage: number;
  batteryLevel: number;
  panelAngle: number;
  powerOutput: number;
  consumption: number;
  timestamp: string;
}

/** Full energy grid state — Lyapunov optimiser + joint simulation consumer */
export interface EnergyGridState {
  /** Battery state-of-charge [0, 100] % */
  batterySoc: number;
  /** Battery temperature (°C) */
  batteryTemperature: number;
  /** Battery degradation ratio [0, 1] (0 = brand-new) */
  batteryDegradation: number;
  /** Current charge / discharge power (kW): positive = charging, negative = discharging */
  batteryChargePower: number;
  /** Battery max charge power (kW) */
  batteryMaxCharge: number;
  /** Battery max discharge power (kW) */
  batteryMaxDischarge: number;
  /** Current grid electricity price (¥/kWh) */
  gridPrice: number;
  /** Current peak / valley type */
  peakType: PeakType;
  /** Power imported from grid (kW) */
  gridImport: number;
  /** Power exported to grid (kW) */
  gridExport: number;
  /** Total load (kW) */
  totalLoad: number;
  /** Total supply (kW) */
  totalSupply: number;
  /** Real-time solar PV output (kW) */
  solarOutput: number;
  /** Zone loads (kW), key = zone type */
  zoneLoads: Record<string, number>;
  /** Plant outputs (MW) */
  plantOutputs: Record<string, number>;
  /** Plant online status */
  plantOnline: Record<string, boolean>;
  /** Cumulative carbon emissions (kg CO₂) */
  carbonTotalKg: number;
  /** Current grid carbon intensity (kg CO₂ / kWh) */
  carbonIntensity: number;
  /** Cumulative carbon avoided via solar (kg CO₂) */
  carbonAvoidedKg: number;
  /** Lyapunov virtual queue Q(t) */
  lyapunovQ: number;
  /** Lyapunov drift Δ(t) */
  lyapunovDrift: number;
  /** FSM safety state machine current state */
  fsmState: FsmState;
}
