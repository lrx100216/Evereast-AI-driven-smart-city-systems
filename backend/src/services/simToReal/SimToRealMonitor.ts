// Sim-to-Real Discrepancy Monitor
//
// Core concept: run a shadow simulation in parallel with real hardware, compare
// "what the algorithm thinks should happen" vs "what hardware actually does".
//
// If the discrepancy exceeds a threshold, the DP module auto-increases edge
// noise to prevent overfitting to hardware glitches.
//
// Sim-to-Real Discrepancy Index (SRDI):
//   SRDI = Σ w_i · |y_sim_i − y_real_i| / (|y_sim_i| + |y_real_i| + ε)
//
// where w_i are per-channel weights (traffic, solar, battery, etc.)

export interface SimToRealChannel {
  name: string
  simValue: number
  realValue: number
  weight: number  // importance weight [0, 1]
}

export interface SimToRealSnapshot {
  timestamp: string
  /** Composite discrepancy index [0, 1] — 0 = perfect match */
  compositeIndex: number
  /** Per-channel breakdown */
  channels: SimToRealChannel[]
  /** Maximum single-channel discrepancy */
  maxDiscrepancy: number
  /** Which channel has the worst mismatch */
  worstChannel: string
  /** Current risk level */
  riskLevel: 'low' | 'moderate' | 'high' | 'critical'
  /** Recommended noise multiplier adjustment for DP module */
  recommendedNoiseBoost: number
  /** Whether the system should increase privacy noise */
  shouldBoostNoise: boolean
  /** Running history of composite index */
  history: number[]
}

export class SimToRealMonitor {
  private readonly history: number[] = []
  private readonly MAX_HISTORY = 60
  private readonly SRDI_THRESHOLD_LOW = 0.05
  private readonly SRDI_THRESHOLD_MODERATE = 0.12
  private readonly SRDI_THRESHOLD_HIGH = 0.25
  private readonly SRDI_THRESHOLD_CRITICAL = 0.40

  private lastSnapshot: SimToRealSnapshot | null = null

  /**
   * Compute Sim-to-Real Discrepancy Index
   *
   * @param channels Array of {name, simValue, realValue, weight} for each monitored channel
   */
  compute(channels: SimToRealChannel[]): SimToRealSnapshot {
    const rawDiscrepancies = channels.map(ch => {
      const denom = Math.abs(ch.simValue) + Math.abs(ch.realValue) + 1e-8
      return {
        ...ch,
        discrepancy: Math.abs(ch.simValue - ch.realValue) / denom,
      }
    })

    // Weighted composite index
    const totalWeight = rawDiscrepancies.reduce((s, c) => s + c.weight, 0) || 1
    const compositeIndex = rawDiscrepancies.reduce(
      (s, c) => s + c.weight * c.discrepancy / totalWeight, 0
    )

    // Worst channel
    const worst = rawDiscrepancies.reduce(
      (worst, c) => c.discrepancy > worst.discrepancy ? c : worst,
      rawDiscrepancies[0]
    )

    // Risk level
    let riskLevel: 'low' | 'moderate' | 'high' | 'critical'
    if (compositeIndex < this.SRDI_THRESHOLD_LOW) riskLevel = 'low'
    else if (compositeIndex < this.SRDI_THRESHOLD_MODERATE) riskLevel = 'moderate'
    else if (compositeIndex < this.SRDI_THRESHOLD_HIGH) riskLevel = 'high'
    else riskLevel = 'critical'

    // Noise boost: when sim-to-real gap is large, increase DP noise
    // This prevents the model from overfitting to hardware glitches
    const recommendedNoiseBoost = compositeIndex > this.SRDI_THRESHOLD_HIGH
      ? Math.min(3.0, 1.0 + compositeIndex * 5)
      : 1.0

    this.history.push(compositeIndex)
    if (this.history.length > this.MAX_HISTORY) this.history.shift()

    const snapshot: SimToRealSnapshot = {
      timestamp: new Date().toISOString(),
      compositeIndex: parseFloat(compositeIndex.toFixed(6)),
      channels: rawDiscrepancies.map(c => ({
        name: c.name,
        simValue: parseFloat(c.simValue.toFixed(4)),
        realValue: parseFloat(c.realValue.toFixed(4)),
        weight: c.weight,
      })),
      maxDiscrepancy: parseFloat(worst.discrepancy.toFixed(6)),
      worstChannel: worst.name,
      riskLevel,
      recommendedNoiseBoost: parseFloat(recommendedNoiseBoost.toFixed(2)),
      shouldBoostNoise: compositeIndex > this.SRDI_THRESHOLD_HIGH,
      history: [...this.history],
    }

    this.lastSnapshot = snapshot
    return snapshot
  }

  /**
   * Generate synthetic shadow comparison data
   * (used when real hardware isn't available — simulates sensor drift)
   */
  generateShadowComparison(
    trafficCongestion: number,
    solarOutput: number,
    batterySoc: number,
    temperature: number,
  ): SimToRealChannel[] {
    // Simulate realistic sensor drift:
    // - Traffic: camera-based detection has ±5-15% error
    // - Solar: irradiance sensor drifts with dust accumulation
    // - Battery: voltage-based SOC estimation has ±3% error
    // - Temperature: DHT11 has ±2°C accuracy
    const seed = Date.now() % 1000 / 1000

    return [
      {
        name: 'Traffic Congestion',
        simValue: trafficCongestion,
        realValue: Math.max(0, Math.min(1,
          trafficCongestion * (1 + 0.08 * Math.sin(seed * 2 * Math.PI) + (Math.random() - 0.5) * 0.06)
        )),
        weight: 0.35,
      },
      {
        name: 'Solar Output',
        simValue: solarOutput,
        realValue: Math.max(0,
          solarOutput * (1 + 0.05 * Math.sin(seed * 2 * Math.PI + 1) + (Math.random() - 0.5) * 0.1)
        ),
        weight: 0.30,
      },
      {
        name: 'Battery SOC',
        simValue: batterySoc,
        realValue: Math.max(0, Math.min(100,
          batterySoc * (1 + 0.03 * Math.sin(seed * 2 * Math.PI + 2) + (Math.random() - 0.5) * 0.02)
        )),
        weight: 0.20,
      },
      {
        name: 'Temperature',
        simValue: temperature,
        realValue: temperature + (Math.random() - 0.5) * 3 + 0.5 * Math.sin(seed * 2 * Math.PI + 3),
        weight: 0.15,
      },
    ]
  }

  getLastSnapshot(): SimToRealSnapshot | null { return this.lastSnapshot }
  getHistory(): number[] { return this.history }
  reset(): void { this.history.length = 0; this.lastSnapshot = null }
}
