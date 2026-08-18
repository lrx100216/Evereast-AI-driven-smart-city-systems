// 能源-交通耦合引擎 —— 两个仿真器联合跑
// 
// 耦合逻辑：
//   交通拥堵 → EV 充电需求增加 → 电网负荷上升
//   太阳能过剩 → 充电降价 → 推通知让车主来充
//
// 8个充电站硬编码在主要路口，定价策略非常简单，就是 surplusRatio * 2 的折扣
// 没有考虑车主实际响应率，默认来一个通知就来一辆车，显然不现实，但先这样
//
// FIXME: 碳成本计算用的碳价 0.06 ¥/kg 是随手估的，没有引用来源

import { TrafficSimulationEngine } from '../trafficSimulation';
import { EnergySimulationEngine } from '../energySimulation';
import type {
  EVChargingStation, JointSnapshot, EVNotification,
} from './types';

// ─── Station Definitions ────────────────────────────────────

interface StationDef {
  id: string; name: string; nameZh: string;
  intersectionId: string; zoneType: string;
  capacity: number; chargeRate: number; basePrice: number;
}

const STATION_DEFS: StationDef[] = [
  { id: 'ev-tech-1', name: 'Tech Park Supercharger', nameZh: '科技园超充站', intersectionId: 'tech-1', zoneType: 'tech_park', capacity: 12, chargeRate: 120, basePrice: 1.0 },
  { id: 'ev-tech-2', name: 'AI Blvd Charging Hub',  nameZh: 'AI大道充电站',   intersectionId: 'tech-2', zoneType: 'tech_park', capacity: 8, chargeRate: 60, basePrice: 1.0 },
  { id: 'ev-com-1', name: 'CBD Charging Plaza',     nameZh: 'CBD充电广场',    intersectionId: 'com-1', zoneType: 'commercial', capacity: 16, chargeRate: 150, basePrice: 1.1 },
  { id: 'ev-com-2', name: 'Mall Drive EV Station',   nameZh: '商场路充电站',   intersectionId: 'com-2', zoneType: 'commercial', capacity: 10, chargeRate: 100, basePrice: 1.1 },
  { id: 'ev-res-1', name: 'Garden Rd Community Charger', nameZh: '花园路社区充电', intersectionId: 'res-1', zoneType: 'residential', capacity: 6, chargeRate: 30, basePrice: 0.8 },
  { id: 'ev-res-2', name: 'Lake Ave Night Charger',  nameZh: '湖滨路夜充站',   intersectionId: 'res-2', zoneType: 'residential', capacity: 8, chargeRate: 30, basePrice: 0.8 },
  { id: 'ev-ind-1', name: 'Industrial Fast Charge',  nameZh: '工业区快充站',   intersectionId: 'ind-1', zoneType: 'industrial', capacity: 20, chargeRate: 200, basePrice: 0.9 },
  { id: 'ev-sch-1', name: 'Campus EV Point',         nameZh: '校园充电点',     intersectionId: 'sch-1', zoneType: 'school', capacity: 4, chargeRate: 30, basePrice: 0.85 },
];

// ─── Carbon & Pricing Constants ─────────────────────────────

const CARBON_PRICE = 0.06;       // ¥/kg CO2 — social cost of carbon
const GRID_CARBON_BASE = 0.5;    // kg CO2/kWh — baseline grid carbon intensity
const SOLAR_SURPLUS_THRESHOLD = 0.2; // 20% surplus = discount kicks in
const MAX_SOLAR_DISCOUNT = 0.6;  // max 60% off from solar
const CONGESTION_EV_FACTOR = 0.15; // kW of EV demand per congestion point

export class JointSimEngine {
  traffic: TrafficSimulationEngine;
  energy: EnergySimulationEngine;
  private stations: EVChargingStation[] = [];
  private notifications: EVNotification[] = [];
  private notifId = 0;
  private callbacks: ((s: JointSnapshot) => void)[] = [];
  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private simMinuteOfDay = 360; // 6:00 AM
  private priceHistory: { time: string; price: number; solar: number }[] = [];
  private evLoadHistory: { time: string; evLoad: number; congestion: number }[] = [];
  private readonly MAX_HISTORY = 30;

  // Carbon tracking
  private totalCarbonCost = 0;
  private totalElectricityCost = 0;

