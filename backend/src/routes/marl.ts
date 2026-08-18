import { Router, Request, Response } from 'express';
import { marlManager } from '../services/marl/MarlManager';
import { trafficSim } from '../services/trafficSimulation';
import type { SignalMode } from '../services/marl/types';
import fs from 'fs';
import path from 'path';

const router = Router();

const MODELS_DIR = path.resolve(process.cwd(), 'data', 'marl');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// ─── Training ───────────────────────────────────────────────

router.post('/train/start', async (req: Request, res: Response) => {
  try {
    const intersectionIds = trafficSim.getIntersectionIds();
    if (intersectionIds.length === 0) {
      res.status(500).json({ error: 'No intersections available' });
      return;
    }

    const episodes = req.body?.episodes || undefined;

    // Don't await — training runs in background
    marlManager.train(intersectionIds, episodes).catch(err => {
      console.error('[MARL] Training error:', err instanceof Error ? err.message : "Unknown error");
    });

    res.json({ success: true, message: 'Training started', intersectionCount: intersectionIds.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post('/train/stop', (_req: Request, res: Response) => {
  marlManager.stopTraining();
  res.json({ success: true, message: 'Training stop requested' });
});

router.get('/train/status', (_req: Request, res: Response) => {
  res.json(marlManager.getTrainingState());
});

// ─── Mode ───────────────────────────────────────────────────

router.post('/mode', (req: Request, res: Response) => {
  const { mode } = req.body;
  if (!mode || !['fixed', 'marl'].includes(mode)) {
    res.status(400).json({ error: 'mode must be "fixed" or "marl"' });
    return;
  }
  marlManager.setMode(mode as SignalMode);
  res.json({ success: true, mode });
});

router.get('/mode', (_req: Request, res: Response) => {
  res.json({ mode: marlManager.getMode() });
});

// ─── Agent Info ─────────────────────────────────────────────

router.get('/agents', (_req: Request, res: Response) => {
  const epsilons = marlManager.getAgentEpsilons();
  res.json({
    agentCount: Object.keys(epsilons).length,
    epsilons,
  });
});

router.get('/agents/:id/qvalues', (req: Request, res: Response) => {
  const qValues = marlManager.getAgentQValues(trafficSim, req.params.id);
  if (!qValues) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ intersectionId: req.params.id, qValues });
});

// ─── Model Persistence ──────────────────────────────────────

router.post('/model/save', (req: Request, res: Response) => {
  try {
    const model = marlManager.saveModel();
    const rawName = req.body?.filename || `marl-model-${Date.now()}.json`;
    const filename = path.basename(rawName);
    const filepath = path.join(MODELS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(model, null, 2), 'utf-8');
    res.json({ success: true, filename, path: filepath });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post('/model/load', (req: Request, res: Response) => {
  try {
    const rawName = req.body?.filename;
    if (!rawName) {
      res.status(400).json({ error: 'filename required' });
      return;
    }
    const filename = path.basename(rawName);
    const filepath = path.join(MODELS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      res.status(404).json({ error: 'Model file not found' });
      return;
    }
    const raw = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw);
    marlManager.loadModel(data);
    res.json({ success: true, agentsLoaded: data.agents?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get('/model/list', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(MODELS_DIR)) {
      res.json({ models: [] });
      return;
    }
    const files = fs.readdirSync(MODELS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(MODELS_DIR, f));
        return { filename: f, size: stat.size, modified: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ models: files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── Configuration ──────────────────────────────────────────

router.get('/config', (_req: Request, res: Response) => {
  const state = marlManager.getTrainingState();
  res.json({
    agentCount: state.agentCount,
    mode: state.mode,
    status: state.status,
    currentEpisode: state.currentEpisode,
    totalEpisodes: state.totalEpisodes,
  });
});

export default router;
