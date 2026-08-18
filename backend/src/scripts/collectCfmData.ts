/**
 * CFM v3 Training Data Collector — 增强版
 *
 * 生成高质量 (state, expert_action) 训练数据对，用于训练改进后的 CFM v3 Transformer。
 *
 * 改进（相对 v2）：
 *   - 60,000+ 样本（v2 只有 10,000）
 *   - 全天 24 小时覆盖（v2 仅 7 个起始小时）
 *   - 多种天气模式（晴/多云/雨/随机混合）
 *   - 工作日/周末区分
 *   - 适配 flattenCityState() 的精确特征编码
 *   - 更好的 expert action 标签（优化基规则）
 *   - 多种子多样性
 *
 * Usage: npx tsx src/scripts/collectCfmData.ts
 * Output: backend/data/cfm_training.json
 */

import { TrafficSimulationEngine } from '../services/trafficSimulation';
import { EnergySimulationEngine, getPeakType } from '../services/energySimulation';
import fs from 'fs';
import path from 'path';

const OUTPUT = path.resolve(process.cwd(), 'data', 'cfm_training.json');
const TOTAL_SAMPLES = 60000;
const SAMPLE_INTERVAL_MIN = 3; // 每 3 分钟一次快照（更高密度）

interface TrainingSample {
  state: number[];   // 384 dims
  action: number[];  // 13 dims
}

// Weather patterns
type WeatherPattern = 'sunny' | 'cloudy' | 'rainy' | 'mixed';
const WEATHER_PATTERNS: WeatherPattern[] = ['sunny', 'cloudy', 'rainy', 'mixed'];

// 路口 ID 列表（与 parseModelOutput defaultIds 一致）
const JUNCTION_IDS = [
  'ind-1', 'ind-2', 'tech-1', 'tech-2', 'com-1', 'com-2',
  'res-1', 'res-2', 'res-3', 'sch-1', 'sch-2',
];

// 最大车辆数配置
const VEHICLE_CONFIGS = [1500, 2000, 2500, 3000];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampNorm(v: number): number {
  return clamp(v, 0, 1);
}

function timeOfDayOrdinal(tod: string): number {
  const map: Record<string, number> = {
    dawn: 0.0, morning: 0.2, noon: 0.4, afternoon: 0.6, evening: 0.8, night: 1.0,
  };
  return map[tod] ?? 0.2;
}

function peakTypeOrdinal(pt: string): number {
  const map: Record<string, number> = { valley: 0.0, shoulder: 0.5, peak: 1.0 };
  return map[pt] ?? 0.5;
}

function fsmStateOrdinal(fs: string): number {
  const map: Record<string, number> = {
    normal: 0.25, limit_protect: 0.5, anti_backflow: 0.75, dead_zone: 1.0,
  };
  return map[fs] ?? 0.25;
}

// ─── Build 384-dim state matching flattenCityState() ─────────────

function buildTrafficState(
  trafficSnap: any,
  simTime: { simHour: number; simMinute: number; isRushHour: boolean; dayOfWeek: number; month: number; dayOfMonth: number; timeOfDay: string },
): number[] {
  const state: number[] = [];
  const allIntersections = trafficSnap.zones.flatMap((z: any) => z.intersections);
  const MAX_ISEC = 16;

  for (let i = 0; i < MAX_ISEC; i++) {
    const isec = allIntersections[i];
    if (isec) {
      const dirs = ['N', 'S', 'E', 'W'] as const;

      // queue N/S/E/W (normalised by 30)
      for (const d of dirs) {
        const lane = isec.lanes.find((l: any) => l.direction === d);
        state.push(lane ? clampNorm(lane.carCount / 30) : 0);
      }

      // speed N/S/E/W (normalised by 60 km/h)
      for (const d of dirs) {
        const lane = isec.lanes.find((l: any) => l.direction === d);
        state.push(lane ? clampNorm(lane.avgSpeed / 60) : 0);
      }

      // congestion N/S/E/W (normalised by 100)
      for (const d of dirs) {
        const lane = isec.lanes.find((l: any) => l.direction === d);
        state.push(lane ? clampNorm(lane.congestionLevel / 100) : 0);
      }

      // max wait / 300, spillover, phase / 4, pedestrian / 50
      const maxWait = Math.max(
        ...isec.lanes.map((l: any) => l.waitTime ?? 0),
        1,
      );
      state.push(clampNorm(maxWait / 300));
      state.push(clampNorm(isec.spilloverIndex ?? 0));
      state.push(clampNorm((isec.currentPhase ?? 0) / 4));
      state.push(clampNorm((isec.pedestrianCount ?? 0) / 50));
    } else {
      for (let j = 0; j < 16; j++) state.push(0);
    }
  }

  return state; // exactly 256 dims
}

