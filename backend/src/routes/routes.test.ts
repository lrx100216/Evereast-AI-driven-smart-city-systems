import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(cors());
  app.use(express.json());

  const { default: trafficRoutes } = await import('./traffic');
  const { default: energyRoutes } = await import('./energy');
  const { default: weatherRoutes } = await import('./weather');
  const { default: aiRoutes } = await import('./ai');
  const { default: trafficSimRoutes } = await import('./trafficSim');
  const { default: energySimRoutes } = await import('./energySim');

  app.use('/api/traffic', trafficRoutes);
  app.use('/api/energy', energyRoutes);
  app.use('/api/weather', weatherRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/traffic-sim', trafficSimRoutes);
  app.use('/api/energy-sim', energySimRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
});

describe('GET /api/health', () => {
  it('should return ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('Traffic Routes', () => {
  it('GET /api/traffic/status should return traffic data', async () => {
    const res = await request(app).get('/api/traffic/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('carCount');
    expect(res.body).toHaveProperty('pedestrianCount');
    expect(res.body).toHaveProperty('congestionLevel');
    expect(res.body).toHaveProperty('averageSpeed');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/traffic/history should return an array', async () => {
    const res = await request(app).get('/api/traffic/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/traffic/signal/timing should update signal', async () => {
    const res = await request(app)
      .post('/api/traffic/signal/timing')
      .send({ intersectionId: 'main', greenDuration: 30, redDuration: 20 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Energy Routes', () => {
  it('GET /api/energy/status should return energy data', async () => {
    const res = await request(app).get('/api/energy/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('solarVoltage');
    expect(res.body).toHaveProperty('batteryLevel');
    expect(res.body).toHaveProperty('panelAngle');
    expect(res.body).toHaveProperty('powerOutput');
    expect(res.body).toHaveProperty('consumption');
  });

  it('GET /api/energy/history should return an array', async () => {
    const res = await request(app).get('/api/energy/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/energy/panel/angle should update panel angle', async () => {
    const res = await request(app)
      .post('/api/energy/panel/angle')
      .send({ angle: 45 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/energy/panel/angle should clamp angle to 0-180', async () => {
    await request(app).post('/api/energy/panel/angle').send({ angle: 200 });
    const res = await request(app).get('/api/energy/status');
    expect(res.body.panelAngle).toBeLessThanOrEqual(180);
  });
});

describe('Weather Routes', () => {
  it('GET /api/weather/current should return weather data', async () => {
    const res = await request(app).get('/api/weather/current');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('temperature');
    expect(res.body).toHaveProperty('humidity');
    expect(res.body).toHaveProperty('lightIntensity');
    expect(res.body).toHaveProperty('weatherCondition');
  });

  it('GET /api/weather/history should return an array', async () => {
    const res = await request(app).get('/api/weather/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('AI Routes', () => {
  it('GET /api/ai/advice should return advice object', async () => {
    const res = await request(app).get('/api/ai/advice');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('overall');
  });
});

describe('Traffic Sim Routes', () => {
  it('GET /api/traffic-sim/snapshot should return simulation data', async () => {
    const res = await request(app).get('/api/traffic-sim/snapshot');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('zones');
    expect(res.body).toHaveProperty('simTime');
    expect(res.body).toHaveProperty('simHour');
  });

  it('POST /api/traffic-sim/signal/cycle should set signal timing', async () => {
    const res = await request(app)
      .post('/api/traffic-sim/signal/cycle')
      .send({ intersectionId: 'ind-1', greenDuration: 45, direction: 'N' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.direction).toBe('N');
  });

  it('POST /api/traffic-sim/signal/cycle should return 400 for missing params', async () => {
    const res = await request(app)
      .post('/api/traffic-sim/signal/cycle')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('Energy Sim Routes', () => {
  it('GET /api/energy-sim/snapshot should return simulation data', async () => {
    const res = await request(app).get('/api/energy-sim/snapshot');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('zones');
    expect(res.body).toHaveProperty('battery');
    expect(res.body).toHaveProperty('grid');
    expect(res.body).toHaveProperty('lyapunov');
    expect(res.body).toHaveProperty('fsm');
  });
});
