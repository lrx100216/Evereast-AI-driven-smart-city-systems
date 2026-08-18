import { Router, Request, Response } from 'express';
import { jointSim } from '../services/joint/JointSimEngine';

const router = Router();

// ─── Status ──────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  res.json(jointSim.getStations().length > 0
    ? { running: true, stations: jointSim.getStations().length }
    : { running: false }
  );
});

// ─── Charging Stations ───────────────────────────────────────

router.get('/stations', (_req: Request, res: Response) => {
  const stations = jointSim.getStations().map(s => ({
    id: s.id, name: s.name, nameZh: s.nameZh,
    intersectionId: s.intersectionId,
    currentPrice: s.currentPrice,
    basePrice: s.basePrice,
    solarDiscount: s.solarDiscount,
    currentCars: s.currentCars,
    capacity: s.capacity,
    queueLength: s.queueLength,
    totalLoad: s.totalLoad,
    solarPowered: s.solarPowered,
  }));
  res.json({ stations });
});

// ─── Notifications ───────────────────────────────────────────

router.get('/notifications', (_req: Request, res: Response) => {
  res.json({ notifications: jointSim.getNotifications() });
});

export default router;
