import { Router, Request, Response } from 'express';
import { energySim } from '../services/energySimulation';

const router = Router();

router.get('/snapshot', (_req: Request, res: Response) => {
  const snap = energySim.getCurrentSnapshot();
  res.json(snap);
});

router.post('/speed', (req: Request, res: Response) => {
  const { speed } = req.body;
  if (typeof speed !== 'number') {
    res.status(400).json({ error: 'Missing speed (number)' });
    return;
  }
  energySim.setSpeed(speed);
  res.json({ success: true, speed: energySim.getSpeed() });
});

export default router;
