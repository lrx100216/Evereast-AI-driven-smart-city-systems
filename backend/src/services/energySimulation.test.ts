import { describe, it, expect } from 'vitest';

describe('energySimulation', () => {
  it('should provide a snapshot with all sections', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();

    expect(snap).toBeDefined();
    expect(snap.timestamp).toBeDefined();
    expect(snap.simTime).toBeDefined();
    expect(snap.simHour).toBeDefined();
    expect(snap.simMinute).toBeDefined();
  });

  it('should have 5 energy zones', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();
    expect(snap.zones.length).toBe(5);
  });

  it('should have battery data', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();

    expect(snap.battery).toBeDefined();
    expect(snap.battery.soc).toBeGreaterThanOrEqual(0);
    expect(snap.battery.soc).toBeLessThanOrEqual(100);
    expect(snap.battery.capacity).toBe(500);
  });

  it('should have grid data with pricing', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();

    expect(snap.grid).toBeDefined();
    expect(snap.grid.price).toBeGreaterThan(0);
    expect(['valley', 'shoulder', 'peak']).toContain(snap.grid.peakType);
    expect(snap.grid.totalLoad).toBeGreaterThan(0);
  });

  it('should have 5 power plants', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();
    expect(snap.plants.length).toBe(5);

    const plantIds = snap.plants.map((p: any) => p.id);
    expect(plantIds).toContain('daya-bay');
    expect(plantIds).toContain('guangming');
  });

  it('should have lyapunov optimization metrics', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();

    expect(snap.lyapunov).toBeDefined();
    expect(typeof snap.lyapunov.Q).toBe('number');
    expect(snap.lyapunov.V).toBe(200);
    expect(typeof snap.lyapunov.drift).toBe('number');
    expect(typeof snap.lyapunov.penalty).toBe('number');
  });

  it('should have FSM state', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();

    expect(snap.fsm).toBeDefined();
    expect(snap.fsm.state).toBeDefined();
    expect(snap.fsm.reason).toBeDefined();
  });

  it('should start at 6:00', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();
    expect(snap.simHour).toBe(6);
    expect(snap.simMinute).toBe(0);
  });

  it('should have zone load data with positive values', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();

    for (const zone of snap.zones) {
      expect(zone.load).toBeGreaterThan(0);
      expect(zone.baseLoad).toBeGreaterThan(0);
      expect(zone.hourlyFactor).toBeGreaterThanOrEqual(0);
    }
  });

  it('nuclear plant (Daya Bay) should always be online', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();
    const dayaBay = snap.plants.find((p: any) => p.id === 'daya-bay');

    expect(dayaBay.online).toBe(true);
    expect(dayaBay.output).toBeGreaterThan(0);
  });

  it('buildingLights should be between 0 and 1', async () => {
    const { energySim } = await import('./energySimulation');
    const snap = energySim.getCurrentSnapshot();
    expect(snap.buildingLights).toBeGreaterThanOrEqual(0);
    expect(snap.buildingLights).toBeLessThanOrEqual(1);
  });

  it('should start and stop without error', async () => {
    const { energySim } = await import('./energySimulation');
    expect(() => energySim.start()).not.toThrow();
    energySim.stop();
  });

  it('getPeakType should return correct Shenzhen TOU periods', async () => {
    const mod = await import('./energySimulation');

    expect(mod.getPeakType(3, 0)).toBe('valley');   // 03:00深夜
    expect(mod.getPeakType(6, 30)).toBe('valley');   // 06:30
    expect(mod.getPeakType(10, 0)).toBe('peak');     // 10:00
    expect(mod.getPeakType(15, 0)).toBe('peak');     // 15:00
    expect(mod.getPeakType(20, 0)).toBe('peak');     // 20:00
    expect(mod.getPeakType(8, 0)).toBe('shoulder');  // 08:00
    expect(mod.getPeakType(22, 0)).toBe('shoulder'); // 22:00
  });
});
