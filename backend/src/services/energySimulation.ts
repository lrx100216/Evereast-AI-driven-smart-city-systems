// 能源仿真引擎 —— 负荷曲线 + 光伏 + 电池优化 + 碳排
// FIXME: Lyapunov 优化器的 V=200 是拍脑袋定的，最好做 grid search
// HACK: 电池退化模型非常简化，真实场景要考虑温度、日历老化，这里先凑数

// types

export type EnergyZoneType = 'industrial' | 'tech_park' | 'commercial' | 'school' | 'residential';
export type PeakType = 'valley' | 'shoulder' | 'peak';
export type FsmState = 'normal' | 'limit_protect' | 'anti_backflow' | 'dead_zone';

export interface EnergyZoneSnapshot {
  id: string;
  name: string;
  nameZh: string;
  type: EnergyZoneType;
  load: number;        // current load kW
  baseLoad: number;    // base load kW
  hourlyFactor: number; // current hourly multiplier
}

export interface PowerPlantSnapshot {
  id: string;
  name: string;
  nameZh: string;
  type: 'nuclear' | 'gas' | 'coal' | 'solar' | 'hydro';
  capacity: number;    // MW
  output: number;      // current output MW
  online: boolean;
}

export interface BatterySnapshot {
  soc: number;          // 0-100
  capacity: number;     // kWh
  chargePower: number;  // current charge (+) / discharge (-) kW
  maxChargeRate: number;
  maxDischargeRate: number;
}

export interface GridSnapshot {
  price: number;         // 元/kWh
  peakType: PeakType;
  totalLoad: number;     // total demand kW
  totalSupply: number;   // total supply kW
  gridImport: number;    // buying from grid kW
  gridExport: number;    // selling to grid kW
}

export interface LyapunovSnapshot {
  Q: number;
  V: number;              // base V
  dynamicV: number;       // actual V used (with SOC deviation multiplier)
  targetSOC: number;
  drift: number;
  penalty: number;
  driftPlusPenalty: number;
  actionCount: number;    // number of actions searched
}

export interface FsmSnapshot {
  state: FsmState;
  reason: string;
}

export interface EnergySimSnapshot {
  timestamp: string;
  simTime: string;
  simHour: number;
  simMinute: number;
  zones: EnergyZoneSnapshot[];
  plants: PowerPlantSnapshot[];
  battery: BatterySnapshot;
  grid: GridSnapshot;
  lyapunov: LyapunovSnapshot;
  fsm: FsmSnapshot;
  buildingLights: number;
  history: HistoryPoint[];
  carbon: { totalKg: number; intensity: number; avoidedKg: number };
}

// 深圳电厂数据 — 大亚湾核电容量1968MW是网上查的，可能过时了

interface PlantDef {
  id: string;
  name: string;
  nameZh: string;
  type: PowerPlantSnapshot['type'];
  capacity: number; // MW
}

const SHENZHEN_PLANTS: PlantDef[] = [
  { id: 'daya-bay',   name: 'Daya Bay Nuclear Power Plant',     nameZh: '大亚湾核电站',     type: 'nuclear', capacity: 1968 },
  { id: 'mawan',      name: 'Mawan Gas Power Plant',            nameZh: '妈湾燃气电厂',     type: 'gas',     capacity: 1170 },
  { id: 'qianwan',    name: 'Qianwan Gas Power Plant',          nameZh: '前湾燃气电厂',     type: 'gas',     capacity: 780  },
  { id: 'shenzhen-energy', name: 'Shenzhen Energy Co-generation', nameZh: '深圳能源热电',   type: 'coal',    capacity: 640  },
  { id: 'guangming',  name: 'Guangming Solar Farm',             nameZh: '光明光伏电站',     type: 'solar',   capacity: 120  },
];

// 5类区域负荷定义

interface EnergyZoneDef {
  type: EnergyZoneType;
  name: string;
  nameZh: string;
  baseLoad: number;         // base kW
  hourlyProfile: number[];  // 24h multiplier
}

