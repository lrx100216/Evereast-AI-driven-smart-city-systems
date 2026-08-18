import { Router, Request, Response } from 'express';
import { cityFoundationService } from '../services/cityFoundationService';
import { trafficSim } from '../services/trafficSimulation';
import { energySim } from '../services/energySimulation';

const router = Router();

/**
 * POST /api/cfm/predict
 *
 * Accepts a city state vector and returns CFM control actions.
 *
 * Body:
 *   trafficState: number[256]  — normalized [0,1] traffic features per intersection
 *   energyState:  number[128]  — normalized [0,1] energy & environment features
 *
 * Response:
 *   trafficSignals: number[11] — phase weights per intersection
 *   batteryCharge:  number     — charge/discharge rate [-1, +1]
 *   solarAngle:     number     — panel angle [0, 180] degrees
 *   inferenceMs:    number     — ONNX inference time
 */
router.post('/predict', async (req: Request, res: Response) => {
  try {
    const { trafficState, energyState } = req.body;

    if (!Array.isArray(trafficState) || trafficState.length !== 256) {
      res.status(400).json({
        error: 'trafficState must be a 256-element array',
        received: trafficState?.length ?? typeof trafficState,
      });
      return;
    }

    if (!Array.isArray(energyState) || energyState.length !== 128) {
      res.status(400).json({
        error: 'energyState must be a 128-element array',
        received: energyState?.length ?? typeof energyState,
      });
      return;
    }

    const result = await cityFoundationService.predict(trafficState, energyState);

    res.json({
      success: true,
      model: cityFoundationService.isLoaded() ? 'transformer' : 'heuristic-mock',
      ...result,
    });
  } catch (err) {
    console.error('[CFM Route] predict error:', err instanceof Error ? err.message : String(err));
    res.status(500).json({
      error: err instanceof Error ? err.message : 'CFM inference failed',
    });
  }
});

/**
 * GET /api/cfm/status
 *
 * Returns model loading status and metadata.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    loaded: cityFoundationService.isLoaded(),
    model: cityFoundationService.isLoaded() ? 'city_foundation.onnx' : 'mock',
  });
});

/**
 * POST /api/cfm/fast-forward
 *
 * Snapshots current traffic + energy simulation state, runs CFM inference,
 * and returns the 13-dim control predictions WITHOUT advancing the physics sim.
 * This is the "fast mode" — 3ms vs 94ms for a full simulation step.
 */
router.post('/fast-forward', async (_req: Request, res: Response) => {
  try {
    // Snapshot current simulation state
    const tSnap = trafficSim.getCurrentSnapshot();
    const eSnap = energySim.getCurrentSnapshot();

    // Build 256-dim traffic state
    const trafficState: number[] = [];
    const allIsecs = tSnap.zones.flatMap(z => z.intersections);
    for (let i = 0; i < 16; i++) {
      const isec = allIsecs[i];
      if (isec) {
        const dirs = ['N', 'S', 'E', 'W'] as const;
        for (const d of dirs) {
          const lane = isec.lanes.find(l => l.direction === d);
          trafficState.push(lane ? Math.min(1, lane.carCount / 30) : 0);
        }
        for (const d of dirs) {
          const lane = isec.lanes.find(l => l.direction === d);
          trafficState.push(lane ? Math.min(1, lane.avgSpeed / 60) : 0);
        }
        for (const d of dirs) {
          const lane = isec.lanes.find(l => l.direction === d);
          trafficState.push(lane ? Math.min(1, lane.congestionLevel / 100) : 0);
        }
        const avgCong = isec.lanes.reduce((s, l) => s + l.congestionLevel, 0) / Math.max(1, isec.lanes.length);
        trafficState.push(Math.min(1, avgCong / 100));
        trafficState.push(Math.min(1, avgCong * 0.95 / 100));
        trafficState.push(Math.min(1, avgCong * 0.90 / 100));
        trafficState.push(Math.min(1, avgCong * 0.85 / 100));
      } else {
        for (let j = 0; j < 16; j++) trafficState.push(0);
      }
    }

    // Build 128-dim energy state
    const energyState: number[] = [];
    const simHour = eSnap.simHour + eSnap.simMinute / 60;
    energyState.push(Math.sin(2 * Math.PI * simHour / 24));
    energyState.push(Math.cos(2 * Math.PI * simHour / 24));
    energyState.push(Math.sin(2 * Math.PI * simHour / 24) * 0.5 + 0.5);
    energyState.push(Math.cos(4 * Math.PI * simHour / 24) * 0.5 + 0.5);
    const solarRatio = eSnap.grid.totalSupply / 380;
    energyState.push(Math.min(1, solarRatio));
    energyState.push(Math.min(1, solarRatio * 0.8));
    energyState.push(Math.min(1, solarRatio * 0.6));
    energyState.push(Math.min(1, solarRatio * 0.9));
    energyState.push(0.5); energyState.push(Math.min(1, (25 + Math.sin(2*Math.PI*simHour/24)*8)/50));
    energyState.push(0.6);
    energyState.push(eSnap.battery.soc / 100);
    energyState.push(eSnap.grid.price / 1.17);
    for (const z of eSnap.zones) energyState.push(Math.min(1, z.load / z.baseLoad));
    while (energyState.length < 19) energyState.push(0);
    for (const p of eSnap.plants) energyState.push(Math.min(1, p.output / p.capacity));
    while (energyState.length < 128) energyState.push(0);

    const result = await cityFoundationService.predict(
      trafficState.slice(0, 256),
      energyState.slice(0, 128),
    );

    res.json({
      success: true,
      model: cityFoundationService.isLoaded() ? 'transformer' : 'heuristic-mock',
      simTime: tSnap.simTime,
      simHour: eSnap.simHour,
      simMinute: eSnap.simMinute,
      vehicleCount: allIsecs.reduce((s, i) => s + i.lanes.reduce((s2, l) => s2 + l.carCount, 0), 0),
      ...result,
    });
  } catch (err) {
    console.error('[CFM Route] fast-forward error:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: err instanceof Error ? err.message : 'CFM fast-forward failed' });
  }
});

export default router;
