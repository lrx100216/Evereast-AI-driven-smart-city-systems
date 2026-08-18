import { Router, Request, Response } from 'express';
import { whatIfEngine } from '../services/whatIf/WhatIfEngine';

const router = Router();

// ─── Scenarios ───────────────────────────────────────────────

router.get('/scenarios', (_req: Request, res: Response) => {
  res.json({ scenarios: whatIfEngine.getScenarios() });
});

// ─── Run ─────────────────────────────────────────────────────

router.post('/run', async (req: Request, res: Response) => {
  try {
    const { scenarioId, runs } = req.body;
    if (!scenarioId) {
      res.status(400).json({ error: 'scenarioId required' });
      return;
    }

    // Run in background
    whatIfEngine.run(scenarioId, runs || 100).catch(err => {
      console.error('[WhatIf] Run error:', err instanceof Error ? err.message : "Unknown error");
    });

    res.json({ success: true, message: 'Scenario started', scenarioId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── Stop ────────────────────────────────────────────────────

router.post('/stop', (_req: Request, res: Response) => {
  whatIfEngine.stop();
  res.json({ success: true });
});

// ─── Status ──────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  res.json({ status: whatIfEngine.getStatus() });
});

// ─── Results ─────────────────────────────────────────────────

router.get('/results/:scenarioId', (req: Request, res: Response) => {
  const result = whatIfEngine.getResult(req.params.scenarioId);
  if (!result) {
    res.status(404).json({ error: 'Result not found' });
    return;
  }
  res.json(result);
});

router.get('/results', (_req: Request, res: Response) => {
  res.json({ results: whatIfEngine.getAllResults() });
});

export default router;
