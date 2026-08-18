import { Router, Request, Response } from 'express';
import { generativeEngine } from '../services/generative/GenerativeEngine';

const router = Router();

router.post('/run', async (req: Request, res: Response) => {
  try {
    const raw = req.body?.scenarios;
    const n = typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(200, Math.max(10, raw))
      : 100;
    generativeEngine.generate(n).catch(err => {
      console.error('[Gen] Error:', err instanceof Error ? err.message : "Unknown error");
    });
    res.json({ success: true, message: `Generating ${n} scenarios` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post('/stop', (_req: Request, res: Response) => {
  generativeEngine.stop();
  res.json({ success: true });
});

router.get('/status', (_req: Request, res: Response) => {
  res.json({ status: generativeEngine.getStatus() });
});

router.get('/result', (_req: Request, res: Response) => {
  const r = generativeEngine.getLastResult();
  if (!r) { res.status(404).json({ error: 'No results yet' }); return; }
  // Return envelope + top 5 scenarios only (keep response light)
  res.json({
    timestamp: r.timestamp,
    totalScenarios: r.totalScenarios,
    durationMs: r.durationMs,
    envelope: r.envelope,
    top5: r.top5,
  });
});

export default router;
