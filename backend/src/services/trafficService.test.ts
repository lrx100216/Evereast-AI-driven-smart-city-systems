import { describe, it, expect, beforeEach } from 'vitest';
import { TrafficService } from './trafficService';

describe('TrafficService', () => {
  let svc: TrafficService;

  beforeEach(() => {
    svc = new TrafficService();
  });

  it('should start with default values', () => {
    const status = svc.getStatus();
    expect(status.carCount).toBe(0);
    expect(status.pedestrianCount).toBe(0);
    expect(status.congestionLevel).toBe(0);
    expect(status.averageSpeed).toBe(0);
  });

  it('should update data partially', () => {
    svc.updateData({ carCount: 15, congestionLevel: 60 });

    const status = svc.getStatus();
    expect(status.carCount).toBe(15);
    expect(status.congestionLevel).toBe(60);
    expect(status.pedestrianCount).toBe(0); // unchanged
  });

  it('should keep history', () => {
    svc.updateData({ carCount: 10 });
    svc.updateData({ carCount: 20 });
    svc.updateData({ carCount: 30 });

    const history = svc.getHistory();
    expect(history.length).toBe(3);
    expect(history[0].carCount).toBe(10);
    expect(history[2].carCount).toBe(30);
  });

  it('should cap history at 100', () => {
    for (let i = 0; i < 150; i++) {
      svc.updateData({ carCount: i });
    }
    expect(svc.getHistory().length).toBe(100);
  });

  it('should set signal timing', () => {
    svc.updateSignalTiming('main', 30, 20);
    const timing = svc.getOptimalTiming(25);
    expect(timing.green).toBeGreaterThanOrEqual(10);
    expect(timing.red).toBeGreaterThanOrEqual(10);
  });

  it('getOptimalTiming: more cars reduces green (current formula)', () => {
    // Current formula: green = clamp(30 - (flow - 25) * 0.4, 10, 60)
    // So more cars → shorter green. This is the current behavior.
    const lowTraffic = svc.getOptimalTiming(5);
    const highTraffic = svc.getOptimalTiming(45);

    expect(lowTraffic.green).toBe(38);  // 30 - (5-25)*0.4 = 38
    expect(highTraffic.green).toBe(22); // 30 - (45-25)*0.4 = 22
  });

  it('getOptimalTiming should clamp between 10 and 60', () => {
    const zeroTraffic = svc.getOptimalTiming(0);
    const extremeTraffic = svc.getOptimalTiming(100);

    expect(zeroTraffic.green).toBeGreaterThanOrEqual(10);
    expect(zeroTraffic.green).toBeLessThanOrEqual(60);
    expect(zeroTraffic.red).toBeGreaterThanOrEqual(10);
    expect(zeroTraffic.red).toBeLessThanOrEqual(60);

    expect(extremeTraffic.green).toBeGreaterThanOrEqual(10);
    expect(extremeTraffic.green).toBeLessThanOrEqual(60);
    expect(extremeTraffic.red).toBeGreaterThanOrEqual(10);
    expect(extremeTraffic.red).toBeLessThanOrEqual(60);
  });
});
