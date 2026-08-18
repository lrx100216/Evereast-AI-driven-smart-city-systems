import { Router, Request, Response } from 'express';
import { TrafficService } from '../services/trafficService';
import { getStore, getTrafficHistory } from '../store';

const router = Router();
const trafficService = new TrafficService();

router.get('/status', (_req: Request, res: Response) => {
  const store = getStore();
  res.json(store.traffic);
});

router.get('/history', (_req: Request, res: Response) => {
  res.json(getTrafficHistory());
});

router.post('/signal/timing', (req: Request, res: Response) => {
  const { intersectionId, greenDuration, redDuration } = req.body;
  trafficService.updateSignalTiming(intersectionId, greenDuration, redDuration);
  res.json({ success: true });
});

export default router;
