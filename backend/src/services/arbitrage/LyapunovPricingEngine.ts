// Lyapunov Dynamic EV Pricing Engine
//
// Spatially-aware EV charging pricing using Lyapunov optimization:
//   Sector A (stressed): raise prices → push EVs away
//   Sector B (safe): lower prices → attract EVs
//   Buffer: mild adjustment
//
// Lyapunov virtual queue Q(t) tracks cumulative pricing "debt"
// Dynamic V amplifies pricing when stress is high

import type { GridStressSnapshot } from './types'
import type { PricingSignal, LyapunovPricingSnapshot } from '../../../../shared/types/arbitrage'
import { SECTOR_ASSIGNMENTS } from './types'

interface StationState {
  id: number
  name: string
  zoneType: string
  basePrice: number
  currentPrice: number
  load: number
  capacity: number
  congestionLevel: number
}

const STATION_INIT: { id: number; name: string; zoneType: string; basePrice: number; capacity: number }[] = [
  { id: 0, name: 'Tech Park Supercharger',  zoneType: 'tech_park',   basePrice: 1.0, capacity: 120 * 12 },
  { id: 1, name: 'AI Blvd Charging Hub',    zoneType: 'tech_park',   basePrice: 1.0, capacity: 60 * 8 },
  { id: 2, name: 'CBD Charging Plaza',      zoneType: 'commercial',  basePrice: 1.1, capacity: 150 * 16 },
  { id: 3, name: 'Mall Drive EV Station',    zoneType: 'commercial',  basePrice: 1.1, capacity: 100 * 10 },
  { id: 4, name: 'Garden Rd Community',      zoneType: 'residential', basePrice: 0.8, capacity: 30 * 6 },
  { id: 5, name: 'Lake Ave Night Charger',   zoneType: 'residential', basePrice: 0.8, capacity: 30 * 8 },
  { id: 6, name: 'Industrial Fast Charge',   zoneType: 'industrial',  basePrice: 0.9, capacity: 200 * 20 },
  { id: 7, name: 'Campus EV Point',          zoneType: 'school',      basePrice: 0.85, capacity: 30 * 4 },
]

export class LyapunovPricingEngine {
  private V = 200                    // Lyapunov trade-off parameter
  private Q = 0                      // virtual queue
  private readonly Q_MAX = 100
  private readonly ALPHA = 0.95      // queue decay

  private stations: Map<number, StationState> = new Map()
  private lastSnapshot: LyapunovPricingSnapshot | null = null
  private readonly priceHistory: { time: string; sectorA: number; sectorB: number }[] = []
  private readonly MAX_HISTORY = 60

  constructor() {
    for (const s of STATION_INIT) {
      this.stations.set(s.id, { ...s, currentPrice: s.basePrice, load: 0, congestionLevel: 0 })
    }
  }