const ENERGY_ZONES: EnergyZoneDef[] = [
  {
    type: 'industrial', name: 'Industrial Zone', nameZh: '工业区',
    baseLoad: 850,
    hourlyProfile: [25,22,20,18,18,20,35,60,95,100,98,95,90,85,88,92,95,90,80,65,50,40,35,30],
  },
  {
    type: 'tech_park', name: 'Tech Park', nameZh: '科技园',
    baseLoad: 620,
    hourlyProfile: [10,8,8,8,8,10,15,40,90,100,85,75,70,70,75,80,85,75,60,45,30,20,15,12],
  },
  {
    type: 'commercial', name: 'Business District', nameZh: '商业区',
    baseLoad: 720,
    hourlyProfile: [15,12,10,10,10,15,20,30,55,75,85,90,95,90,85,88,92,95,100,90,75,55,35,25],
  },
  {
    type: 'school', name: 'School Zone', nameZh: '学校区',
    baseLoad: 280,
    hourlyProfile: [5,5,5,5,5,5,10,35,75,80,60,55,50,50,55,60,70,40,25,15,10,8,6,5],
  },
  {
    type: 'residential', name: 'Residential Area', nameZh: '住宅区',
    baseLoad: 480,
    hourlyProfile: [40,35,30,28,28,30,55,70,55,35,30,28,28,28,30,35,45,55,70,85,90,80,65,55],
  },
];

// 深圳分时电价 — 2024年的数据，后面如果电价改了这里也得改
// Standard Shenzhen commercial/industrial TOU (元/kWh)
// 峰谷时段划分，深圳工业用电的标准，和商业用电有点不一样，先凑合用

export function getPeakType(hour: number, minute: number): PeakType {
  const t = hour + minute / 60;
  if (t >= 23 || t < 7) return 'valley';
  if ((t >= 9 && t < 11.5) || (t >= 14 && t < 16.5) || (t >= 19 && t < 21)) return 'peak';
  return 'shoulder';
}

const PRICES: Record<PeakType, number> = {
  valley:   0.26,
  shoulder: 0.70,
  peak:     1.17,
};

// Lyapunov 漂移+惩罚优化器 — 参考了 Neely 的 stochastic network optimization
// 但实现得很糙，没有理论保证，就是图个效果

class LyapunovOptimizer {
  private Q: number = 0;
  private V: number = 200;
  private targetSOC: number = 0.55;
  private dt: number;

  constructor(dtHours: number = 1 / 60) {
    this.dt = dtHours;
  }

  reset() { this.Q = 0; }


  // 算最优充放电功率，暴力搜13个候选动作，选 drift+V*cost 最小的
  // 效率曲线也是瞎拟合的， peaked at 40-60% 没有实验依据
  compute(
    soc: number, price: number, load: number, solarOutput: number,
    battery: { maxCharge: number; maxDischarge: number; capacity: number; efficiency: number }
  ): { chargePower: number; drift: number; penalty: number; dpp: number; dynamicV: number; actionsSearched: number } {
    const q = (soc / 100 - this.targetSOC) * battery.capacity;
    this.Q = q;

    const socDeviation = Math.abs(soc / 100 - this.targetSOC);
    const dynamicV = this.V * (1 + socDeviation * 3);

    const netLoad = load - solarOutput;

    let bestAction = 0, bestDpp = Infinity, bestDrift = 0, bestPenalty = 0;

    const fractions = [-1.0, -0.8, -0.6, -0.4, -0.25, -0.1, 0, 0.1, 0.25, 0.4, 0.6, 0.8, 1.0];
    const candidates = fractions.map(f => f >= 0
      ? f * battery.maxCharge
      : f * battery.maxDischarge
    );

    for (const p of candidates) {
      // Efficiency varies with power level (peaks at moderate rates)
      const absFrac = Math.abs(p) / (p >= 0 ? battery.maxCharge : battery.maxDischarge);
      const effCurve = 1 - absFrac * 0.15; // 0.85 at max power, 1.0 at idle
      const eff = p > 0 ? battery.efficiency * effCurve : 1 / (battery.efficiency * effCurve);

      // Q = battery energy deviation from target. Charging (p>0) adds energy → Q increases.
      const qNext = q + p * eff * this.dt;
      const L = 0.5 * q * q;
      const Lnext = 0.5 * qNext * qNext;
      const drift = Lnext - L;

      const gridPower = netLoad + p;
      // Selling to grid at 85% of purchase price
      const cost = gridPower > 0
        ? gridPower * price * this.dt
        : gridPower * price * this.dt * 0.85;

      const dpp = drift + dynamicV * cost;

      if (dpp < bestDpp) {
        bestDpp = dpp; bestAction = p; bestDrift = drift; bestPenalty = cost;
      }
    }

    return {
      chargePower: Math.round(bestAction * 10) / 10,
      drift: Math.round(bestDrift * 100) / 100,
      penalty: Math.round(bestPenalty * 100) / 100,
      dpp: Math.round(bestDpp * 100) / 100,
      dynamicV: Math.round(dynamicV),
      actionsSearched: fractions.length,
    };
  }

