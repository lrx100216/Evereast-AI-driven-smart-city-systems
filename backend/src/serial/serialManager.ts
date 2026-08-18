/**
 * 【模块说明】serial/serialManager.ts — 串口硬件接入与模拟数据管理器
 * Module: serial/serialManager.ts — Serial hardware & simulated data manager
 *
 * 【功能】连接 Arduino UNO 串口（9600 baud）接收 JSON 传感器数据；
 *         当未配置 SERIAL_PORT 时自动降级为软件模拟模式，
 *         每 3 秒生成 traffic/energy/weather 数据并通过 WebSocket 广播，
 *         同时写入全局 store 供 REST / AI 消费。
 * Function: Connects to Arduino UNO (9600 baud) to receive JSON sensor data;
 *           falls back to software simulation when SERIAL_PORT is unset,
 *           generating traffic/energy/weather every 3 s, broadcasting via WebSocket,
 *           and writing to the global store for REST / AI consumption.
 *
 * 【关键配置】
 *   - SERIAL_PORT   环境变量：Windows 示例 COM3，Linux/Mac 示例 /dev/ttyUSB0
 *                   留空或缺失则启用模拟模式
 *   - baudRate: 9600
 *   - 模拟间隔：3000 ms
 * Key Configs:
 *   - SERIAL_PORT   Env var: e.g. COM3 on Windows, /dev/ttyUSB0 on Linux/Mac
 *                   Empty/missing → simulation mode
 *   - baudRate: 9600
 *   - Sim interval: 3000 ms
 *
 * 【主要导出】
 *   - setupSerial(io)  异步初始化：尝试打开串口，失败则转模拟模式
 * Exports:
 *   - setupSerial(io)  Async init: tries serial port, falls back to simulation on failure
 *
 * 【连接关系】
 *   ← 被 index.ts 调用，传入 SocketIOServer 实例
 *   → 调用 store.ts 的 updateTraffic / updateEnergy / updateWeather 写入共享状态
 *   → 通过 io.emit('hardware:data') 向前端推送实时数据
 * Connections:
 *   ← Called by index.ts with the SocketIOServer instance
 *   → Calls store.ts updateTraffic / updateEnergy / updateWeather
 *   → Pushes real-time data to frontend via io.emit('hardware:data')
 */

import { Server as SocketIOServer } from 'socket.io';
import { updateTraffic, updateEnergy, updateWeather } from '../store';

