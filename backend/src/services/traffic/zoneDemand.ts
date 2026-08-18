/**
 * Zone demand model ¡ª per-zone-type traffic generation parameters and hourly patterns
 * Extracted from trafficSimulation.ts
 */
import type { SimZoneType } from './types';

export interface ZoneDemand {
  zoneType: SimZoneType;
  peakFlowRate: number;
  hourlyPattern: number[];
}

export const ZONE_DEMAND: Record<SimZoneType, ZoneDemand> = {
  industrial: {
    zoneType: 'industrial',
    peakFlowRate: 800,
    hourlyPattern: [2,1,1,1,2,5,12,28,32,25,20,16,14,14,16,18,24,28,30,22,14,8,5,3],
  },
  tech_park: {
    zoneType: 'tech_park',
    peakFlowRate: 650,
    hourlyPattern: [1,1,1,1,1,2,8,24,34,30,22,16,14,14,16,20,26,32,32,20,10,5,2,1],
  },
  school: {
    zoneType: 'school',
    peakFlowRate: 400,
    hourlyPattern: [1,1,1,1,1,2,10,32,28,10,7,8,10,8,8,12,28,22,10,5,3,2,1,1],
  },
  commercial: {
    zoneType: 'commercial',
    peakFlowRate: 900,
    hourlyPattern: [3,2,2,2,2,4,10,18,28,36,40,42,40,36,36,38,42,44,40,30,22,14,8,5],
  },
  residential: {
    zoneType: 'residential',
    peakFlowRate: 500,
    hourlyPattern: [6,4,3,3,3,6,20,30,22,14,12,10,10,10,12,16,22,28,32,28,18,12,8,6],
  },
};

export function arrivalRate(zoneType: SimZoneType, hour: number, minute: number): number {
  const demand = ZONE_DEMAND[zoneType];
  const nowPattern = demand.hourlyPattern[hour] / 10;
  const nextPattern = demand.hourlyPattern[(hour + 1) % 24] / 10;
  const smooth = nowPattern + (nextPattern - nowPattern) * (minute / 60);
  return demand.peakFlowRate * smooth / 3600;
}
