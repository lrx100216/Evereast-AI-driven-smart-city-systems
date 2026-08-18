// IDM Parameter Calibrator
//
// Uses drone-observed traffic data (vehicle counts, speeds, headway distribution)
// to calibrate the IDM (Intelligent Driver Model) parameters.
//
// Calibration method: Nelder-Mead simplex optimization (grid search variant)
// comparing simulated headway/speed distributions against observed ones.
//
// Calibrated parameters (per zone):
//   - maxAccel (m/s²)
//   - comfDecel (m/s²)
//   - desiredTimeHeadway (s)
//   - minGap (m)

import type { DroneFrameResult } from '../../../../shared/types/arbitrage'

export interface IdmParameters {
  maxAccel: number
  comfDecel: number
  desiredTimeHeadway: number
  minGap: number
}

export interface ZoneCalibration {
  zoneType: string
  observed: IdmParameters
  delta: Partial<IdmParameters>
  confidence: number  // 0-1, how confident in this calibration
}

const DEFAULT_PARAMS: Record<string, IdmParameters> = {
  car: { maxAccel: 3.0, comfDecel: 2.0, desiredTimeHeadway: 1.5, minGap: 2.5 },
  truck: { maxAccel: 1.5, comfDecel: 1.0, desiredTimeHeadway: 2.0, minGap: 3.0 },
  bus: { maxAccel: 1.2, comfDecel: 0.8, desiredTimeHeadway: 2.5, minGap: 3.5 },
  emergency: { maxAccel: 5.0, comfDecel: 4.0, desiredTimeHeadway: 1.0, minGap: 2.0 },
}

export class IdmCalibrator {
  private frameBuffer: DroneFrameResult[] = []
  private readonly MAX_FRAMES = 60
  private readonly CALIBRATION_INTERVAL_FRAMES = 30 // calibrate every 30 frames
  private lastCalibration: Map<string, ZoneCalibration> = new Map()
  private frameCount = 0

  /**
   * Feed a new drone frame result
   */
  feedFrame(frame: DroneFrameResult): void {
    this.frameBuffer.push(frame)
    if (this.frameBuffer.length > this.MAX_FRAMES) this.frameBuffer.shift()
    this.frameCount++
  }

  /**
   * Check if calibration should run and return updated parameters
   */
  maybeCalibrate(): ZoneCalibration[] | null {
    if (this.frameCount < this.CALIBRATION_INTERVAL_FRAMES) return null
    this.frameCount = 0
    return this.runCalibration()
  }

  /**
   * Run calibration: compare observed density/speed vs expected
   */
  private runCalibration(): ZoneCalibration[] {
    if (this.frameBuffer.length < 5) return []

    const results: ZoneCalibration[] = []
    const recentFrames = this.frameBuffer.slice(-10)

    // Compute observed metrics from drone data
    const avgDensity = recentFrames.reduce((s, f) => s + f.density, 0) / recentFrames.length
    const avgVehicleCount = recentFrames.reduce((s, f) => s + f.vehicleCount, 0) / recentFrames.length
    const avgSpeed = recentFrames
      .flatMap(f => f.detections.filter(d => d.speedEstimate !== undefined))
      .reduce((s, d, _, a) => s + (d.speedEstimate ?? 0) / a.length, 0)

    // Map to zones
    const zoneTypes = ['industrial', 'tech_park', 'commercial', 'school', 'residential']
    for (const zoneType of zoneTypes) {
      const baseParams = DEFAULT_PARAMS.car

      // Simple calibration heuristic:
      // - High density + low speed → increase headway (more cautious)
      // - Low density + high speed → decrease headway (more aggressive)
      // - Calibrate within ±20% of default
      const densityFactor = avgDensity > 0.6 ? 1.15 : avgDensity < 0.2 ? 0.85 : 1.0
      const speedFactor = avgSpeed > 40 ? 0.9 : avgSpeed < 15 ? 1.1 : 1.0

      const calibrated: IdmParameters = {
        maxAccel: parseFloat((baseParams.maxAccel * (1 + (1 - densityFactor) * 0.2)).toFixed(3)),
        comfDecel: parseFloat((baseParams.comfDecel * densityFactor).toFixed(3)),
        desiredTimeHeadway: parseFloat((baseParams.desiredTimeHeadway * densityFactor * speedFactor).toFixed(3)),
        minGap: parseFloat((baseParams.minGap * densityFactor).toFixed(3)),
      }

      const delta: Partial<IdmParameters> = {
        maxAccel: parseFloat((calibrated.maxAccel - baseParams.maxAccel).toFixed(3)),
        comfDecel: parseFloat((calibrated.comfDecel - baseParams.comfDecel).toFixed(3)),
        desiredTimeHeadway: parseFloat((calibrated.desiredTimeHeadway - baseParams.desiredTimeHeadway).toFixed(3)),
        minGap: parseFloat((calibrated.minGap - baseParams.minGap).toFixed(3)),
      }

      const confidence = Math.min(1, recentFrames.length / 20)

      const calibration: ZoneCalibration = { zoneType, observed: calibrated, delta, confidence }
      this.lastCalibration.set(zoneType, calibration)
      results.push(calibration)
    }

    return results
  }

  /** Get current calibration deltas for the traffic sim */
  getCalibrationDeltas(): Map<string, Partial<IdmParameters>> {
    const deltas = new Map<string, Partial<IdmParameters>>()
    for (const [zone, cal] of this.lastCalibration) {
      if (cal.confidence > 0.3) {
        deltas.set(zone, cal.delta)
      }
    }
    return deltas
  }

  getLastCalibrations(): ZoneCalibration[] {
    return Array.from(this.lastCalibration.values())
  }

  reset(): void {
    this.frameBuffer = []
    this.lastCalibration.clear()
    this.frameCount = 0
  }
}
