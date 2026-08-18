import { describe, it, expect } from 'vitest';

// Note: store module has module-level state that persists across tests.
// Each test verifies relative behavior rather than depending on absolute state.

describe('store', () => {
  it('should have default values', async () => {
    const store = await import('./store');
    const state = store.getStore();

    expect(state.traffic.carCount).toBe(12);
    expect(state.traffic.pedestrianCount).toBe(5);
    expect(state.traffic.congestionLevel).toBe(45);
    expect(state.traffic.averageSpeed).toBe(32);

    expect(state.energy.solarVoltage).toBe(4.2);
    expect(state.energy.batteryLevel).toBe(67);
    expect(state.energy.panelAngle).toBe(90);
    expect(state.energy.powerOutput).toBe(3.4);
    expect(state.energy.consumption).toBe(1.2);

    expect(state.weather.temperature).toBe(26.5);
    expect(state.weather.humidity).toBe(62);
    expect(state.weather.lightIntensity).toBe(750);
    expect(state.weather.weatherCondition).toBe('sunny');
  });

  it('should update traffic data', async () => {
    const store = await import('./store');
    store.updateTraffic({ carCount: 25, congestionLevel: 80 });

    const state = store.getStore();
    expect(state.traffic.carCount).toBe(25);
    expect(state.traffic.congestionLevel).toBe(80);
    expect(state.traffic.pedestrianCount).toBe(5); // unchanged

    const ts = new Date(state.traffic.timestamp).getTime();
    expect(Date.now() - ts).toBeLessThan(5000);
  });

  it('should update energy data', async () => {
    const store = await import('./store');
    store.updateEnergy({ batteryLevel: 50, panelAngle: 45 });

    const state = store.getStore();
    expect(state.energy.batteryLevel).toBe(50);
    expect(state.energy.panelAngle).toBe(45);
    expect(state.energy.solarVoltage).toBe(4.2);
  });

  it('should update weather data', async () => {
    const store = await import('./store');
    store.updateWeather({ temperature: 30, weatherCondition: 'cloudy' });

    const state = store.getStore();
    expect(state.weather.temperature).toBe(30);
    expect(state.weather.weatherCondition).toBe('cloudy');
    expect(state.weather.humidity).toBe(62);
  });

  it('should push to history on update and cap at 200', async () => {
    const store = await import('./store');

    // Record current history length
    const before = store.getTrafficHistory().length;

    store.updateTraffic({ carCount: 20 });
    expect(store.getTrafficHistory().length).toBe(before + 1);

    store.updateTraffic({ carCount: 30 });
    expect(store.getTrafficHistory().length).toBe(before + 2);
  });

  it('should cap history at MAX_HISTORY', async () => {
    const store = await import('./store');
    const currentLen = store.getTrafficHistory().length;
    const remaining = 200 - currentLen;

    // Fill to exceed MAX_HISTORY
    for (let i = 0; i < remaining + 20; i++) {
      store.updateTraffic({ carCount: i % 50 });
    }

    expect(store.getTrafficHistory().length).toBeLessThanOrEqual(200);
  });
});
