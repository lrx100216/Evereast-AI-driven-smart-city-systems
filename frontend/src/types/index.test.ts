import { describe, it, expect } from 'vitest';
// Type-only import to verify the file can be imported
import type { TrafficData, EnergyData, WeatherData, HardwareData } from './index';

describe('types', () => {
  it('TrafficData should have required fields', () => {
    const data: TrafficData = {
      carCount: 10,
      pedestrianCount: 5,
      congestionLevel: 45,
      averageSpeed: 30,
      timestamp: new Date().toISOString(),
    };
    expect(data.carCount).toBe(10);
    expect(data.congestionLevel).toBe(45);
  });

  it('EnergyData should have required fields', () => {
    const data: EnergyData = {
      solarVoltage: 4.2,
      batteryLevel: 67,
      panelAngle: 90,
      powerOutput: 3.4,
      consumption: 1.2,
      timestamp: new Date().toISOString(),
    };
    expect(data.batteryLevel).toBe(67);
  });

  it('WeatherData should have required fields', () => {
    const data: WeatherData = {
      temperature: 26.5,
      humidity: 62,
      lightIntensity: 750,
      weatherCondition: 'sunny',
      timestamp: new Date().toISOString(),
    };
    expect(data.weatherCondition).toBe('sunny');
  });

  it('HardwareData should discriminate by type', () => {
    const traffic: HardwareData = {
      type: 'traffic',
      carCount: 10,
      pedestrianCount: 5,
      congestionLevel: 45,
      averageSpeed: 30,
      timestamp: '',
    };
    const energy: HardwareData = {
      type: 'energy',
      solarVoltage: 4.2,
      batteryLevel: 67,
      panelAngle: 90,
      powerOutput: 3.4,
      consumption: 1.2,
      timestamp: '',
    };
    const weather: HardwareData = {
      type: 'weather',
      temperature: 26.5,
      humidity: 62,
      lightIntensity: 750,
      weatherCondition: 'sunny',
      timestamp: '',
    };

    expect(traffic.type).toBe('traffic');
    expect(energy.type).toBe('energy');
    expect(weather.type).toBe('weather');
  });
});
