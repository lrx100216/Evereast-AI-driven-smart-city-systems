import { describe, it, expect, beforeEach } from 'vitest';
import { WeatherService } from './weatherService';

describe('WeatherService', () => {
  let svc: WeatherService;

  beforeEach(() => {
    svc = new WeatherService();
  });

  it('should start with default values', () => {
    const current = svc.getCurrent();
    expect(current.temperature).toBe(25);
    expect(current.humidity).toBe(60);
    expect(current.lightIntensity).toBe(500);
    expect(current.weatherCondition).toBe('unknown');
  });

  it('should update data partially', () => {
    svc.updateData({ temperature: 32, weatherCondition: 'sunny' });
    const current = svc.getCurrent();

    expect(current.temperature).toBe(32);
    expect(current.weatherCondition).toBe('sunny');
    expect(current.humidity).toBe(60); // unchanged
  });

  it('should store history with max 100 entries', () => {
    for (let i = 0; i < 120; i++) {
      svc.updateData({ temperature: 20 + (i % 15) });
    }
    expect(svc.getHistory().length).toBe(100);
  });

  describe('predictSolarEfficiency', () => {
    it('should return ~1.0 for sunny with full light', () => {
      svc.updateData({ weatherCondition: 'sunny', lightIntensity: 1000 });
      const eff = svc.predictSolarEfficiency();
      expect(eff).toBeCloseTo(1.0);
    });

    it('should return lower for cloudy weather', () => {
      svc.updateData({ weatherCondition: 'cloudy', lightIntensity: 500 });
      const eff = svc.predictSolarEfficiency();
      expect(eff).toBeCloseTo(0.25); // 500/1000 * 0.5
    });

    it('should return lowest for rainy weather', () => {
      svc.updateData({ weatherCondition: 'rainy', lightIntensity: 200 });
      const eff = svc.predictSolarEfficiency();
      expect(eff).toBeCloseTo(0.04); // 200/1000 * 0.2
    });

    it('should return 0 for no light', () => {
      svc.updateData({ weatherCondition: 'sunny', lightIntensity: 0 });
      const eff = svc.predictSolarEfficiency();
      expect(eff).toBe(0);
    });
  });
});
