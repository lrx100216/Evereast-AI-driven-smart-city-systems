import { Router, Request, Response } from 'express';
import { trafficSim, Direction } from '../services/trafficSimulation';

const router = Router();

router.get('/snapshot', (_req: Request, res: Response) => {
  res.json(trafficSim.getCurrentSnapshot());
});

router.post('/signal/cycle', (req: Request, res: Response) => {
  const { intersectionId, greenDuration, direction } = req.body;
  if (!intersectionId || typeof greenDuration !== 'number') {
    res.status(400).json({ error: 'Missing intersectionId or greenDuration' });
    return;
  }

  const validDirs: Direction[] = ['N', 'S', 'E', 'W'];
  const dir: Direction | undefined = direction !== undefined
    ? (validDirs.includes(direction) ? direction : undefined)
    : undefined;

  // "main" = apply to all intersections
  if (intersectionId === 'main') {
    const allIds = trafficSim.getIntersectionIds();
    for (const id of allIds) {
      trafficSim.setSignalCycle(id, greenDuration, dir);
    }
    res.json({ success: true, intersectionId: 'all', count: allIds.length, greenDuration });
    return;
  }

  trafficSim.setSignalCycle(intersectionId, greenDuration, dir);

  const dirLabel = dir || 'all';
  res.json({ success: true, intersectionId, direction: dirLabel, greenDuration });
});

router.post('/speed', (req: Request, res: Response) => {
  const { speed } = req.body;
  if (typeof speed !== 'number') {
    res.status(400).json({ error: 'Missing speed (number)' });
    return;
  }
  trafficSim.setSpeed(speed);
  res.json({ success: true, speed: trafficSim.getSpeed() });
});

export default router;
