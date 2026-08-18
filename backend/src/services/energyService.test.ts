import { describe, it, expect, beforeEach } from 'vitest';
import { EnergyService } from './energyService';

describe('EnergyService', () => {
  let svc: EnergyService;

  beforeEach(() => {
    svc = new EnergyService();
  });

  it('should start with default values', () => {
    const status = svc.getStatus();
    expect(status.solarVoltage).toBe(0);
    expect(status.batteryLevel).toBe(50);
    expect(status.panelAngle).toBe(90);
    expect(status.powerOutput).toBe(0);
    expect(status.consumption).toBe(0);
  });

  it('should update data partially', () => {
    svc.updateData({ solarVoltage: 5.0, batteryLevel: 75 });
    const status = svc.getStatus();

    expect(status.solarVoltage).toBe(5.0);
    expect(status.batteryLevel).toBe(75);
    expect(status.panelAngle).toBe(90); // unchanged
  });

  it('should set panel angle with clamping (0-180)', () => {
    svc.setPanelAngle(45);
    expect(svc.getStatus().panelAngle).toBe(45);

    svc.setPanelAngle(-10);
    expect(svc.getStatus().panelAngle).toBe(0);

    svc.setPanelAngle(200);
    expect(svc.getStatus().panelAngle).toBe(180);
  });

  it('should store history with max 100 entries', () => {
    for (let i = 0; i < 120; i++) {
      svc.updateData({ batteryLevel: i % 100 });
    }
    expect(svc.getHistory().length).toBe(100);
  });

  describe('getStorageStrategy', () => {
    it('should recommend store when battery low and generating excess', () => {
      svc.updateData({ batteryLevel: 15, powerOutput: 10, consumption: 3 });
      const strategy = svc.getStorageStrategy();
      expect(strategy.action).toBe('store');
      expect(strategy.amount).toBeCloseTo(7);
    });

    it('should recommend release when battery high and consuming more than generating', () => {
      svc.updateData({ batteryLevel: 85, powerOutput: 2, consumption: 8 });
      const strategy = svc.getStorageStrategy();
      expect(strategy.action).toBe('release');
      expect(strategy.amount).toBe(5); // 8-2=6, but min(6, 85-80=5) = 5
    });

    it('should recommend idle when battery level is moderate', () => {
      svc.updateData({ batteryLevel: 50, powerOutput: 5, consumption: 5 });
      const strategy = svc.getStorageStrategy();
      expect(strategy.action).toBe('idle');
      expect(strategy.amount).toBe(0);
    });

    it('should recommend idle when battery low but not generating excess', () => {
      svc.updateData({ batteryLevel: 15, powerOutput: 1, consumption: 5 });
      const strategy = svc.getStorageStrategy();
      expect(strategy.action).toBe('idle');
    });

    it('should recommend idle when battery high but not consuming more than generating', () => {
      svc.updateData({ batteryLevel: 85, powerOutput: 8, consumption: 3 });
      const strategy = svc.getStorageStrategy();
      expect(strategy.action).toBe('idle');
    });
  });
});