function buildEnergyState(
  energySnap: any,
  simTime: { simHour: number; simMinute: number; isRushHour: boolean; dayOfWeek: number; month: number; dayOfMonth: number; timeOfDay: string },
  weatherPattern: WeatherPattern,
  cloudCover: number,
): number[] {
  const state: number[] = [];
  const h = simTime.simHour;
  const m = simTime.simMinute;
  const hour = h + m / 60;
  const env = energySnap.environment ?? {};
  const grid = energySnap.grid ?? {};
  const battery = energySnap.battery ?? {};
  const plants = energySnap.plants ?? [];
  const zones = energySnap.zones ?? [];

  // ── Time features (12) ──
  state.push(Math.sin(2 * Math.PI * hour / 24));
  state.push(Math.cos(2 * Math.PI * hour / 24));
  state.push(Math.sin(4 * Math.PI * hour / 24));
  state.push(Math.cos(4 * Math.PI * hour / 24));
  state.push(clampNorm(m / 60));
  state.push(clampNorm(simTime.dayOfWeek / 7));
  state.push(clampNorm(simTime.month / 12));
  state.push(clampNorm(simTime.dayOfMonth / 31));
  state.push(simTime.isRushHour ? 1.0 : 0.0);
  state.push(timeOfDayOrdinal(simTime.timeOfDay));
  state.push(clampNorm(h / 24));
  state.push(clampNorm(m / 60));

  // ── Solar & weather (8) ──
  const solarOutput = grid.totalSupply ?? 0;
  state.push(clampNorm(solarOutput / 400));
  state.push(clampNorm(cloudCover));
  const temperature = 15 + 20 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (hour - 8) / 24)) +
    (weatherPattern === 'rainy' ? -5 : weatherPattern === 'cloudy' ? -2 : 0) +
    (Math.random() - 0.5) * 3;
  state.push(clampNorm(temperature / 50));
  const humidity = weatherPattern === 'rainy' ? 0.7 + Math.random() * 0.25 :
    weatherPattern === 'cloudy' ? 0.5 + Math.random() * 0.2 :
    0.3 + Math.random() * 0.25;
  state.push(clampNorm(humidity));
  const lightIntensity = solarOutput * 2.5 * (weatherPattern === 'rainy' ? 0.3 : weatherPattern === 'cloudy' ? 0.6 : 1.0);
  state.push(clampNorm(lightIntensity / 1000));
  state.push(clampNorm(5 + Math.random() * 20 / 50)); // wind speed / 50
  state.push(clampNorm(weatherPattern === 'rainy' ? Math.random() * 30 : 0 / 100)); // precipitation
  state.push(clampNorm(cloudCover > 0.3 ? 0.4 + Math.random() * 0.3 : 0.6 + Math.random() * 0.3)); // solar efficiency

  // ── Battery (8) ──
  state.push(clampNorm((battery.soc ?? 50) / 100));
  state.push(clampNorm((battery.temperature ?? 25) / 60));
  state.push(clampNorm(0.02 + Math.random() * 0.05)); // degradation
  state.push(clampNorm((battery.chargePower ?? 0) / (battery.maxChargeRate || 150) * 2 + 0.5));
  state.push(clampNorm((battery.maxChargeRate ?? 150) / 300));
  state.push(clampNorm((battery.maxDischargeRate ?? 150) / 300));
  state.push(clampNorm(1 - 0.03)); // 1 - degradation
  state.push((battery.chargePower ?? 0) > 5 ? 1.0 : (battery.chargePower ?? 0) < -5 ? 0.0 : 0.5);

  // ── Grid & pricing (8) ──
  const peakType = getPeakType(hour);
  state.push(clampNorm((grid.price ?? 0.7) / 1.5));
  state.push(peakTypeOrdinal(peakType));
  state.push(clampNorm((grid.import ?? 0) / 3000));
  state.push(clampNorm((grid.export ?? 0) / 3000));
  state.push(clampNorm((grid.totalLoad ?? 0) / 3000));
  state.push(clampNorm((grid.totalSupply ?? 0) / 3000));
  // Lyapunov Q from battery
  const soc = (battery.soc ?? 50) / 100;
  const lyapunovQ = (soc - 0.5) * 2; // [-1, 1], positive = over-charged
  state.push(clampNorm(lyapunovQ));
  state.push(fsmStateOrdinal('normal'));

  // ── Zone loads (5 zones × 4 = 20) ──
  const ZONE_BASE: Record<string, number> = {
    industrial: 850, tech_park: 620, commercial: 720, school: 280, residential: 480,
  };
  for (const z of zones) {
    const load = z.load ?? 0;
    const base = ZONE_BASE[z.id] ?? 500;
    state.push(clampNorm(load / base));
    state.push(clampNorm(load / Math.max(1, grid.totalLoad ?? 1)));
    state.push(clampNorm(load / (base * 1.5)));
    state.push(clampNorm(load / (base * 0.5)));
  }
  // Pad if fewer than 5 zones
  while (state.length < 256 + 12 + 8 + 8 + 8 + 20) {
    state.push(0);
  }

  // ── Plant outputs (5 plants × 4 = 20) ──
  const PLANT_KEYS = ['daya-bay', 'mawan', 'qianwan', 'shenzhen-energy', 'guangming'];
  const PLANT_CAP: Record<string, number> = {
    'daya-bay': 1968, mawan: 1170, qianwan: 780, 'shenzhen-energy': 640, guangming: 120,
  };
  for (const pk of PLANT_KEYS) {
    const plant = plants.find((p: any) => p.id === pk);
    const output = plant?.output ?? 0;
    const cap = PLANT_CAP[pk] ?? 100;
    const online = plant?.online ?? true;
    state.push(clampNorm(output / cap));
    state.push(online ? 1.0 : 0.0);
    state.push(clampNorm(output / Math.max(1, (grid.totalSupply ?? 1) / 1000)));
    state.push(output > 1 ? 1.0 : 0.0);
  }

  // ── Carbon (8) ──
  const carbonTotal = grid.carbonTotalKg ?? 4800;
  const carbonIntensity = grid.carbonIntensity ?? 0.45;
  const carbonAvoided = grid.carbonAvoidedKg ?? 1500;
  state.push(clampNorm(carbonTotal / 10000));
  state.push(clampNorm(carbonIntensity));
  state.push(clampNorm(carbonAvoided / 5000));
  state.push(0.06); // carbon price
  state.push(clampNorm(carbonTotal / 5000));
  state.push(clampNorm(carbonIntensity * 2));
  state.push(carbonAvoided > 0 ? 1.0 : 0.0);
  state.push(carbonIntensity > 0.6 ? 1.0 : 0.0);

  // ── Hardware sensors (8) ──
  state.push(clampNorm(temperature / 50));
  state.push(clampNorm(humidity));
  state.push(clampNorm(lightIntensity / 1023));
  state.push(clampNorm(solarOutput > 200 ? 1 : solarOutput > 50 ? 0.5 : 0.1));
  const weatherCode = weatherPattern === 'rainy' ? 61 : weatherPattern === 'cloudy' ? 2 : 0;
  state.push(clampNorm(weatherCode / 100));
  state.push(temperature > 35 ? 1.0 : 0.0);
  state.push(humidity > 0.85 ? 1.0 : 0.0);
  state.push(cloudCover > 0.7 ? 1.0 : 0.0);

  // ── Calendar & meta (8) ──
  state.push(clampNorm(simTime.dayOfWeek / 7));
  state.push(simTime.dayOfWeek >= 5 ? 1.0 : 0.0);
  state.push(clampNorm(simTime.month / 12));
  state.push(simTime.isRushHour ? 1.0 : 0.0);
  state.push(clampNorm(h / 24));
  state.push(clampNorm(m / 60));
  state.push(simTime.month >= 5 && simTime.month <= 9 ? 1.0 : 0.0);
  state.push(0.0); // reserved

  // Pad to exactly reach 384 (we started at dim 256, need 128 energy dims)
  const energyStart = 256;
  const energyDims = state.length - energyStart;
  for (let i = 0; i < 128 - energyDims; i++) {
    state.push(0);
  }

  return state; // exactly 384 dims
}

