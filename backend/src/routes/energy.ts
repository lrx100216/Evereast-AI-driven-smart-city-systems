import { Router, Request, Response } from 'express';
import { getStore, updateEnergy, getEnergyHistory } from '../store';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  const store = getStore();
  res.json(store.energy);
});

router.get('/history', (_req: Request, res: Response) => {
  res.json(getEnergyHistory());
});

router.post('/panel/angle', (req: Request, res: Response) => {
  const { angle } = req.body;
  updateEnergy({ panelAngle: Math.max(0, Math.min(180, angle)) });
  res.json({ success: true });
});

export default router;