  constructor() {
    this.traffic = new TrafficSimulationEngine();
    this.traffic.stop();
    this.traffic.setMaxVehicles(2000);

    this.energy = new EnergySimulationEngine();
    this.energy.stop();

    // Init stations
    this.stations = STATION_DEFS.map(d => ({
      id: d.id, name: d.name, nameZh: d.nameZh,
      intersectionId: d.intersectionId, zoneType: d.zoneType,
      capacity: d.capacity, currentCars: 0, queueLength: 0,
      basePrice: d.basePrice, currentPrice: d.basePrice,
      solarDiscount: 0, chargeRate: d.chargeRate, totalLoad: 0,
      solarPowered: false,
    }));
  }

  // ─── Public API ────────────────────────────────────────────

  onTick(cb: (s: JointSnapshot) => void): void { this.callbacks.push(cb); }

  offTick(cb: (s: JointSnapshot) => void): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.traffic.reset(6);
    this.energy.resetSimTime(6);
    this.simMinuteOfDay = 360;
    this.scheduleTick();
  }

  stop() {
    this.running = false;
    if (this.intervalId) { clearTimeout(this.intervalId); this.intervalId = null; }
  }

  getNotifications(): EVNotification[] { return [...this.notifications]; }
  getStations(): EVChargingStation[] { return this.stations; }

  private scheduleTick() {
    this.intervalId = setTimeout(() => {
      try { this.tick(); } catch (e) { console.error('[JointSim] tick error:', e); }
      if (this.running) this.scheduleTick();
    }, 1500);
  }

  // ─── Tick ──────────────────────────────────────────────────

  private tick() {
    // Advance both simulations by 5 sim-minutes
    this.traffic.advanceMinutes(5);
    for (let i = 0; i < 5; i++) {
      this.energy.tickRawWithState();
      this.simMinuteOfDay++;
    }

    // ── 1. Traffic → EV Demand ───────────────────────────────
    let totalCongestion = 0;
    let totalVehicles = 0;
    let totalSpeed = 0;
    let speedSamples = 0;

    for (const station of this.stations) {
      const lanes = this.traffic.getIntersectionLaneData(station.intersectionId);
      // Congestion at this intersection drives EV demand
      const localCongestion = lanes.reduce((s, l) => s + l.queueCount, 0);
      totalCongestion += localCongestion;

      // EV demand = base idle + congestion-driven
      const evDemand = Math.round(
        station.capacity * 0.15 + // base idle
        localCongestion * CONGESTION_EV_FACTOR / station.chargeRate * station.capacity
      );
      station.currentCars = Math.min(station.capacity, evDemand);
      station.queueLength = Math.max(0, evDemand - station.capacity);
      station.totalLoad = station.currentCars * station.chargeRate;

      // Sum up for traffic stats
      for (const l of lanes) {
        totalVehicles += l.carCount;
        totalSpeed += l.avgSpeed;
        speedSamples++;
      }
    }
    const avgCongestion = this.stations.length > 0
      ? Math.round(totalCongestion / this.stations.length)
      : 0;
    const avgSpeed = speedSamples > 0 ? Math.round(totalSpeed / speedSamples) : 0;

    // ── 2. Energy → Solar & Price ────────────────────────────
    const energySnap = this.energy.getCurrentSnapshot();
    const solarOutput = energySnap.grid.totalSupply - (energySnap.battery.chargePower < 0 ? Math.abs(energySnap.battery.chargePower) : 0);
    const batterySoc = energySnap.battery.soc;
    const gridPrice = energySnap.grid.price;
    const currentHour = Math.floor(this.simMinuteOfDay / 60);

    // Total EV load from all stations
    const totalEvLoad = this.stations.reduce((s, st) => s + st.totalLoad, 0);

    // ── 3. Solar Surplus → Dynamic Pricing ───────────────────
    const totalLoadMW = (energySnap.grid.totalLoad + totalEvLoad) / 1000; // both kW → MW
    const solarSurplus = solarOutput > 50 && (solarOutput / 1000) > totalLoadMW * SOLAR_SURPLUS_THRESHOLD;

    const triggeredMessages: string[] = [];
    const triggeredMessagesZh: string[] = [];

    for (const station of this.stations) {
      // Solar discount: proportional to surplus ratio
      const surplusRatio = solarSurplus
        ? Math.min(1, (solarOutput / 1000 - totalLoadMW) / Math.max(1, totalLoadMW))
        : 0;
      station.solarDiscount = Math.min(MAX_SOLAR_DISCOUNT, surplusRatio * 2);
      station.currentPrice = Math.round(station.basePrice * (1 - station.solarDiscount) * 100) / 100;
      station.solarPowered = station.solarDiscount > 0.15;

      // Notification trigger: price drops below 60% of valley price (0.26 ¥/kWh)
      if (station.solarDiscount > 0.3 && station.currentPrice < 0.26 * 0.7) {
        const discountPct = Math.round(station.solarDiscount * 100);
        const msg = `⚡ Solar surplus! Charge at ${station.name} for ¥${station.currentPrice}/kWh — ${discountPct}% off!`;
        const msgZh = `⚡ 太阳能过剩！${station.nameZh} 充电仅 ¥${station.currentPrice}/度 — 便宜 ${discountPct}%！比晚上低谷还低！`;
        triggeredMessages.push(msg);
        triggeredMessagesZh.push(msgZh);

        this.notifications.push({
          id: ++this.notifId,
          timestamp: new Date().toISOString(),
          message: msg,
          messageZh: msgZh,
          stationId: station.id,
          discountPercent: discountPct,
          currentPrice: station.currentPrice,
          valleyPrice: 0.26,
        });
        if (this.notifications.length > 20) this.notifications = this.notifications.slice(-20);
      }
    }

    const notifyMsg = triggeredMessages.length > 0 ? triggeredMessages.join(' | ') : null;
    const notifyMsgZh = triggeredMessagesZh.length > 0 ? triggeredMessagesZh.join(' | ') : null;

    // ── 4. Carbon-Aware Cost ──────────────────────────────────
    const gridImport = energySnap.grid.gridImport;
    const gridCarbonIntensity = GRID_CARBON_BASE + (energySnap.grid.peakType === 'peak' ? 0.15 : 0);
    const electricityCost = gridImport * gridPrice / 1000; // W → kW, per 5 min
    const carbonCost = gridImport * gridCarbonIntensity * CARBON_PRICE / 1000;

    this.totalElectricityCost += electricityCost;
    this.totalCarbonCost += carbonCost;

    // ── 5. History ───────────────────────────────────────────
    const timeStr = `${String(currentHour).padStart(2, '0')}:${String(Math.floor((this.simMinuteOfDay % 60))).padStart(2, '0')}`;
    this.priceHistory.push({ time: timeStr, price: this.stations[0]?.currentPrice || gridPrice, solar: solarOutput });
    this.evLoadHistory.push({ time: timeStr, evLoad: totalEvLoad, congestion: avgCongestion });
    if (this.priceHistory.length > this.MAX_HISTORY) this.priceHistory = this.priceHistory.slice(-this.MAX_HISTORY);
    if (this.evLoadHistory.length > this.MAX_HISTORY) this.evLoadHistory = this.evLoadHistory.slice(-this.MAX_HISTORY);

    // ── 6. Build Snapshot ──────────────────────────────────────
    const snapshot: JointSnapshot = {
      timestamp: new Date().toISOString(),
      simTime: timeStr,
      simHour: currentHour,
      totalVehicles,
      avgSpeed,
      congestionLevel: avgCongestion,
      solarOutput,
      batterySoc,
      gridPrice,
      totalGridLoad: totalLoadMW,
      gridCarbonIntensity,
      stations: this.stations.map(s => ({ ...s })),
      totalEvLoad,
      evDemandFromCongestion: Math.round(avgCongestion * CONGESTION_EV_FACTOR * this.stations.length),
      lyapunovCost: Math.round(electricityCost * 100) / 100,
      lyapunovCarbon: Math.round(carbonCost * 100) / 100,
      lyapunovDPP: Math.round((electricityCost + carbonCost) * 100) / 100,
      fsmState: energySnap.fsm.state,
      solarSurplus,
      notifyMessage: notifyMsg,
      notifyMessageZh: notifyMsgZh,
      priceHistory: [...this.priceHistory],
      evLoadHistory: [...this.evLoadHistory],
    };

    for (const cb of this.callbacks) cb(snapshot);
  }
}

export const jointSim = new JointSimEngine();
