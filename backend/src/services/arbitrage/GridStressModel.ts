// Grid Stress Probability Model
// Weather + energy state → per-zone grid collapse probability
//
// Uses lightweight multi-factor logistic model:
// P(stress) = sigmoid(β₀ + β₁·cloud + β₂·solarDrop + β₃·loadRatio + β₄·peak + β₅·lowBat)
// Sector A zones have higher base vulnerability (high EV density + industrial load)

import type { GridStressInput, ZoneStressForecast, GridStressSnapshot } from './types'
import { SECTOR_ASSIGNMENTS } from './types'

export class GridStressModel {
  private readonly historicalStress: number[] = []
  private readonly MAX_HISTORY = 60
  private lastSnapshot: GridStressSnapshot | null = null

  /**
   * Compute per-zone grid stress probability from weather + energy state
   */
  computeStress(input: GridStressInput): GridStressSnapshot {
    const cloudPenalty = input.cloudCover           // 0-1
    const solarDrop = 1 - input.solarEfficiency     // 0-1, higher = worse
    const loadRatio = input.totalLoad / 10000        // normalize to ~0-2
    const peakPenalty = input.peakType === 'peak'
      ? 0.3 : input.peakType === 'shoulder' ? 0.1 : 0
    const lowBatteryPenalty = input.batterySoc < 30
      ? 0.2 : input.batterySoc < 50 ? 0.1 : 0

    const zones: ZoneStressForecast[] = SECTOR_ASSIGNMENTS.map(sa => {
      const baseVuln = sa.sector === 'A_stressed' ? 0.3
        : sa.sector === 'B_safe' ? 0.1 : 0.2

      // Logistic regression
      const logit = -2.5
        + 2.0 * cloudPenalty
        + 3.0 * solarDrop
        + 1.5 * loadRatio
        + peakPenalty
        + lowBatteryPenalty
        + baseVuln

      const prob = Math.max(0, Math.min(1, 1 / (1 + Math.exp(-logit))))

      let riskLevel: 'low' | 'moderate' | 'high' | 'critical'
      if (prob < 0.3) riskLevel = 'low'
      else if (prob < 0.5) riskLevel = 'moderate'
      else if (prob < 0.75) riskLevel = 'high'
      else riskLevel = 'critical'

      return {
        zoneType: sa.zoneType,
        sector: sa.sector,
        stressProbability: parseFloat(prob.toFixed(4)),
        solarDrop: parseFloat(solarDrop.toFixed(4)),
        loadSurgeRatio: parseFloat((1 + loadRatio * 0.2 + peakPenalty).toFixed(4)),
        riskLevel,
      }
    })

    const sectorAZones = zones.filter(z => z.sector === 'A_stressed')
    const sectorBZones = zones.filter(z => z.sector === 'B_safe')

    const avgA = sectorAZones.length
      ? sectorAZones.reduce((s, z) => s + z.stressProbability, 0) / sectorAZones.length : 0
    const maxA = sectorAZones.length
      ? Math.max(...sectorAZones.map(z => z.stressProbability)) : 0
    const avgB = sectorBZones.length
      ? sectorBZones.reduce((s, z) => s + z.stressProbability, 0) / sectorBZones.length : 0
    const maxB = sectorBZones.length
      ? Math.max(...sectorBZones.map(z => z.stressProbability)) : 0

    const snapshot: GridStressSnapshot = {
      timestamp: new Date().toISOString(),
      zones,
      sectorA: {
        avgStress: parseFloat(avgA.toFixed(4)),
        maxStress: parseFloat(maxA.toFixed(4)),
        riskLevel: maxA > 0.7 ? 'high' : maxA > 0.4 ? 'moderate' : 'low',
      },
      sectorB: {
        avgStress: parseFloat(avgB.toFixed(4)),
        maxStress: parseFloat(maxB.toFixed(4)),
        riskLevel: maxB > 0.7 ? 'high' : maxB > 0.4 ? 'moderate' : 'low',
      },
      weatherContext: {
        cloudCover: input.cloudCover,
        solarEfficiency: input.solarEfficiency,
        isRaining: input.cloudCover > 0.7,
      },
    }

    this.historicalStress.push(avgA)
    if (this.historicalStress.length > this.MAX_HISTORY) this.historicalStress.shift()
    this.lastSnapshot = snapshot

    return snapshot
  }

  /** Trend analysis: is Sector A stress worsening? */
  getTrend(): { sectorATrend: number; isWorsening: boolean } {
    if (this.historicalStress.length < 2) return { sectorATrend: 0, isWorsening: false }
    const recent = this.historicalStress.slice(-10)
    const mid = Math.floor(recent.length / 2)
    const first = recent.slice(0, mid).reduce((a, b) => a + b, 0) / mid
    const second = recent.slice(mid).reduce((a, b) => a + b, 0) / (recent.length - mid)
    return {
      sectorATrend: parseFloat((second - first).toFixed(4)),
      isWorsening: second > first,
    }
  }

  getLastSnapshot(): GridStressSnapshot | null { return this.lastSnapshot }
  reset(): void { this.historicalStress.length = 0; this.lastSnapshot = null }
}