/**
 * 串口管理器 — 硬件接入层
 *
 * ## 工作模式
 *
 * 1. **硬件模式** (SERIAL_PORT 已设置)
 *    - 连接 Arduino UNO (9600 baud)
 *    - 接收 JSON 格式传感器数据: {"type":"traffic"|"energy"|"weather", ...}
 *    - 通过 WebSocket `hardware:data` 事件广播
 *    - 写入共享 store 供 REST API / AI 消费
 *
 * 2. **模拟模式** (默认，无 SERIAL_PORT)
 *    - 每 3 秒生成模拟传感器数据
 *    - 同上路径广播并存储
 *    - 当前端未连接硬件时可正常开发
 *
 * ## Arduino JSON 数据格式
 *
 * ```json
 * {"type":"traffic","carCount":12,"pedestrianCount":5,"congestionLevel":45,"averageSpeed":32}
 * {"type":"energy","solarVoltage":4.2,"batteryLevel":67,"panelAngle":90,"powerOutput":3.4,"consumption":1.2}
 * {"type":"weather","temperature":26.5,"humidity":62,"lightIntensity":750,"weatherCondition":"sunny"}
 * ```
 *
 * ## 环境变量
 * - `SERIAL_PORT` — Arduino 串口路径 (留空=模拟模式)
 *   - Windows: COM3
 *   - Linux/Mac: /dev/ttyUSB0, /dev/ttyACM0
 *
 * ## 未来扩展
 * - 无人机 (DJI Tello): 添加 UDP/TCP 适配器，输入 `drone:telemetry` 事件
 * - 自定义传感器: 添加 HTTP POST `/api/hardware/ingest` 端点
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serialPort: any | null = null;
let simIntervalId: ReturnType<typeof setInterval> | null = null;

export async function setupSerial(io: SocketIOServer) {
  // Auto-detect Arduino port (common patterns)
  const portPath = process.env.SERIAL_PORT || '';

  if (!portPath) {
    console.log('[Serial] No SERIAL_PORT set. Running in simulation mode.');
    startSimulation(io);
    return;
  }

  try {
    // Dynamic import so the backend can start even when serialport is not installed (e.g. on macOS without build tools).
    const { SerialPort } = await import('serialport');
    const { ReadlineParser } = await import('@serialport/parser-readline');

    serialPort = new SerialPort({ path: portPath, baudRate: 9600 });
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (data: string) => {
      try {
        const parsed = JSON.parse(data.trim());
        io.emit('hardware:data', parsed);
      } catch {
        console.warn('[Serial] Invalid data:', data);
      }
    });

    serialPort.on('open', () => console.log(`[Serial] Connected to ${portPath}`));
    serialPort.on('error', (err: Error) => {
      console.error('[Serial] Error:', err.message);
      // If port fails after creation, fall back to simulation
      if (simIntervalId === null) {
        startSimulation(io);
      }
    });
  } catch (err) {
    console.warn('[Serial] Failed to open port (serialport module may be missing), switching to simulation mode.');
    startSimulation(io);
  }
}

function getSolarFactor(): number {
  // Use UTC+8 arithmetic instead of toLocaleString for cross-platform reliability
  const now = new Date();
  const szHour = (now.getUTCHours() + 8) % 24;
  const szMinute = now.getUTCMinutes();
  const hour = szHour + szMinute / 60;
  if (hour >= 6 && hour <= 18) return Math.sin(Math.PI * (hour - 6) / 12);
  return 0;
}

function startSimulation(io: SocketIOServer) {
  console.log('[Simulation] Starting simulated Arduino data...');

  if (simIntervalId) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }

  const sendSimulated = () => {
    const solarFactor = getSolarFactor();
    const isNight = solarFactor < 0.05;
    const weatherRoll = Math.random();
    const weatherCondition = isNight
      ? 'sunny'
      : weatherRoll < 0.45 ? 'sunny' : weatherRoll < 0.75 ? 'cloudy' : 'rainy';

    const traffic = {
      type: 'traffic',
      carCount: Math.floor(Math.random() * 30) + 5,
      pedestrianCount: Math.floor(Math.random() * 15) + 2,
      congestionLevel: Math.floor(Math.random() * 100),
      averageSpeed: Math.floor(Math.random() * 40) + 10,
      timestamp: new Date().toISOString(),
    };

    const energy = {
      type: 'energy',
      solarVoltage: +((isNight ? 0.1 : 2.0) + Math.random() * 3 * solarFactor).toFixed(2),
      batteryLevel: Math.floor(isNight ? 30 + Math.random() * 20 : 40 + Math.random() * 40),
      panelAngle: Math.floor(isNight ? 0 : 60 + Math.random() * 120),
      powerOutput: +((isNight ? 0 : 2) + Math.random() * 10 * solarFactor).toFixed(1),
      consumption: +(Math.random() * 5 + 1).toFixed(1),
      timestamp: new Date().toISOString(),
    };

    const weather = {
      type: 'weather' as const,
      temperature: +((isNight ? 15 : 24) + Math.random() * 8).toFixed(1),
      humidity: Math.floor(isNight ? 55 + Math.random() * 25 : 40 + Math.random() * 30),
      lightIntensity: Math.floor(solarFactor * (500 + Math.random() * 500)),
      weatherCondition: weatherCondition as 'sunny' | 'cloudy' | 'rainy',
      timestamp: new Date().toISOString(),
    };

    io.emit('hardware:data', traffic);
    io.emit('hardware:data', energy);
    io.emit('hardware:data', weather);

    // Push to shared store for REST / AI consumption
    updateTraffic(traffic);
    updateEnergy(energy);
    updateWeather(weather);
  };

  sendSimulated();
  simIntervalId = setInterval(sendSimulated, 3000);
}
