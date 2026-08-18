/**
 * Application factory �� creates Express app, Socket.IO server, configures CORS/routes/middleware.
 * Exported so tests can create an app without starting simulation or listening.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { setupSerial } from '../serial/serialManager';
import { setupSocketHandlers } from '../socket/socketHandlers';
import trafficRoutes from '../routes/traffic';
import energyRoutes from '../routes/energy';
import weatherRoutes from '../routes/weather';
import aiRoutes from '../routes/ai';
import trafficSimRoutes from '../routes/trafficSim';
import energySimRoutes from '../routes/energySim';
import marlRoutes from '../routes/marl';
import whatIfRoutes from '../routes/whatIf';
import jointRoutes from '../routes/joint';
import federatedRoutes from '../routes/federated';
import generativeRoutes from '../routes/generative';
import cfmRoutes from '../routes/cfm';
import { createDroneRouter } from '../routes/drone';
import { TelloController } from '../services/drone/TelloController';
import { ObjectDetector } from '../services/drone/ObjectDetector';
import { IdmCalibrator } from '../services/drone/IdmCalibrator';

export interface AppComponents {
  app: express.Application;
  server: http.Server;
  io: SocketIOServer;
}

export function createApp(): AppComponents {
  const app = express();
  const server = http.createServer(app);

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:4173'];

  const io = new SocketIOServer(server, {
    cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
  });

  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());

  // API Routes
  app.use('/api/traffic', trafficRoutes);
  app.use('/api/energy', energyRoutes);
  app.use('/api/weather', weatherRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/traffic-sim', trafficSimRoutes);
  app.use('/api/energy-sim', energySimRoutes);
  app.use('/api/marl', marlRoutes);
  app.use('/api/whatif', whatIfRoutes);
  app.use('/api/joint', jointRoutes);
  app.use('/api/federated', federatedRoutes);
  app.use('/api/generative', generativeRoutes);
  app.use('/api/cfm', cfmRoutes);

  // Drone (DJI Tello + detection)
  const tello = new TelloController();
  const detector = new ObjectDetector();
  const calibrator = new IdmCalibrator();
  tello.connect();
  app.use('/api/drone', createDroneRouter(tello, detector, calibrator));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // WebSocket
  setupSocketHandlers(io);

  // Serial Port (Arduino)
  setupSerial(io);

  // Global error handler �� prevents crashes from uncaught route errors
  app.use(((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Express Error]', message);
    res.status(500).json({ error: 'Internal Server Error' });
  }) as express.ErrorRequestHandler);

  return { app, server, io };
}
