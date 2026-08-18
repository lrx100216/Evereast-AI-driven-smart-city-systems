// Smart City type definitions — barrel file
// Domain types have been split into shared/types/*.ts
// This file re-exports everything for backward compatibility.
//
// New code should import directly from:
//   shared/types/traffic   shared/types/energy   shared/types/weather
//   shared/types/city-state   shared/types/cfm   shared/types/common

export type { Direction, PeakType, FsmState } from './types/common';
export type {
  SectorType, SectorAssignment,
  GridStressInput, ZoneStressForecast, GridStressSnapshot,
  PricingSignal, LyapunovPricingSnapshot,
  DiversionMetrics, MobileBatteryState,
  ArbitrageSnapshot,
  DroneCommand, DroneTelemetry, DetectionEvent, DroneFrameResult,
} from './types/arbitrage';
export type { HardwareData } from './types/hardware-data';

export type { TrafficData, TrafficJunctionState, TrafficSignalAction } from './types/traffic';

export type { EnergyData, EnergyGridState } from './types/energy';

export type { WeatherData, EnvironmentState } from './types/weather';

export type { TimeContext, CityGlobalState, CityGlobalActions } from './types/city-state';

export {
  CFM_INPUT_DIM,
  CFM_TRAFFIC_DIM,
  CFM_ENERGY_DIM,
  CFM_OUTPUT_DIM,
  flattenCityState,
  parseModelOutput,
} from './types/cfm';
