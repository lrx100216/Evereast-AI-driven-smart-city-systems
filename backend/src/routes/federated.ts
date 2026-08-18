import { Router, Request, Response } from 'express';
import { federatedEngine } from '../services/federated/FederatedEngine';

const router = Router();

// ─── Training ────────────────────────────────────────────────

router.post('/train/start', async (req: Request, res: Response) => {
  try {
    const rounds = req.body?.rounds || undefined;
    federatedEngine.train(rounds).catch(err => {
      console.error('[FL] Training error:', err instanceof Error ? err.message : "Unknown error");
    });
    res.json({ success: true, message: 'Federated training started' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post('/train/stop', (_req: Request, res: Response) => {
  federatedEngine.stop();
  res.json({ success: true });
});

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: federatedEngine.getStatus(),
    privacy: federatedEngine.getPrivacyBudget(),
    config: federatedEngine.getConfig(),
  });
});

// ─── Privacy ─────────────────────────────────────────────────

router.post('/privacy', (req: Request, res: Response) => {
  const { noiseMultiplier } = req.body;
  if (typeof noiseMultiplier !== 'number' || noiseMultiplier < 0.1 || noiseMultiplier > 10) {
    res.status(400).json({ error: 'noiseMultiplier must be between 0.1 and 10' });
    return;
  }
  federatedEngine.setNoiseMultiplier(noiseMultiplier);
  res.json({ success: true, noiseMultiplier });
});

// ─── Models ──────────────────────────────────────────────────

router.get('/models', (_req: Request, res: Response) => {
  res.json({
    global: federatedEngine.getGlobalWeights().zoneId,
    zones: federatedEngine.getZoneModels().map(m => m.zoneId),
    privacy: federatedEngine.getPrivacyBudget(),
  });
});

export default router;