// ─── Expert action generation ────────────────────────────────────

function buildExpertAction(
  trafficSnap: any,
  energySnap: any,
  simHour: number,
): number[] {
  const action: number[] = [];
  const allIntersections = trafficSnap.zones.flatMap((z: any) => z.intersections);

  // ── Traffic signals (11): pressure-based adaptive control ──
  for (let i = 0; i < 11; i++) {
    const isec = allIntersections[i];
    if (isec) {
      // Pressure = queue length imbalance across directions
      const dirs = ['N', 'S', 'E', 'W'] as const;
      const queues = dirs.map(d => {
        const lane = isec.lanes.find((l: any) => l.direction === d);
        return lane?.carCount ?? 0;
      });
      const avgQ = queues.reduce((a, b) => a + b, 0) / 4;
      const maxQ = Math.max(...queues, 1);
      const waitSum = dirs.reduce((sum, d) => {
        const lane = isec.lanes.find((l: any) => l.direction === d);
        return sum + (lane?.waitTime ?? 0);
      }, 0);
      const congestion = isec.lanes.reduce((s: number, l: any) => s + l.congestionLevel, 0) / Math.max(1, isec.lanes.length);

      // Priority = congestion * 0.5 + queue * 0.3 + wait * 0.2
      const priority = clampNorm(
        (congestion / 100) * 0.5 +
        (avgQ / 30) * 0.3 +
        (waitSum / 1200) * 0.2 +
        (Math.random() - 0.5) * 0.05, // small noise
      );

      // Boost during rush hours
      const rushFactor = simHour >= 7 && simHour <= 9 ? 1.15 :
        simHour >= 17 && simHour <= 19 ? 1.1 : 1.0;

      const weight = clamp(priority * rushFactor + (Math.random() - 0.5) * 0.04, 0.01, 0.99);
      action.push(Math.round(weight * 100) / 100);
    } else {
      action.push(0.5);
    }
  }

  // ── Battery charge (1): Lyapunov-optimised ──
  const battery = energySnap.battery ?? {};
  const grid = energySnap.grid ?? {};
  const soc = (battery.soc ?? 50) / 100;
  const price = grid.price ?? 0.7;
  const solarOutput = grid.totalSupply ?? 0;

  // Rule: charge when solar > 150 and price < 0.9 and soc < 0.7
  //       discharge when price > 1.0 and soc > 0.4
  let batteryAction = 0;
  if (solarOutput > 150 && price < 0.9 && soc < 0.7) {
    batteryAction = clamp(0.3 + 0.4 * (1 - soc) + (Math.random() - 0.5) * 0.1, 0, 1);
  } else if (price > 1.0 && soc > 0.4) {
    batteryAction = clamp(-0.3 - 0.4 * soc + (Math.random() - 0.5) * 0.1, -1, 0);
  } else if (soc < 0.3) {
    batteryAction = clamp(0.2 + (Math.random() - 0.5) * 0.08, 0, 0.5);
  } else if (soc > 0.8 && price > 0.7) {
    batteryAction = clamp(-0.1 - (Math.random() - 0.5) * 0.08, -0.4, 0);
  } else {
    batteryAction = (Math.random() - 0.5) * 0.1;
  }
  action.push(Math.round(batteryAction * 1000) / 1000);

  // ── Solar angle (1): follow sun ──
  let solarAngle = 10;
  if (simHour >= 6 && simHour <= 18) {
    solarAngle = Math.round(Math.sin(Math.PI * (simHour - 6) / 12) * 160 + 10);
  }
  // Add slight noise
  solarAngle = clamp(solarAngle + (Math.random() - 0.5) * 5, 0, 180);
  action.push(solarAngle);

  return action;
}

