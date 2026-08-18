import { describe, it, expect } from 'vitest';
import {
  flattenCityState, parseModelOutput,
  type CityGlobalState, type CityGlobalActions,
} from './types';

function makeState(overrides?: Partial<CityGlobalState>): CityGlobalState {
  const dir = { N: 0, S: 0, E: 0, W: 0 };
  const base: CityGlobalState = {
    time: {
      timestamp: '2026-05-24T08:30:00Z', simTime: '08:30:00',
      simHour: 8, simMinute: 30, dayOfWeek: 6, month: 5, dayOfMonth: 24,
      isRushHour: true, timeOfDay: 'morning',
    },
    traffic: [],
    energy: {
      batterySoc: 62, batteryTemperature: 31, batteryDegradation: 0.03,
      batteryChargePower: -25, batteryMaxCharge: 150, batteryMaxDischarge: 150,
      gridPrice: 1.17, peakType: 'peak', gridImport: 850, gridExport: 0,
      totalLoad: 1200, totalSupply: 380, solarOutput: 280,
      zoneLoads: {}, plantOutputs: {}, plantOnline: {},
      carbonTotalKg: 4800, carbonIntensity: 0.45, carbonAvoidedKg: 1500,
      lyapunovQ: -12.5, lyapunovDrift: 0.34, fsmState: 'normal',
    },
    environment: {
      temperature: 31, humidity: 72, lightIntensity: 820,
      weatherCondition: 'sunny', cloudCover: 0.25, windSpeed: 12,
      precipitation: 0, weatherCode: 1, solarFactor: 0.75, solarEfficiency: 0.7,
      hardwareTemperature: 30.5, hardwareHumidity: 68, hardwareLdrValue: 780,
    },
  };
  if (overrides) Object.assign(base, overrides);
  return base;
}

describe('flattenCityState', () => {
  it('returns exactly 384 dimensions', () => {
    const result = flattenCityState(makeState());
    expect(result.length).toBe(384);
  });

  it('handles empty state without crashing', () => {
    const result = flattenCityState(makeState());
    expect(result.length).toBe(384);
    expect(result.every(v => !isNaN(v))).toBe(true);
  });

  it('encodes traffic correctly in first 256 dims', () => {
    const state = makeState();
    state.traffic = [{
      id: 'tech-1', queueByDir: { N: 12, S: 8, E: 25, W: 18 },
      arrivalRateByDir: { N: 0, S: 0, E: 0, W: 0 },
      speedByDir: { N: 35, S: 42, E: 18, W: 22 },
      congestionByDir: { N: 40, S: 30, E: 75, W: 55 },
      waitTimeByDir: { N: 45, S: 20, E: 120, W: 80 },
      currentPhase: 0, phaseRemaining: 22,
      signalColorByDir: { N: 'green', S: 'green', E: 'red', W: 'red' },
      spilloverIndex: 0.3, pedestrianCount: 8, zoneType: 'tech_park',
    }];
    const result = flattenCityState(state);
    // N-queue: 12/30 = 0.4
    expect(result[0]).toBeCloseTo(12 / 30, 5);
    // N-speed: 35/60 = 0.583
    expect(result[4]).toBeCloseTo(35 / 60, 5);
    // N-congestion: 40/100 = 0.4
    expect(result[8]).toBeCloseTo(40 / 100, 5);
  });

  it('fills energy/env dims starting at index 256', () => {
    const state = makeState();
    const result = flattenCityState(state);
    // Solar output / 400
    expect(result[268]).toBeCloseTo(Math.min(1, 280 / 400), 5);
  });

  it('has time frequency features in the energy section', () => {
    const state = makeState();
    const result = flattenCityState(state);
    const h = 8 + 30 / 60;
    expect(result[256]).toBeCloseTo(Math.sin(2 * Math.PI * h / 24), 5);
    expect(result[257]).toBeCloseTo(Math.cos(2 * Math.PI * h / 24), 5);
  });
});

describe('parseModelOutput', () => {
  it('parses 13-dim output into structured actions', () => {
    const out = [0.45, 0.28, 0.62, 0.15, 0.88, 0.50, 0.33, 0.71, 0.40, 0.55, 0.20, -0.35, 142.5];
    const actions = parseModelOutput(out);
    expect(actions.trafficSignals.length).toBe(11);
    expect(actions.batteryChargeRate).toBe(-0.35);
    expect(actions.solarPanelAngle).toBe(142.5);
  });

  it('maps weight 0.45 to phase 1', () => {
    const out = [0.45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90];
    const actions = parseModelOutput(out);
    expect(actions.trafficSignals[0].targetPhase).toBe(1);
  });

  it('maps weight 0.88 to phase 3', () => {
    const out = [0, 0, 0, 0, 0.88, 0, 0, 0, 0, 0, 0, 0, 90];
    const actions = parseModelOutput(out);
    expect(actions.trafficSignals[4].targetPhase).toBe(3);
  });

  it('clamps outliers', () => {
    const out = [-999, 999, 0, 0, 0, 0, 0, 0, 0, 0, 0, -99, 9999];
    const actions = parseModelOutput(out);
    // Signal clamped to [0.01, 0.99] → phase within [0,3]
    expect(actions.trafficSignals[0].targetPhase).toBeGreaterThanOrEqual(0);
    expect(actions.trafficSignals[0].targetPhase).toBeLessThanOrEqual(3);
    expect(actions.trafficSignals[1].targetPhase).toBeGreaterThanOrEqual(0);
    expect(actions.trafficSignals[1].targetPhase).toBeLessThanOrEqual(3);
    // Battery clamped to [-1, 1]
    expect(actions.batteryChargeRate).toBe(-1);
    // Solar clamped to [0, 180]
    expect(actions.solarPanelAngle).toBe(180);
  });

  it('throws on insufficient output length', () => {
    expect(() => parseModelOutput([0.5])).toThrow('expected at least 13');
    expect(() => parseModelOutput([])).toThrow('expected at least 13');
    expect(() => parseModelOutput(null as any)).toThrow('expected at least 13');
  });

  it('uses custom timestamp', () => {
    const out = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 90];
    const actions = parseModelOutput(out, '2026-06-01T12:00:00Z');
    expect(actions.timestamp).toBe('2026-06-01T12:00:00Z');
  });

  it('uses custom junction IDs', () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11'];
    const out = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 90];
    const actions = parseModelOutput(out, undefined, ids);
    expect(actions.trafficSignals[0].junctionId).toBe('c1');
    expect(actions.trafficSignals[10].junctionId).toBe('c11');
  });

  it('handles Float32Array input', () => {
    const out = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.3, 45]);
    const actions = parseModelOutput(out);
    expect(actions.batteryChargeRate).toBe(0.3);
    expect(actions.solarPanelAngle).toBe(45);
  });

  it('green duration maps correctly from weight', () => {
    // weight=0.5 → green = 5 + 0.5*85 = 47.5 → 48
    const out = [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90];
    const actions = parseModelOutput(out);
    expect(actions.trafficSignals[0].greenDuration).toBe(48);
  });
});