  getQ() { return this.Q; }
  getV() { return this.V; }
  getTargetSOC() { return this.targetSOC; }
  setTargetSOC(target: number) { this.targetSOC = Math.max(0.1, Math.min(0.9, target)); }
}

// FSM 安全状态机 — 抄的储能系统常见三段式保护逻辑

class FSMController {
  private state: FsmState = 'normal';

  check(soc: number, chargePower: number, netLoad: number, solarOutput: number,
        battery: { maxCharge: number; maxDischarge: number; capacity: number }):
        { state: FsmState; power: number; reason: string } {

    let power = chargePower;
    let reason = '';

    // 状态1：物理限幅，soc到95就不充了，硬切断
    if (soc >= 95 && chargePower > 0) {
      power = 0;
      this.state = 'limit_protect';
      reason = 'SOC≥95% 上限保护，强制停止充电';
    } else if (soc <= 5 && chargePower < 0) {
      power = 0;
      this.state = 'limit_protect';
      reason = 'SOC≤5% 下限保护，强制停止放电';
    }
    // 状态2：防逆流，净负荷 < 0（光伏 > 负荷）时才限制放电，避免向电网倒送
    else if (netLoad < 0 && power < 0) {
      const maxSafeDischarge = Math.max(0, -netLoad);
      power = -Math.min(Math.abs(power), maxSafeDischarge);
      this.state = 'anti_backflow';
      reason = '防逆流保护，限制放电功率';
    }
    // 状态3：死区休眠，功率太小就歇着，省得继电器频繁开关
    else if (Math.abs(power) < battery.maxCharge * 0.03) {
      power = 0;
      this.state = 'dead_zone';
      reason = '死区休眠：功率过小，静置保护电池寿命';
    }
    else {
      this.state = 'normal';
      reason = '正常调度';
    }

    return { state: this.state, power, reason };
  }

  getState() { return this.state; }
}

