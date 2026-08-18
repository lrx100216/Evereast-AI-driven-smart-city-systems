// Object Detection Service
//
// Two modes:
// - simulated: generates detections from traffic simulation state
// - real: processes incoming video frames (stub for YOLO integration)
//
// DJI Tello streams H.264 over UDP on port 11111.
// For real deployment, use a Python sidecar with YOLOv8-nano that sends
// detection results via WebSocket.

import type { DetectionEvent, DroneFrameResult } from '../../../../shared/types/arbitrage'

export type DetectionMode = 'simulated' | 'real'

export interface DetectionConfig {
  mode: DetectionMode
  confidenceThreshold: number
  maxDetectionsPerFrame: number
}

export class ObjectDetector {
  private config: DetectionConfig
  private frameCount = 0
  private latencyHistory: number[] = []

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = {
      mode: 'simulated',
      confidenceThreshold: 0.5,
      maxDetectionsPerFrame: 20,
      ...config,
    }
  }

  /**
   * Process a frame buffer (real mode) or generate from sim state (simulated mode)
   */
  async processFrame(
    frameBuffer?: Buffer,
    simContext?: { vehicleCount: number; density: number; congestionLevel: number },
  ): Promise<DroneFrameResult> {
    const t0 = Date.now()
    this.frameCount++

    let detections: DetectionEvent[]
    let density: number
    let vehicleCount: number

    if (this.config.mode === 'real' && frameBuffer) {
      // Real mode: would pass to YOLO here
      // For now, use basic frame analysis stub
      const result = this.analyzeFrameStub(frameBuffer)
      detections = result.detections
      density = result.density
      vehicleCount = result.vehicleCount
    } else {
      // Simulated mode: generate from context
      detections = this.generateDetections(simContext ?? { vehicleCount: 10, density: 0.3, congestionLevel: 0.2 })
      density = simContext?.density ?? 0.3
      vehicleCount = simContext?.vehicleCount ?? 10
    }

    const latency = Date.now() - t0
    this.latencyHistory.push(latency)
    if (this.latencyHistory.length > 50) this.latencyHistory.shift()

    return {
      timestamp: new Date().toISOString(),
      frameIndex: this.frameCount,
      detections: detections.filter(d => d.confidence >= this.config.confidenceThreshold).slice(0, this.config.maxDetectionsPerFrame),
      density: parseFloat(density.toFixed(4)),
      vehicleCount,
      latencyMs: latency,
    }
  }

  private generateDetections(ctx: { vehicleCount: number; density: number; congestionLevel: number }): DetectionEvent[] {
    const { vehicleCount, density, congestionLevel } = ctx
    const detections: DetectionEvent[] = []
    const baseCount = Math.max(2, Math.floor(vehicleCount * 0.7))

    for (let i = 0; i < baseCount; i++) {
      detections.push({
        id: `sim-${this.frameCount}-${i}`,
        timestamp: new Date().toISOString(),
        type: 'vehicle',
        confidence: 0.75 + Math.random() * 0.2,
        bbox: [
          Math.random() * 640,
          Math.random() * 480,
          40 + Math.random() * 60,
          30 + Math.random() * 50,
        ],
        label: ['car', 'suv', 'truck'][Math.floor(Math.random() * 3)],
        speedEstimate: Math.random() * 60,
      })
    }

    // Add congestion detection if level is high
    if (congestionLevel > 0.6) {
      detections.push({
        id: `sim-${this.frameCount}-cong`,
        timestamp: new Date().toISOString(),
        type: 'congestion',
        confidence: 0.6 + congestionLevel * 0.3,
        bbox: [200, 100, 300, 200],
        label: 'congestion',
      })
    }

    return detections
  }

  private analyzeFrameStub(_buffer: Buffer): { detections: DetectionEvent[]; density: number; vehicleCount: number } {
    // Stub for real video processing
    // In production, this would run YOLOv8 inference
    return {
      detections: [{
        id: `real-${this.frameCount}`,
        timestamp: new Date().toISOString(),
        type: 'vehicle',
        confidence: 0.85,
        bbox: [320, 240, 50, 40],
        label: 'car',
      }],
      density: 0.3,
      vehicleCount: 5,
    }
  }

  getAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0
    return this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
  }

  reset(): void {
    this.frameCount = 0
    this.latencyHistory = []
  }
}
