// HardwareData: discriminated union of sensor data types
// Kept separate from common.ts to avoid circular imports

import type { TrafficData } from './traffic';
import type { EnergyData } from './energy';
import type { WeatherData } from './weather';

export type HardwareData =
  | ({ type: 'traffic' } & TrafficData)
  | ({ type: 'energy' } & EnergyData)
  | ({ type: 'weather' } & WeatherData);
