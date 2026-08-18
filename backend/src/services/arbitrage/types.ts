// Arbitrage engine internal types
// Re-exports shared types and defines static config

export type {
  SectorType, SectorAssignment,
  GridStressInput, ZoneStressForecast, GridStressSnapshot,
  PricingSignal, LyapunovPricingSnapshot,
  DiversionMetrics, ArbitrageSnapshot,
  MobileBatteryState,
} from '../../../../shared/types/arbitrage'

// Zone-to-sector static config
// Sector A (stressed): industrial + tech_park — high EV density, high load
// Sector B (safe): school + residential — low EV density
// Buffer: commercial — moderate zone
export const SECTOR_ASSIGNMENTS: {
  zoneType: string
  sector: import('../../../../shared/types/arbitrage').SectorType
  stationIds: number[]
  intersectionIndices: number[]
}[] = [
  { zoneType: 'industrial',  sector: 'A_stressed', stationIds: [6],             intersectionIndices: [0, 1] },
  { zoneType: 'tech_park',   sector: 'A_stressed', stationIds: [0, 1],          intersectionIndices: [2, 3, 4] },
  { zoneType: 'commercial',  sector: 'buffer',      stationIds: [2, 3],          intersectionIndices: [5, 6] },
  { zoneType: 'school',      sector: 'B_safe',      stationIds: [7],             intersectionIndices: [7, 8] },
  { zoneType: 'residential', sector: 'B_safe',      stationIds: [4, 5],          intersectionIndices: [9, 10] },
]

export const EV_RATIO = 0.15            // 15% of vehicles are EV
export const AVG_EV_BATTERY_KWH = 60    // Avg EV battery capacity (kWh)
export const V2G_MAX_PER_EV_KW = 7      // Max V2G discharge rate per EV (kW)
