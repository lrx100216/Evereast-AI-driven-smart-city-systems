import { Router, Request, Response } from 'express';
import { getStore, getWeatherHistory } from '../store';

const router = Router();

router.get('/current', (_req: Request, res: Response) => {
  const store = getStore();
  res.json(store.weather);
});

router.get('/history', (_req: Request, res: Response) => {
  res.json(getWeatherHistory());
});

export default router;
