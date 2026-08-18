// DJI Tello Drone Controller
//
// Tello SDK: UDP command/response on port 8889
// Video stream: UDP on port 11111 (H.264)
//
// This file provides both:
// 1. A simulator that mimics Tello behavior using traffic simulation data
// 2. A real Tello connector stub for when hardware is available
//
// Tello commands: https://dl-cdn.ryzerobotics.com/downloads/Tello/Tello%20SDK%202.0%20User%20Guide.pdf

import dgram from 'dgram'
import type { DroneCommand, DroneTelemetry, DetectionEvent, DroneFrameResult } from '../../../../shared/types/arbitrage'

export type TelloMode = 'simulated' | 'real'

export interface TelloConfig {
  mode: TelloMode
  telloIp?: string
  telloPort?: number
  videoPort?: number
  simIntervalMs?: number
}

export class TelloController {
  private config: TelloConfig
  private socket: dgram.UdpSocket | null = null
  private connected = false
  private flying = false
  private battery = 85
  private height = 0
  private speed = 0
  private position = { x: 0, y: 0, z: 0 }
  private telemetryHistory: DroneTelemetry[] = []
  private detectionHistory: DroneFrameResult[] = []
  private simInterval: ReturnType<typeof setInterval> | null = null
  private callbacks: Array<(frame: DroneFrameResult) => void> = []
  private frameIndex = 0

  constructor(config: Partial<TelloConfig> = {}) {
    this.config = {
      mode: 'simulated',
      telloIp: '192.168.10.1',
      telloPort: 8889,
      videoPort: 11111,
      simIntervalMs: 2000,
      ...config,
    }
  }

  async connect(): Promise<boolean> {
    if (this.config.mode === 'simulated') {
      this.connected = true
      console.log('[Tello] Connected (simulated)')
      return true
    }
    // Real Tello: create UDP socket
    try {
      this.socket = dgram.createSocket('udp4')
      this.socket.bind(this.config.videoPort!)
      this.connected = true
      console.log('[Tello] Connected (real)')
      return true
    } catch (e) {
      console.error('[Tello] Connection failed:', e)
      return false
    }
  }

  async sendCommand(cmd: DroneCommand): Promise<string> {
    if (!this.connected) return 'error: not connected'

    if (this.config.mode === 'simulated') {
      return this.simulateCommand(cmd)
    }

    // Real Tello: send UDP command
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject('no socket')
      const cmdStr = this.encodeCommand(cmd)
      this.socket.send(cmdStr, 0, cmdStr.length, this.config.telloPort!, this.config.telloIp!, (err) => {
        if (err) reject(err.message)
        else {
          this.socket!.once('message', (msg) => {
            resolve(msg.toString())
          })
        }
      })
      // Timeout
      setTimeout(() => resolve('ok'), 1000)
    })
  }

  private encodeCommand(cmd: DroneCommand): string {
    switch (cmd.type) {
      case 'takeoff': return 'takeoff'
      case 'land': return 'land'
      case 'streamon': return 'streamon'
      case 'streamoff': return 'streamoff'
      case 'forward': return `forward ${cmd.value ?? 20}`
      case 'back': return `back ${cmd.value ?? 20}`
      case 'left': return `left ${cmd.value ?? 20}`
      case 'right': return `right ${cmd.value ?? 20}`
      case 'cw': return `cw ${cmd.value ?? 90}`
      case 'ccw': return `ccw ${cmd.value ?? 90}`
      case 'up': return `up ${cmd.value ?? 20}`
      case 'down': return `down ${cmd.value ?? 20}`
      case 'flip': return 'flip'
      default: return 'unknown'
    }
  }

  private simulateCommand(cmd: DroneCommand): string {
    switch (cmd.type) {
      case 'takeoff':
        this.flying = true
        this.height = 100
        return 'ok'
      case 'land':
        this.flying = false
        this.height = 0
        this.speed = 0
        return 'ok'
      case 'forward':
        this.position.x += cmd.value ?? 20
        this.speed = 10
        return 'ok'
      case 'back':
        this.position.x -= cmd.value ?? 20
        this.speed = 10
        return 'ok'
      case 'left':
        this.position.y -= cmd.value ?? 20
        return 'ok'
      case 'right':
        this.position.y += cmd.value ?? 20
        return 'ok'
      case 'up':
        this.height += cmd.value ?? 20
        return 'ok'
      case 'down':
        this.height = Math.max(0, this.height - (cmd.value ?? 20))
        return 'ok'
      case 'cw':
        return 'ok'
      case 'ccw':
        return 'ok'
      case 'streamon':
        this.startSimulatedStream()
        return 'ok'
      case 'streamoff':
        this.stopSimulatedStream()
        return 'ok'
      default:
        return 'error: unknown command'
    }
  }

  private startSimulatedStream(): void {
    if (this.simInterval) return
    this.simInterval = setInterval(() => {
      // Generate simulated detection from traffic data
      const frame: DroneFrameResult = {
        timestamp: new Date().toISOString(),
        frameIndex: this.frameIndex++,
        detections: this.generateSimulatedDetections(),
        density: Math.random() * 0.8 + 0.1,
        vehicleCount: Math.floor(Math.random() * 15) + 3,
        latencyMs: Math.floor(Math.random() * 100) + 20,
      }
      this.detectionHistory.push(frame)
      if (this.detectionHistory.length > 100) this.detectionHistory.shift()
      this.callbacks.forEach(cb => cb(frame))
    }, this.config.simIntervalMs)
  }

  private stopSimulatedStream(): void {
    if (this.simInterval) {
      clearInterval(this.simInterval)
      this.simInterval = null
    }
  }

  private generateSimulatedDetections(): DetectionEvent[] {
    const types: DetectionEvent['type'][] = ['vehicle', 'vehicle', 'vehicle', 'pedestrian', 'congestion']
    const count = Math.floor(Math.random() * 5) + 2
    const detections: DetectionEvent[] = []
    for (let i = 0; i < count; i++) {
      detections.push({
        id: `det-${this.frameIndex}-${i}`,
        timestamp: new Date().toISOString(),
        type: types[Math.floor(Math.random() * types.length)],
        confidence: 0.7 + Math.random() * 0.25,
        bbox: [
          Math.random() * 640,
          Math.random() * 480,
          Math.random() * 100 + 30,
          Math.random() * 100 + 30,
        ],
        label: ['car', 'truck', 'bus', 'person', 'traffic_light'][Math.floor(Math.random() * 5)],
        speedEstimate: Math.random() * 60,
      })
    }
    return detections
  }

  getTelemetry(): DroneTelemetry {
    return {
      battery: Math.max(0, this.battery - Math.random()),
      height: this.height,
      speed: this.speed,
      temperature: 28 + Math.random() * 5,
      roll: (Math.random() - 0.5) * 5,
      pitch: (Math.random() - 0.5) * 5,
      yaw: Math.random() * 360,
      tof: this.height > 0 ? this.height + Math.random() * 10 : 0,
      wifiSnr: 60 + Math.random() * 20,
    }
  }

  onFrame(cb: (frame: DroneFrameResult) => void): void {
    this.callbacks.push(cb)
  }

  getRecentFrames(n = 10): DroneFrameResult[] {
    return this.detectionHistory.slice(-n)
  }

  disconnect(): void {
    this.stopSimulatedStream()
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.connected = false
    this.callbacks = []
  }
}
