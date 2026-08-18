import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

// We cannot easily mock Socket.IO internals, so we create a real server
// and inspect emitted events.
function createMockIO(): { io: SocketIOServer; events: Record<string, any[]> } {
  const server = http.createServer();
  const io = new SocketIOServer(server);
  const events: Record<string, any[]> = {};

  io.on('connection', () => {
    // stub
  });

  // Monkey-patch emit to capture calls
  const originalEmit = io.emit.bind(io);
  io.emit = ((event: string, ...args: any[]) => {
    if (!events[event]) events[event] = [];
    events[event].push(args);
    return originalEmit(event, ...args);
  }) as any;

  return { io, events };
}

describe('serialManager', () => {
  const originalEnv = process.env.SERIAL_PORT;

  beforeEach(() => {
    delete process.env.SERIAL_PORT;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SERIAL_PORT = originalEnv;
    } else {
      delete process.env.SERIAL_PORT;
    }
  });

  it('should start simulation mode when SERIAL_PORT is not set', async () => {
    const { setupSerial } = await import('./serialManager');
    const { io, events } = createMockIO();

    await setupSerial(io);

    // Give simulation one tick to fire
    await new Promise((r) => setTimeout(r, 100));

    expect(events['hardware:data']).toBeDefined();
    expect(events['hardware:data'].length).toBeGreaterThanOrEqual(3);
  });

  it('should emit traffic, energy and weather data in simulation mode', async () => {
    const { setupSerial } = await import('./serialManager');
    const { io, events } = createMockIO();

    await setupSerial(io);
    await new Promise((r) => setTimeout(r, 100));

    const dataList = events['hardware:data'] || [];
    const types = dataList.map((args) => args[0]?.type);

    expect(types).toContain('traffic');
    expect(types).toContain('energy');
    expect(types).toContain('weather');
  });

  it('should emit traffic data with required fields', async () => {
    const { setupSerial } = await import('./serialManager');
    const { io, events } = createMockIO();

    await setupSerial(io);
    await new Promise((r) => setTimeout(r, 100));

    const traffic = (events['hardware:data'] || []).find(
      (args) => args[0]?.type === 'traffic'
    )?.[0];

    expect(traffic).toBeDefined();
    expect(typeof traffic.carCount).toBe('number');
    expect(typeof traffic.pedestrianCount).toBe('number');
    expect(typeof traffic.congestionLevel).toBe('number');
    expect(typeof traffic.averageSpeed).toBe('number');
    expect(typeof traffic.timestamp).toBe('string');
  });

  it('should emit energy data with required fields', async () => {
    const { setupSerial } = await import('./serialManager');
    const { io, events } = createMockIO();

    await setupSerial(io);
    await new Promise((r) => setTimeout(r, 100));

    const energy = (events['hardware:data'] || []).find(
      (args) => args[0]?.type === 'energy'
    )?.[0];

    expect(energy).toBeDefined();
    expect(typeof energy.solarVoltage).toBe('number');
    expect(typeof energy.batteryLevel).toBe('number');
    expect(typeof energy.panelAngle).toBe('number');
    expect(typeof energy.powerOutput).toBe('number');
    expect(typeof energy.consumption).toBe('number');
  });

  it('should emit weather data with required fields', async () => {
    const { setupSerial } = await import('./serialManager');
    const { io, events } = createMockIO();

    await setupSerial(io);
    await new Promise((r) => setTimeout(r, 100));

    const weather = (events['hardware:data'] || []).find(
      (args) => args[0]?.type === 'weather'
    )?.[0];

    expect(weather).toBeDefined();
    expect(typeof weather.temperature).toBe('number');
    expect(typeof weather.humidity).toBe('number');
    expect(typeof weather.lightIntensity).toBe('number');
    expect(['sunny', 'cloudy', 'rainy']).toContain(weather.weatherCondition);
  });

  it('should fall back to simulation when SERIAL_PORT is set but serialport module is missing', async () => {
    process.env.SERIAL_PORT = '/dev/fake-tty';
    vi.resetModules();

    // Mock the serialport module to throw on import
    vi.doMock('serialport', () => {
      throw new Error('Module not found');
    });
    vi.doMock('@serialport/parser-readline', () => {
      throw new Error('Module not found');
    });

    const { setupSerial } = await import('./serialManager');
    const { io, events } = createMockIO();

    await setupSerial(io);
    await new Promise((r) => setTimeout(r, 100));

    // Should still emit simulation data because dynamic import will throw
    expect(events['hardware:data']).toBeDefined();
    expect(events['hardware:data'].length).toBeGreaterThanOrEqual(3);

    vi.doUnmock('serialport');
    vi.doUnmock('@serialport/parser-readline');
  });
});
