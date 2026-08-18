/**
 * Server bootstrap �� wires simulation engines, database, weather polling,
 * WebSocket callbacks, and graceful shutdown.
 * Kept separate from createApp so tests can create a bare app.
 */
import type { Server as HttpServer } from 'http';
import type { SocketIOServer } from 'socket.io';
import { trafficSim } from '../services/trafficSimulation';
import { energySim } from '../services/energySimulation';
import { marlManager } from '../services/marl/MarlManager';
import { whatIfEngine } from '../services/whatIf/WhatIfEngine';
import { jointSim } from '../services/joint/JointSimEngine';
import { federatedEngine } from '../services/federated/FederatedEngine';
import { generativeEngine } from '../services/generative/GenerativeEngine';
import { cityFoundationService } from '../services/cityFoundationService';
import { ArbitrageCoordinator } from '../services/arbitrage/ArbitrageCoordinator';
import {
  getDb, closeDb, insertTrafficSnapshot, insertEnergySnapshot,
  insertWeatherSnapshot, pruneSnapshots, dbSize,
} from '../services/database';
import { createApp } from './createApp';

export interface BootstrapedApp {
  server: HttpServer;
  shutdown: () => void;
}

export function startServer(): BootstrapedApp {
  const { server, io } = createApp();

  // Initialize SQLite persistence
  getDb();
  console.log(`[Database] SQLite ready (${(dbSize() / 1024).toFixed(1)} KB)`);

  const PORT = process.env.PORT || 3001;
  server.listen(Number(PORT), () => {
    console.log(`[Smart City] Backend running on http://localhost:${PORT}`);
  });

  // Initialize City Foundation Model (ONNX Transformer)
  cityFoundationService.initialize().catch((err: unknown) => {
    console.warn('[CFM] Initialization failed, falling back to heuristic:',
      err instanceof Error ? err.message : String(err));
  });

  // ���� Traffic simulation ������������������������������������������������������������������������
  trafficSim.start();
  // (onTick is wired below after ArbitrageCoordinator setup)

  // ���� Energy simulation ��������������������������������������������������������������������������
  energySim.onTick((snapshot) => {
    io.emit('energy:sim', snapshot);
    try {
      insertEnergySnapshot(snapshot as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[DB] insertEnergySnapshot failed:',
        err instanceof Error ? err.message : String(err));
    }
  });
  energySim.start();

  // ���� Engine progress callbacks ����������������������������������������������������������
  const marlCb = (state: unknown) => { io.emit('marl:progress', state); };
  marlManager.onProgress(marlCb);

  const generativeCb = (state: unknown) => { io.emit('generative:progress', state); };
  generativeEngine.onProgress(generativeCb);

  const federatedCb = (state: unknown) => { io.emit('federated:progress', state); };
  federatedEngine.onProgress(federatedCb);

  const jointCb = (snapshot: unknown) => { io.emit('joint:snapshot', snapshot); };
  jointSim.onTick(jointCb);
  jointSim.start();

  const whatIfCb = (state: unknown) => { io.emit('whatif:progress', state); };
  whatIfEngine.onProgress(whatIfCb);

  // 🔄 Cross-Domain Causal Arbitrage Coordinator ����������������
  const arbitrageCoordinator = new ArbitrageCoordinator({
    getCloudCover: () => {
      try { return (energySim as any).cloudFactor ?? 0.3; } catch { return 0.3; }
    },
    getSolarEfficiency: () => {
      try { return (energySim as any).getLatestState?.()?.solarOutput ? 0.7 : 0.5; } catch { return 0.5; }
    },
    getTemperature: () => {
      try { return (energySim as any).getLatestState?.()?.batteryTemperature ?? 25; } catch { return 25; }
    },
    getTotalLoad: () => {
      try { return (energySim as any).getLatestState?.()?.totalLoad ?? 5000; } catch { return 5000; }
    },
    getPeakType: () => {
      try { return (energySim as any).getLatestState?.()?.peakType ?? 'valley'; } catch { return 'valley'; }
    },
    getBatterySoc: () => {
      try { return (energySim as any).getLatestState?.()?.batterySoc ?? 50; } catch { return 50; }
    },
    getStationLoads: () => new Map<number, number>(),
    getStationCongestion: () => new Map<number, number>(),
    getActiveVehicleCount: () => {
      try { return (trafficSim as any).getActiveVehicleCount?.() ?? 100; } catch { return 100; }
    },
    getPerZoneRatios: () => ({}),
    getIntersectionCongestions: () => [],
  });

  // Wire arbitrage tick into traffic sim callback
  trafficSim.onTick((snapshot: unknown) => {
    io.emit('traffic:sim', snapshot);
    io.emit('traffic:3d', trafficSim.get3DSnapshot());
    marlManager.onSimulationTick(trafficSim);
    try {
      insertTrafficSnapshot(snapshot as Record<string, unknown>);
    } catch (err) {
      console.warn('[DB] insertTrafficSnapshot failed:',
        err instanceof Error ? err.message : String(err));
    }

    // Run arbitrage tick
    try {
      const arbSnapshot = arbitrageCoordinator.tick();
      if (arbSnapshot) {
        io.emit('arbitrage:snapshot', arbSnapshot);
        // Feed grid stress into MARL reward shaping
        marlManager.setGridStressFactor(arbSnapshot.gridStress.sectorA.avgStress);
      }
    } catch (err) {
      // Silent fail — arbitrage is optional enhancement
    }
  });

  // Socket.IO arbitrage handlers
  io.on('connection', (socket) => {
    socket.on('arbitrage:get_state', () => {
      const snap = arbitrageCoordinator.tick();
      if (snap) socket.emit('arbitrage:snapshot', snap);
    });
    socket.on('arbitrage:toggle', ({ active }: { active: boolean }) => {
      arbitrageCoordinator.setActive(active);
    });
  });

  // ���� Weather polling (Open-Meteo, every 15 min) ������������������������
  let weatherTimeout: ReturnType<typeof setTimeout> | null = null;
  async function updateCloudFactor() {
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=22.5431&longitude=114.0579&current=cloud_cover,temperature_2m&timezone=Asia/Shanghai',
        { headers: { 'User-Agent': 'smart-city-backend/1.0' } }
      );
      const json = (await res.json()) as { current?: { cloud_cover?: number; temperature_2m?: number } };
      const cover = json.current?.cloud_cover ?? 50;
      const temp = json.current?.temperature_2m ?? 25;
      energySim.setCloudFactor(cover / 100);
      marlManager.setWeather(cover / 100, temp);
    } catch (err) {
      console.warn('[Weather] Cloud factor update failed:',
        err instanceof Error ? err.message : String(err));
    } finally {
      weatherTimeout = setTimeout(updateCloudFactor, 15 * 60 * 1000);
    }
  }
  updateCloudFactor();

  // ���� DB pruning (every 5 min) ������������������������������������������������������������
  const pruneInterval = setInterval(() => {
    try {
      pruneSnapshots(1000);
    } catch (err) {
      console.warn('[DB] pruneSnapshots failed:',
        err instanceof Error ? err.message : String(err));
    }
  }, 5 * 60 * 1000);

  // ���� Graceful shutdown ��������������������������������������������������������������������������
  const shutdown = () => {
    if (weatherTimeout) clearTimeout(weatherTimeout);
    clearInterval(pruneInterval);
    trafficSim.stop();
    energySim.stop();
    jointSim.offTick(jointCb);
    marlManager.offProgress(marlCb);
    generativeEngine.offProgress(generativeCb);
    federatedEngine.offProgress(federatedCb);
    whatIfEngine.offProgress(whatIfCb);
    try { closeDb(); } catch (err) {
      console.warn('[DB] closeDb failed:',
        err instanceof Error ? err.message : String(err));
    }
    server.close();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { server, shutdown };
}
