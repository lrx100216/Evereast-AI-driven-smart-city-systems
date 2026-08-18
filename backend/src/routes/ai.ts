import { Router, Request, Response } from 'express';
import { getAIAdvice } from '../services/aiService';

const router = Router();

router.get('/advice', async (_req: Request, res: Response) => {
  try {
    const advice = await getAIAdvice();
    res.json(advice);
  } catch (err) {
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

export default router;