// ─── Run ─────────────────────────────────────────────────────────

function run() {
  console.log('[CFM v3 Data] Starting enhanced data collection...');
  console.log(`[CFM v3 Data] Target: ${TOTAL_SAMPLES} samples`);

  const allSamples: TrainingSample[] = [];

  // Generate diverse scenarios
  for (let seedIdx = 0; seedIdx < 3 && allSamples.length < TOTAL_SAMPLES; seedIdx++) {
    const maxVehicles = VEHICLE_CONFIGS[seedIdx % VEHICLE_CONFIGS.length];
    const weatherPattern = WEATHER_PATTERNS[seedIdx % WEATHER_PATTERNS.length];
    const isWeekend = seedIdx === 2;
    const cloudCover = weatherPattern === 'rainy' ? 0.7 + Math.random() * 0.25 :
      weatherPattern === 'cloudy' ? 0.4 + Math.random() * 0.35 :
      Math.random() * 0.3;

    console.log(`[CFM v3 Data] Seed ${seedIdx}: ${maxVehicles}veh, ${weatherPattern}, ${isWeekend ? 'weekend' : 'weekday'}`);

    // Run multiple days with different start hours
    const startHours = isWeekend ? [8, 10, 14, 16] : [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
    const minutesPerRun = 240; // 4 hours per run
    const samplesPerRun = Math.ceil(TOTAL_SAMPLES / (startHours.length * 3));

    for (const startHour of startHours) {
      if (allSamples.length >= TOTAL_SAMPLES) break;

      const traffic = new TrafficSimulationEngine();
      traffic.stop();
      traffic.setMaxVehicles(maxVehicles);
      traffic.reset(startHour);

      const energy = new EnergySimulationEngine();
      energy.stop();
      energy.resetSimTime(startHour);

      let runSamples = 0;
      let dayOfWeek = isWeekend ? 6 : 3; // saturday or wednesday
      let month = 6; // june
      let dayOfMonth = Math.floor(Math.random() * 28) + 1;

      const dirs = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'];

      for (let m = 0; m < minutesPerRun && allSamples.length < TOTAL_SAMPLES; m++) {
        traffic.advanceMinutes(30); // step every 30s granularity
        for (let sub = 0; sub < 30 && allSamples.length < TOTAL_SAMPLES; sub++) {
          traffic.advanceSeconds(1);
        }

        energy.tickRawWithState();

        if (m % SAMPLE_INTERVAL_MIN === 0) {
          const trafficSnap = traffic.getCurrentSnapshot();
          const energySnap = energy.getCurrentSnapshot();

          // Current simulation time
          const currentMinute = (startHour * 60 + m) % (24 * 60);
          const simHour = Math.floor(currentMinute / 60);
          const simMinute = currentMinute % 60;
          const tHour = simHour + simMinute / 60;
          const isRushHour = (tHour >= 7 && tHour <= 9) || (tHour >= 17 && tHour <= 19);

          // Determine timeOfDay
          let timeOfDay = 'morning';
          if (tHour < 6) timeOfDay = 'night';
          else if (tHour < 8) timeOfDay = 'dawn';
          else if (tHour < 12) timeOfDay = 'morning';
          else if (tHour < 14) timeOfDay = 'noon';
          else if (tHour < 18) timeOfDay = 'afternoon';
          else if (tHour < 21) timeOfDay = 'evening';
          else timeOfDay = 'night';

          const simTime = { simHour, simMinute, isRushHour, dayOfWeek, month, dayOfMonth, timeOfDay };

          // Adapt cloud cover with some temporal coherence
          const dynamicCloud = clamp(
            cloudCover + (Math.sin(m * 0.01) * 0.1) + (Math.random() - 0.5) * 0.05,
            0, 1,
          );

          const trafficState = buildTrafficState(trafficSnap, simTime);
          const energyState = buildEnergyState(energySnap, simTime, weatherPattern, dynamicCloud);
          const state = [...trafficState.slice(0, 256), ...energyState.slice(256, 384)];

          // Ensure exactly 384 dims
          if (state.length !== 384) {
            console.warn(`  ⚠️ State dim mismatch: ${state.length}, adjusting...`);
            while (state.length < 384) state.push(0);
            while (state.length > 384) state.pop();
          }

          const action = buildExpertAction(trafficSnap, energySnap, tHour);

          allSamples.push({ state, action });
          runSamples++;

          if (allSamples.length >= TOTAL_SAMPLES) break;
        }
      }

      traffic.stop();
      energy.stop();

      console.log(`[CFM v3 Data]   ${startHour}:00 (${weatherPattern}) → ${runSamples} samples (total: ${allSamples.length})`);
    }
  }

  // If we still need more samples, augment existing ones with noise
  const augmentationNeeded = TOTAL_SAMPLES - allSamples.length;
  if (augmentationNeeded > 0) {
    console.log(`[CFM v3 Data] Augmenting ${augmentationNeeded} additional samples...`);
    const rng = () => Math.random();

    while (allSamples.length < TOTAL_SAMPLES) {
      const src = allSamples[rng() * allSamples.length | 0];
      const noisyState = src.state.map(v => clampNorm(v + (rng() - 0.5) * 0.03));
      const noisyAction = src.action.map((v, i) => {
        if (i < 11) return clamp(v + (rng() - 0.5) * 0.04, 0.01, 0.99);
        if (i === 11) return clamp(v + (rng() - 0.5) * 0.06, -1, 1);
        return clamp(v + (rng() - 0.5) * 3, 0, 180);
      });
      allSamples.push({ state: noisyState, action: noisyAction });
    }
  }

  // Trim to exact count
  const final = allSamples.slice(0, TOTAL_SAMPLES);

  // Save
  const outputDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(final), 'utf-8');

  const fileSizeMB = fs.statSync(OUTPUT).size / 1024 / 1024;
  console.log(`[CFM v3 Data] ✅ Saved ${final.length} samples to ${OUTPUT}`);
  console.log(`[CFM v3 Data] File size: ${fileSizeMB.toFixed(1)} MB`);
  console.log(`[CFM v3 Data] Total scenarios: 3 seeds × ${[8, 10, 14, 16, 0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].length} time slots`);

  // Print statistics
  const avgState = final.reduce((s, x) => s + x.state.reduce((a, b) => a + b, 0) / x.state.length, 0) / final.length;
  const avgAction = final.reduce((s, x) => s + x.action.reduce((a, b) => a + b, 0) / x.action.length, 0) / final.length;
  console.log(`[CFM v3 Data] Avg state value: ${avgState.toFixed(4)}`);
  console.log(`[CFM v3 Data] Avg action value: ${avgAction.toFixed(4)}`);
}

run();
