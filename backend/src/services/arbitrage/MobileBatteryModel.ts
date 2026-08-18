// EV Fleet as Distributed Battery (V2G) Model
//
// Treats EV fleet as a virtual battery for grid regulation:
//   - Tracks aggregate SOC per sector
//   - Computes V2G discharge potential during grid stress
//   - Feeds capacity data into GridStressModel + EnergySimulation

import type { MobileBatteryState } from '../../../../shared/types/arbitrage'
import type { GridStressSnapshot } from './types'
import { SECTOR_ASSIGNMENTS, EV_RATIO, AVG_EV_BATTERY_KWH, V2G_MAX_PER_EV_KW } from './types'

export class MobileBatteryModel {
  private sectorState: Map<string, { evCount: number; avgSoc: number }> = new Map()
  private isInjecting = false
  private injectionRateKw = 0
  private readonly V2G_EFFICIENCY = 0.9

  constructor() {
    for (const sa of SECTOR_ASSIGNMENTS) {
      this.sectorState.set(sa.zoneType, { evCount: 0, avgSoc: 0.5 })
    }
  }

  /**
   * Update EV counts from traffic state
   */
  updateEvCounts(activeVehicles: number, perZoneRatios: Record<string, number>): void {
    const totalEvs = Math.round(activeVehicles * EV_RATIO)
    for (const sa of SECTOR_ASSIGNMENTS) {
      const ratio = perZoneRatios[sa.zoneType] ?? (1 / SECTOR_ASSIGNMENTS.length)
      const evCount = Math.round(totalEvs * ratio)
      const current = this.sectorState.get(sa.zoneType)
      if (current) {
        current.evCount = evCount
        // SOC drifts slowly
        current.avgSoc = Math.max(0.1, Math.min(1, current.avgSoc + (Math.random() - 0.5) * 0.05))
      }
    }
  }

  /**
   * Compute V2G discharge potential from grid stress
   */
  computeV2GPotential(gridStress: GridStressSnapshot): MobileBatteryState {
    let totalEvs = 0
    let totalCapacity = 0
    let socWeightedSum = 0
    const bySector: MobileBatteryState['bySector'] = []

    for (const sa of SECTOR_ASSIGNMENTS) {
      const state = this.sectorState.get(sa.zoneType)
      if (!state) continue
      const capacity = state.evCount * AVG_EV_BATTERY_KWH
      const dischargeKw = state.evCount * V2G_MAX_PER_EV_KW * state.avgSoc * this.V2G_EFFICIENCY

      totalEvs += state.evCount
      totalCapacity += capacity
      socWeightedSum += capacity * state.avgSoc

      const zoneStress = gridStress.zones.find(z => z.zoneType === sa.zoneType)
      const shouldInject = (zoneStress?.stressProbability ?? 0) > 0.5 && state.avgSoc > 0.3

      bySector.push({
        sector: sa.sector,
        evCount: state.evCount,
        capacityKwh: parseFloat(capacity.toFixed(2)),
        avgSoc: parseFloat(state.avgSoc.toFixed(4)),
        dischargeKw: parseFloat((shouldInject ? dischargeKw : 0).toFixed(2)),
      })
    }

    const sectorAStress = gridStress.sectorA.avgStress
    this.isInjecting = sectorAStress > 0.5

    if (this.isInjecting) {
      const sectorADischarge = bySector
        .filter(s => s.sector === 'A_stressed')
        .reduce((sum, s) => sum + s.dischargeKw, 0)
      this.injectionRateKw = Math.min(sectorADischarge, totalCapacity * 0.1)
    } else {
      this.injectionRateKw = 0
    }

    return {
      totalEvCount: totalEvs,
      totalCapacityKwh: parseFloat(totalCapacity.toFixed(2)),
      aggregateSoc: parseFloat((totalCapacity > 0 ? socWeightedSum / totalCapacity : 0.5).toFixed(4)),
      v2gDischargeKw: parseFloat(this.injectionRateKw.toFixed(2)),
      bySector,
      isInjecting: this.isInjecting,
      injectionRateKw: parseFloat(this.injectionRateKw.toFixed(2)),
    }
  }

  /** Current V2G injection for energy simulation */
  getV2GInjectionKw(): number {
    return this.isInjecting ? this.injectionRateKw : 0
  }

  reset(): void {
    this.isInjecting = false
    this.injectionRateKw = 0
    for (const sa of SECTOR_ASSIGNMENTS) {
      this.sectorState.set(sa.zoneType, { evCount: 0, avgSoc: 0.5 })
    }
  }
}