function formatSimTime(hour: number, minute: number): string {
  const h = Math.floor(hour);
  const m = Math.floor(minute);
  const s = Math.round((minute - m) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 仿真引擎主类

interface HistoryPoint {
  simTime: string;
  soc: number;
  price: number;
  gridImport: number;
  chargePower: number;
  totalLoad: number;
}

class EnergySimulationEngine {
  private simHour: number;
  private simMinute: number;
  private running = false;
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private tickGeneration = 0; // guards against double-tick chains after setSpeed
  private tickCallbacks: ((snapshot: EnergySimSnapshot) => void)[] = [];

  // Battery
  private soc = 55; // start at 55%
  private readonly batteryCapacity = 500; // kWh
  private readonly batteryMaxCharge = 250; // kW  (upped from 150 for more visible SOC changes)
  private readonly batteryMaxDischarge = 250; // kW
  private readonly batteryEfficiency = 0.92;
  private chargePower = 0; // current charge/discharge

  // Tick interval: always advances 1 sim-minute, speed changes the real interval
  private readonly BASE_INTERVAL_MS = 2000; // 2 real seconds per sim-minute at 1×
  private tickIntervalMs = this.BASE_INTERVAL_MS;

  // Controllers (dt = 1 minute in hours)
  private lyapunov = new LyapunovOptimizer(1 / 60);
  private fsm = new FSMController();

  // Solar output (follows sun)
  private solarPeak = 380; // kW peak
  private solarMultiplier = 1; // for what-if angle experiments
  private cloudFactor = 0; // 0=clear, 1=overcast
  private priceMultiplier = 1; // for what-if price ratio experiments

  // Battery degradation tracking
  private totalCycles = 0;
  private degradedCapacity: number;
  private totalCarbonKg = 0;
  private totalSolarKwh = 0;

  // Carbon intensity by source (kg CO₂ per kWh)
  private readonly CARBON_INTENSITY: Record<string, number> = {
    coal: 0.95, gas: 0.45, nuclear: 0.012, solar: 0.04, hydro: 0.02,
  };

  private history: HistoryPoint[] = []; // 给前端图表用的，只保留最近30个点
  private readonly maxHistory = 30;

  private zoneLoadNoise: number[] = []; // what-if 需要可复现，所以每tick冻住随机数

  constructor() {
    this.simHour = 6;
    this.simMinute = 0;
    this.degradedCapacity = this.batteryCapacity;
    this.zoneLoadNoise = ENERGY_ZONES.map(() => 1.0);
  }

  // ── public api ──

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleTick();
  }

  stop() {
    this.running = false;
    this.tickGeneration++;
    if (this.intervalId) { clearTimeout(this.intervalId); this.intervalId = null; }
  }

  // 重置时间（jointSim耦合时调用）
  resetSimTime(hour = 6, minute = 0) {
    this.simHour = hour;
    this.simMinute = minute;
    this.soc = 55;
    this.totalCycles = 0;
    this.degradedCapacity = this.batteryCapacity;
    this.chargePower = 0;
    this.lyapunov.reset();
    this.zoneLoadNoise = ENERGY_ZONES.map(() => 1.0);
  }

  onTick(cb: (snapshot: EnergySimSnapshot) => void) {
    this.tickCallbacks.push(cb);
  }

  getCurrentSnapshot(): EnergySimSnapshot {
    return this.buildSnapshot();
  }

  setSpeed(speed: number) {
    const clamped = Math.max(0.1, Math.min(10, speed));
    this.tickIntervalMs = Math.round(this.BASE_INTERVAL_MS / clamped);
    if (this.running) {
      this.tickGeneration++;
      if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
      }
      this.scheduleTick();
    }
  }

  getSpeed(): number {
    return Math.round((this.BASE_INTERVAL_MS / this.tickIntervalMs) * 100) / 100;
  }

  private scheduleTick() {
    const gen = this.tickGeneration;
    this.intervalId = setTimeout(() => {
      if (gen !== this.tickGeneration) return;
      try { this.tick(); } catch (e) { console.error('[EnergySim] tick error:', e); }
      if (this.running && gen === this.tickGeneration) this.scheduleTick();
    }, this.tickIntervalMs);
  }

  /** Update cloud factor from real weather API (0=clear, 1=overcast) */
  setCloudFactor(factor: number) {
    this.cloudFactor = Math.max(0, Math.min(1, factor));
  }

  /** Multiply solar peak output (for what-if panel angle experiments) */
  setSolarMultiplier(mult: number) {
    this.solarMultiplier = Math.max(0, mult);
  }

  /** Multiply TOU prices (for what-if price ratio experiments) */
  setPriceMultiplier(mult: number) {
    this.priceMultiplier = Math.max(0, mult);
  }

  // 只推进时间，不buildSnapshot（What-If/JointSim用）
  tickRaw(): void {
    this.simMinute += 1;
    if (this.simMinute >= 60) {
      this.simMinute -= 60;
      this.simHour = (this.simHour + 1) % 24;
    }
  }

  // 推进时间 + 更新状态
  tickRawWithState(): void {
    this.tickRaw();
    this.buildSnapshot();
  }

  // 光伏出力 — 正弦曲线拟合，非常粗糙，没考虑直射/散射分解

  private getSolarOutput(hour: number, minute: number): number {
    const t = hour + minute / 60;
    if (t < 6 || t >= 18) return 0;
    // Base sine curve × cloud attenuation × solar multiplier (for what-if angle experiments)
    const basePower = this.solarPeak * Math.sin(Math.PI * (t - 6) / 12);
    return basePower * (1 - this.cloudFactor * 0.7) * this.solarMultiplier;
  }

  // tick 主循环

  private tick() {
    this.simMinute += 1;
    if (this.simMinute >= 60) {
      this.simMinute -= 60;
      this.simHour = (this.simHour + 1) % 24;
    }

    // Generate fresh load noise each tick so What-If pairs share the same randomness frame
    this.zoneLoadNoise = ENERGY_ZONES.map(() => 0.99 + Math.random() * 0.02);

    const snap = this.buildSnapshot();
    for (const cb of this.tickCallbacks) {
      cb(snap);
    }
  }

  // 拼snapshot给前端

  private buildSnapshot(): EnergySimSnapshot {
    const hour = this.simHour;
    const minute = this.simMinute;

    // Zones
    const zones: EnergyZoneSnapshot[] = ENERGY_ZONES.map((z, idx) => {
      const hFact = z.hourlyProfile[hour] / 100;
      const noise = this.zoneLoadNoise[idx] ?? 1.0;
      const load = Math.round(z.baseLoad * hFact * noise);
      return {
        id: z.type,
        name: z.name,
        nameZh: z.nameZh,
        type: z.type,
        load,
        baseLoad: z.baseLoad,
        hourlyFactor: hFact,
      };
    });

    const totalLoad = zones.reduce((s, z) => s + z.load, 0);

    // Solar
    const solarOutput = this.getSolarOutput(hour, minute);

    // Grid pricing (with price multiplier for what-if experiments)
    const peakType = getPeakType(hour, minute);
    const price = PRICES[peakType] * this.priceMultiplier;

    // Dynamic target SOC — charge during cheap valley, discharge during expensive peak
    const peakTargets: Record<PeakType, number> = { valley: 0.80, shoulder: 0.50, peak: 0.20 };
    this.lyapunov.setTargetSOC(peakTargets[peakType]);

    // Lyapunov optimization (for metrics display only — the drift penalty
    // causes it to always pick p≈0, so we override chargePower below)
    const lyapResult = this.lyapunov.compute(
      this.soc, price, totalLoad, solarOutput,
      { maxCharge: this.batteryMaxCharge, maxDischarge: this.batteryMaxDischarge,
        capacity: this.batteryCapacity, efficiency: this.batteryEfficiency }
    );

    // ── Rule-based charge/discharge strategy ──────────────────
    // Lyapunov drift penalises ANY deviation, so it never moves the battery.
    // We override with a simple time-of-use + solar-aware strategy.
    const netLoad = totalLoad - solarOutput;
    let desiredPower = 0;

    if (peakType === 'valley') {
      // Cheap electricity — charge aggressively
      if (this.soc < 78) {
        desiredPower = this.batteryMaxCharge * 0.85; // 85% max rate
      } else if (this.soc < 92) {
        desiredPower = this.batteryMaxCharge * 0.35;
      }
    } else if (peakType === 'peak') {
      // Expensive electricity — discharge to save money
      // SOC target: 20%. If above, discharge at ~70% of max rate.
      if (this.soc > 22) {
        desiredPower = -this.batteryMaxDischarge * 0.7;
      } else if (this.soc > 15) {
        desiredPower = -this.batteryMaxDischarge * 0.15; // slow discharge near target
      }
    } else {
      // Shoulder — opportunistic: charge from solar surplus, slight discharge otherwise
      if (netLoad < -20 && this.soc < 85) {
        // Solar surplus ≥ 20 kW — store free energy
        const surplus = Math.abs(netLoad);
        desiredPower = Math.min(surplus * 0.8, this.batteryMaxCharge * 0.4);
      } else if (netLoad > 50 && this.soc > 40) {
        // High grid load — slight discharge to help
        desiredPower = -this.batteryMaxDischarge * 0.15;
      }
      // else maintain (desiredPower stays 0)
    }

    // FSM safety check overrides our desired power
    const fsmResult = this.fsm.check(
      this.soc, desiredPower, netLoad, solarOutput,
      { maxCharge: this.batteryMaxCharge, maxDischarge: this.batteryMaxDischarge, capacity: this.batteryCapacity }
    );

    // Smooth charge power transitions
    const targetPower = fsmResult.power;
    const smoothingFactor = 0.4;
    this.chargePower = Math.round((this.chargePower * (1 - smoothingFactor) + targetPower * smoothingFactor) * 10) / 10;

    // Update battery SOC (with 5× demo speedup for clearly visible UI changes)
    const SOC_DEMO_FACTOR = 5;
    const effectiveCapacity = this.degradedCapacity;
    if (this.chargePower > 0) {
      const energyIn = this.chargePower * (1 / 60) * this.batteryEfficiency * SOC_DEMO_FACTOR;
      this.soc = Math.min(100, this.soc + (energyIn / effectiveCapacity) * 100);
      this.totalCycles += (energyIn / effectiveCapacity) * 0.5 / 100;
    } else if (this.chargePower < 0) {
      const energyOut = Math.abs(this.chargePower) * (1 / 60) / this.batteryEfficiency * SOC_DEMO_FACTOR;
      this.soc = Math.max(0, this.soc - (energyOut / effectiveCapacity) * 100);
      this.totalCycles += (energyOut / effectiveCapacity) * 0.5 / 100;
    }
    // Self-discharge: ~0.05% per hour (Li-ion typical). 0.05% = 0.0005 decimal.
    this.soc = Math.max(0, this.soc - 0.0005 * (1 / 60));
    this.soc = Math.round(this.soc * 10) / 10;
    // Degradation: 0.02% capacity loss per full cycle
    this.degradedCapacity = Math.max(
      this.batteryCapacity * 0.5,
      this.batteryCapacity * (1 - this.totalCycles * 0.0002)
    );

    // Grid balance
    const totalSupply = solarOutput + (this.chargePower < 0 ? Math.abs(this.chargePower) : 0);
    let gridImport = 0;
    let gridExport = 0;
    const deficit = totalLoad - totalSupply + (this.chargePower > 0 ? this.chargePower : 0);
    if (deficit > 0) {
      gridImport = Math.round(deficit);
    } else {
      gridExport = Math.round(Math.abs(deficit));
    }

    // Power plants
    const plants: PowerPlantSnapshot[] = SHENZHEN_PLANTS.map((p) => {
      let output = 0;
      let online = false;
      if (p.type === 'nuclear') {
        // Nuclear runs 24/7 at ~90% capacity
        output = Math.round(p.capacity * 0.9);
        online = true;
      } else if (p.type === 'gas') {
        // Gas plants follow load
        const factor = Math.min(1, (totalLoad / 2500) * (0.75 + Math.random() * 0.05));
        output = Math.round(p.capacity * factor);
        online = output > p.capacity * 0.1;
      } else if (p.type === 'coal') {
        const factor = Math.min(1, (totalLoad / 2800) * 0.8);
        output = Math.round(p.capacity * factor);
        online = true;
      } else if (p.type === 'solar') {
        // Solar farm output in MW, follows sun curve
        output = Math.round(p.capacity * (solarOutput / this.solarPeak) * 0.8);
        online = solarOutput > 10;
      } else {
        output = 0;
        online = false;
      }
      return { ...p, output, online };
    });

    // Building lights (for animation): 0 at day, 1 at night
    const buildingLights = hour >= 18 || hour < 6
      ? Math.min(1, (hour >= 18 ? (hour - 17) / 4 : (6 - hour) / 4))
      : Math.max(0, 1 - (hour - 6) / 4);

    // Carbon tracking
    const carbonIntensity = plants
      .filter(p => p.online && p.output > 0)
      .reduce((sum, p) => sum + (this.CARBON_INTENSITY[p.type] || 0) * p.output, 0)
      / Math.max(1, plants.filter(p => p.online && p.output > 0).reduce((s, p) => s + p.output, 0));
    const gridCarbonKg = gridImport * (1 / 60) * carbonIntensity;
    this.totalCarbonKg += gridCarbonKg;
    this.totalSolarKwh += solarOutput * (1 / 60);

    this.history.push({
      simTime: formatSimTime(hour, minute),
      soc: this.soc,
      price,
      gridImport,
      chargePower: this.chargePower,
      totalLoad,
    });
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(this.history.length - this.maxHistory);
    }

    return {
      timestamp: new Date().toISOString(),
      simTime: formatSimTime(hour, minute),
      simHour: hour,
      simMinute: minute,
      zones,
      plants,
      battery: {
        soc: this.soc,
        capacity: this.batteryCapacity,
        chargePower: this.chargePower,
        maxChargeRate: this.batteryMaxCharge,
        maxDischargeRate: this.batteryMaxDischarge,
      },
      grid: {
        price,
        peakType,
        totalLoad,
        totalSupply: Math.round((solarOutput + (this.chargePower < 0 ? Math.abs(this.chargePower) : 0))),
        gridImport,
        gridExport,
      },
      lyapunov: {
        Q: Math.round(this.lyapunov.getQ() * 100) / 100,
        V: this.lyapunov.getV(),
        dynamicV: lyapResult.dynamicV,
        targetSOC: this.lyapunov.getTargetSOC(),
        drift: lyapResult.drift,
        penalty: lyapResult.penalty,
        driftPlusPenalty: lyapResult.dpp,
        actionCount: lyapResult.actionsSearched,
      },
      fsm: {
        state: this.fsm.getState(),
        reason: fsmResult.reason,
      },
      buildingLights: Math.round(buildingLights * 100) / 100,
      history: this.history,
      carbon: {
        totalKg: Math.round(this.totalCarbonKg * 10) / 10,
        intensity: Math.round(carbonIntensity * 1000) / 1000,
        avoidedKg: Math.round(this.totalSolarKwh * carbonIntensity * 10) / 10,
      },
    };
  }
}

// ─── Singleton + Class Export ───────────────────────────────

export { EnergySimulationEngine };

export const energySim = new EnergySimulationEngine();
