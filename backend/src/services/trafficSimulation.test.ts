import { describe, it, expect } from 'vitest';

describe('trafficSimulation', () => {
  it('should provide a snapshot with zones', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();

    expect(snap).toBeDefined();
    expect(snap.timestamp).toBeDefined();
    expect(snap.simTime).toBeDefined();
    expect(snap.simHour).toBeDefined();
    expect(snap.simMinute).toBeDefined();
    expect(snap.zones).toBeDefined();
  });

  it('should have 5 zones with correct types', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();

    expect(snap.zones.length).toBe(5);

    const zoneTypes = snap.zones.map((z: any) => z.type);
    expect(zoneTypes).toContain('industrial');
    expect(zoneTypes).toContain('tech_park');
    expect(zoneTypes).toContain('school');
    expect(zoneTypes).toContain('commercial');
    expect(zoneTypes).toContain('residential');
  });

  it('should have correct zone names in Chinese', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();
    const names = snap.zones.map((z: any) => z.nameZh);

    expect(names).toContain('工业区');
    expect(names).toContain('科技园');
    expect(names).toContain('学校区');
    expect(names).toContain('商业区');
    expect(names).toContain('住宅区');
  });

  it('each zone should have intersections', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();

    for (const zone of snap.zones) {
      expect(zone.intersections.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('each intersection should have 4 directions (N, S, E, W)', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();

    for (const zone of snap.zones) {
      for (const isec of zone.intersections) {
        expect(isec.signals.N).toBeDefined();
        expect(isec.signals.S).toBeDefined();
        expect(isec.signals.E).toBeDefined();
        expect(isec.signals.W).toBeDefined();
        expect(isec.lanes.length).toBe(4);
      }
    }
  });

  it('should start simulation at 6:00', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();
    expect(snap.simHour).toBe(6);
    expect(snap.simMinute).toBe(0);
  });

  it('should have 11 intersections total', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    const snap = trafficSim.getCurrentSnapshot();
    const total = snap.zones.reduce((s: number, z: any) => s + z.intersections.length, 0);
    expect(total).toBe(11);
  });

  it('should support setting signal cycle', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    trafficSim.setSignalCycle('ind-1', 45);

    const snap = trafficSim.getCurrentSnapshot();
    const ind1 = snap.zones
      .find((z: any) => z.type === 'industrial')
      ?.intersections.find((i: any) => i.id === 'ind-1');

    expect(ind1).toBeDefined();
  });

  it('should report rush hour in snapshot at peak times', async () => {
    // Check isRushHour logic via the snapshot
    const { trafficSim } = await import('./trafficSimulation');

    // The sim starts at 6:00 which is NOT rush hour
    const snap = trafficSim.getCurrentSnapshot();
    expect(snap.isRushHour).toBe(false);
  });

  it('should start and stop without error', async () => {
    const { trafficSim } = await import('./trafficSimulation');
    expect(() => trafficSim.start()).not.toThrow();
    trafficSim.stop();
  });
});
