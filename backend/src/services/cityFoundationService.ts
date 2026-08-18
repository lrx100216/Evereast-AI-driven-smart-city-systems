// CFM ONNX 推理服务 —— 加载 city_foundation.onnx 做推理
// 输入 384 维（256 交通 + 128 能源环境），输出 13 维控制
//
// 注意：ONNX 模型文件 12.8MB，如果不在的话会自动降级到 heuristic 规则
// 降级后的逻辑非常简单，就是"排队多就绿灯长"这种直觉规则
//
// TODO: 推理目前还是单线程，并发高的时候可能瓶颈，后续考虑加推理队列或者 batch

import * as ort from 'onnxruntime-node';
import path from 'path';
import fs from 'fs';

export interface ControlActions {
  /** 11 intersection signal phase weights [0, 1] — use argmax for discrete phase */
  trafficSignals: number[];
  /** Battery charge/discharge rate [-1, +1], negative=discharge, positive=charge */
  batteryCharge: number;
  /** Solar panel servo angle [0, 180] degrees */
  solarAngle: number;
  /** Raw 13-dim output for debugging */
  raw: number[];
  /** Inference time in milliseconds */
  inferenceMs: number;
}

export class CityFoundationService {
  private session: ort.InferenceSession | null = null;
  private modelPath: string;
  private loaded = false;

  constructor() {
    this.modelPath = path.resolve(__dirname, '..', '..', 'models', 'city_foundation.onnx');
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;

    if (!fs.existsSync(this.modelPath)) {
      console.warn(`[CFM] Model not found at ${this.modelPath}. Run ai_model/train_cfm.py first.`);
      console.warn('[CFM] Service will operate in mock mode until model is available.');
      return;
    }

    try {
      this.session = await ort.InferenceSession.create(this.modelPath);
      this.loaded = true;
      console.log(`[CFM] Model loaded: ${path.basename(this.modelPath)}`);
      console.log(`[CFM] Input:  ${this.session.inputNames[0]} (batch × 384)`);
      console.log(`[CFM] Output: ${this.session.outputNames[0]} (batch × 13)`);
    } catch (err) {
      console.error('[CFM] Failed to load model:', err instanceof Error ? err.message : String(err));
    }
  }

  isLoaded(): boolean {
    return this.loaded && this.session !== null;
  }

  /**
   * Run inference on a single city state vector.
   *
   * @param trafficState  256-dim normalized traffic features [0, 1]
   * @param energyState   128-dim normalized energy & environment features [0, 1]
   * @returns ControlActions with 11 signal phases, battery rate, and solar angle
   */
  async predict(
    trafficState: number[],
    energyState: number[],
  ): Promise<ControlActions> {
    // Validate input dimensions
    if (trafficState.length !== 256) {
      throw new Error(`trafficState must be 256-dim, got ${trafficState.length}`);
    }
    if (energyState.length !== 128) {
      throw new Error(`energyState must be 128-dim, got ${energyState.length}`);
    }

    const t0 = Date.now();

    // If model not loaded, fall back to heuristic mock
    if (!this.session) {
      return this.mockPredict(trafficState, energyState, t0);
    }

    // Concatenate into 384-dim vector
    const input = new Float32Array(384);
    for (let i = 0; i < 256; i++) {
      input[i] = Math.max(0, Math.min(1, trafficState[i] || 0));
    }
    for (let i = 0; i < 128; i++) {
      input[256 + i] = Math.max(0, Math.min(1, energyState[i] || 0));
    }

    // Run ONNX inference
    const tensor = new ort.Tensor('float32', input, [1, 384]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[this.session.inputNames[0]] = tensor;

    const results = await this.session.run(feeds);
    const output = results[this.session.outputNames[0]].data as Float32Array;

    const inferenceMs = Date.now() - t0;

    return {
      trafficSignals: Array.from(output.slice(0, 11)),
      batteryCharge: output[11],
      solarAngle: output[12],
      raw: Array.from(output),
      inferenceMs,
    };
  }

  /** Heuristic fallback when ONNX model is unavailable. */
  private mockPredict(
    trafficState: number[],
    energyState: number[],
    t0: number,
  ): ControlActions {
    // Simple weighted congestion → signal logic
    const signals: number[] = [];
    for (let i = 0; i < 11; i++) {
      const base = i * 16;
      const queueSum = (trafficState[base] || 0) + (trafficState[base + 1] || 0)
        + (trafficState[base + 2] || 0) + (trafficState[base + 3] || 0);
      signals.push(Math.min(0.95, Math.max(0.05, 0.3 + queueSum * 0.15)));
    }

    // Battery: charge if solar > 0.4 and SOC < 0.5, discharge if SOC > 0.7
    const solarIrradiance = energyState[4] || 0;
    const batterySoc = energyState[11] || 0.5;
    let battery = 0;
    if (solarIrradiance > 0.4 && batterySoc < 0.5) battery = 0.5;
    else if (batterySoc > 0.7) battery = -0.3;

    // Solar angle: follow irradiance curve
    const solarAngle = Math.round(solarIrradiance * 160 + 10);

    return {
      trafficSignals: signals,
      batteryCharge: battery,
      solarAngle,
      raw: [...signals, battery, solarAngle],
      inferenceMs: Date.now() - t0,
    };
  }
}

export const cityFoundationService = new CityFoundationService();