  /**
   * Compute pricing decisions for all stations
   */
  computePricing(
    gridStress: GridStressSnapshot,
    stationLoads: Map<number, number>,
    stationCongestion: Map<number, number>,
    solarEfficiency: number,
  ): LyapunovPricingSnapshot {
    // Update station state
    for (const [id, load] of stationLoads) {
      const s = this.stations.get(id)
      if (s) {
        s.load = load
        s.congestionLevel = stationCongestion.get(id) ?? s.congestionLevel
      }
    }

    // Lyapunov virtual queue update
    const stressGap = gridStress.sectorA.avgStress - gridStress.sectorB.avgStress
    this.Q = Math.max(0, Math.min(this.Q_MAX, this.ALPHA * this.Q + stressGap))
    const dynamicV = this.V * (1 + gridStress.sectorA.maxStress * 0.5)

    const stations: PricingSignal[] = []
    let sectorASum = 0, sectorADeltaSum = 0, sectorACount = 0
    let sectorBSum = 0, sectorBDeltaSum = 0, sectorBCount = 0

    for (const [id, station] of this.stations) {
      const zoneAssignment = SECTOR_ASSIGNMENTS.find(sa => sa.zoneType === station.zoneType)
      const sector = zoneAssignment?.sector ?? 'buffer'
      const zoneStress = gridStress.zones.find(z => z.zoneType === station.zoneType)
      const stressProb = zoneStress?.stressProbability ?? 0

      const congestionPremium = station.congestionLevel * 0.15
      const solarDiscount = solarEfficiency > 0.4 ? solarEfficiency * 0.2 : 0

      let priceDelta: number
      let direction: 'raise' | 'lower' | 'unchanged'
      let reason: string

      if (sector === 'A_stressed') {
        priceDelta = (this.Q / this.Q_MAX) * 0.4 * (1 + stressProb) + congestionPremium
        direction = 'raise'
        reason = `Grid stress ${(stressProb * 100).toFixed(0)}% — discouraging EV inflow`
        sectorACount++
      } else if (sector === 'B_safe') {
        priceDelta = -((1 - this.Q / this.Q_MAX) * 0.3 + solarDiscount)
        direction = 'lower'
        reason = `Safe zone — attracting EVs with ${(Math.abs(priceDelta) * 100).toFixed(0)}% discount`
        sectorBCount++
      } else {
        priceDelta = stressProb > 0.4 ? 0.1 : -solarDiscount * 0.5
        direction = priceDelta > 0.01 ? 'raise' : priceDelta < -0.01 ? 'lower' : 'unchanged'
        reason = 'Buffer zone — mild adjustment'
      }

      const adjustedPrice = Math.max(0.3, station.basePrice + priceDelta)
      const actualDelta = parseFloat((adjustedPrice - station.basePrice).toFixed(4))
      station.currentPrice = adjustedPrice

      const diversionSignal = sector === 'A_stressed'
        ? Math.min(1, stressProb * 1.5)
        : sector === 'B_safe'
          ? Math.max(0, 1 - stressProb * 0.5)
          : 0.5

      stations.push({
        stationId: id,
        zoneType: station.zoneType,
        sector,
        basePrice: station.basePrice,
        adjustedPrice: parseFloat(adjustedPrice.toFixed(4)),
        priceDelta: actualDelta,
        direction,
        reason,
        diversionSignal: parseFloat(diversionSignal.toFixed(4)),
      })

      if (sector === 'A_stressed') { sectorASum += adjustedPrice; sectorADeltaSum += actualDelta }
      else if (sector === 'B_safe') { sectorBSum += adjustedPrice; sectorBDeltaSum += actualDelta }
    }

    const drift = this.Q * stressGap
    const penalty = dynamicV * gridStress.sectorA.avgStress

    const snapshot: LyapunovPricingSnapshot = {
      timestamp: new Date().toISOString(),
      stations,
      sectorA: {
        avgPrice: parseFloat((sectorACount ? sectorASum / sectorACount : 0).toFixed(4)),
        avgDelta: parseFloat((sectorACount ? sectorADeltaSum / sectorACount : 0).toFixed(4)),
        stationCount: sectorACount,
      },
      sectorB: {
        avgPrice: parseFloat((sectorBCount ? sectorBSum / sectorBCount : 0).toFixed(4)),
        avgDelta: parseFloat((sectorBCount ? sectorBDeltaSum / sectorBCount : 0).toFixed(4)),
        stationCount: sectorBCount,
      },
      lyapunovQ: parseFloat(this.Q.toFixed(4)),
      lyapunovDrift: parseFloat((drift + penalty).toFixed(4)),
    }

    this.lastSnapshot = snapshot
    this.priceHistory.push({ time: snapshot.timestamp, sectorA: snapshot.sectorA.avgPrice, sectorB: snapshot.sectorB.avgPrice })
    if (this.priceHistory.length > this.MAX_HISTORY) this.priceHistory.shift()

    return snapshot
  }

  /** Get station prices for JointSimEngine */
  getStationPrices(): Map<number, number> {
    const prices = new Map<number, number>()
    for (const [id, s] of this.stations) prices.set(id, s.currentPrice)
    return prices
  }

  /** Get diversion signals for MARL */
  getDiversionSignals(): Map<string, number> {
    const signals = new Map<string, number>()
    for (const sa of SECTOR_ASSIGNMENTS) {
      const maxSignal = Math.max(...sa.stationIds.map(id => this.stations.get(id)?.currentPrice ?? 0))
      signals.set(sa.zoneType, maxSignal)
    }
    return signals
  }

  getLyapunovQ(): number { return this.Q }
  getLastSnapshot(): LyapunovPricingSnapshot | null { return this.lastSnapshot }
  getPriceHistory(): { time: string; sectorA: number; sectorB: number }[] { return this.priceHistory }
  reset(): void { this.Q = 0; this.lastSnapshot = null; this.priceHistory.length = 0 }
}
