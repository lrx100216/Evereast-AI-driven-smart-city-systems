// City Foundation Model (CFM) — tensor conversion glue
// flattenCityState: maps CityGlobalState → 384-dim Float32Array
// parseModelOutput:  maps 13-dim output → structured CityGlobalActions

import type { CityGlobalState, CityGlobalActions } from './city-state';
import type { TrafficSignalAction } from './traffic';
import type { EnergyGridState } from './energy';
import type { EnvironmentState } from './weather';
import type { TimeContext } from './city-state';

/** CFM input dimension (total flattened feature count) */
export const CFM_INPUT_DIM = 384;
/** CFM traffic sub-dimension */
export const CFM_TRAFFIC_DIM = 256;
/** CFM energy / environment sub-dimension */
export const CFM_ENERGY_DIM = 128;
/** CFM output dimension (11 signal weights + battery rate + solar angle) */
export const CFM_OUTPUT_DIM = 13;

/** Maximum junction slots for feature alignment */
const MAX_JUNCTION_SLOTS = 16;
/** Features per junction */
const FEAT_PER_JUNCTION = 16;

// ── flattenCityState ────────────────────────────────────────────

/**
 * Flatten the nested CityGlobalState into a 384-dim Float32Array for CFM inference.
 *
 * Feature engineering is rough — fields are normalised and concatenated;
 * many are redundant.  Future work: run feature selection / PCA on the
 * training data to prune the lower-variance dimensions.
 */
export function flattenCityState(state: CityGlobalState): Float32Array {
  const out = new Float32Array(CFM_INPUT_DIM);
  let p = 0;

  // ── Traffic: 256 dims (16 slots × 16 features) ─────────────────
  const junctions = state.traffic ?? [];
  const slotCount = Math.min(junctions.length, MAX_JUNCTION_SLOTS);

  for (let i = 0; i < slotCount; i++) {
    const j = junctions[i];
    if (!j) {
      p += FEAT_PER_JUNCTION;
      continue;
    }
    const q = j.queueByDir ?? ({} as Record<string, number>);
    const s = j.speedByDir ?? ({} as Record<string, number>);
    const c = j.congestionByDir ?? ({} as Record<string, number>);
    const w = j.waitTimeByDir ?? ({} as Record<string, number>);

    // Features 0-3: queue N/S/E/W normalised by 30 vehicles
    out[p++] = clampNorm((q.N ?? 0) / 30);
    out[p++] = clampNorm((q.S ?? 0) / 30);
    out[p++] = clampNorm((q.E ?? 0) / 30);
    out[p++] = clampNorm((q.W ?? 0) / 30);

    // Features 4-7: speed N/S/E/W normalised by 60 km/h
    out[p++] = clampNorm((s.N ?? 0) / 60);
    out[p++] = clampNorm((s.S ?? 0) / 60);
    out[p++] = clampNorm((s.E ?? 0) / 60);
    out[p++] = clampNorm((s.W ?? 0) / 60);

    // Features 8-11: congestion N/S/E/W normalised by 100
    out[p++] = clampNorm((c.N ?? 0) / 100);
    out[p++] = clampNorm((c.S ?? 0) / 100);
    out[p++] = clampNorm((c.E ?? 0) / 100);
    out[p++] = clampNorm((c.W ?? 0) / 100);

    // Features 12-15: wait time + spillover + phase + pedestrian
    const maxW = Math.max(w.N ?? 0, w.S ?? 0, w.E ?? 0, w.W ?? 0, 1);
    out[p++] = clampNorm(maxW / 300);           // max wait normalised by 5 min
    out[p++] = clampNorm(j.spilloverIndex ?? 0);
    out[p++] = clampNorm((j.currentPhase ?? 0) / 4);
    out[p++] = clampNorm((j.pedestrianCount ?? 0) / 50);
  }

  // Pad remaining junction slots with zeros
  while (p < CFM_TRAFFIC_DIM) {
    out[p++] = 0;
  }

  // ── Energy & Environment: 128 dims ─────────────────────────────
  const e = state.energy ?? ({} as EnergyGridState);
  const env = state.environment ?? ({} as EnvironmentState);
  const t = state.time ?? ({} as TimeContext);
  const startE = p; // should be 256

  // Time features (12 dims)
  const h = t.simHour ?? 0;
  const m = t.simMinute ?? 0;
  const hour = h + m / 60;
  out[p++] = Math.sin(2 * Math.PI * hour / 24);
  out[p++] = Math.cos(2 * Math.PI * hour / 24);
  out[p++] = Math.sin(4 * Math.PI * hour / 24);
  out[p++] = Math.cos(4 * Math.PI * hour / 24);
  out[p++] = clampNorm(m / 60);
  out[p++] = clampNorm((t.dayOfWeek ?? 0) / 7);
  out[p++] = clampNorm((t.month ?? 1) / 12);
  out[p++] = clampNorm((t.dayOfMonth ?? 1) / 31);
  out[p++] = (t.isRushHour ?? false) ? 1.0 : 0.0;
  out[p++] = timeOfDayOrdinal(t.timeOfDay);
  out[p++] = clampNorm(h / 24);
  out[p++] = clampNorm(m / 60);

  // Solar irradiance & weather (8 dims)
  out[p++] = clampNorm((e.solarOutput ?? 0) / 400);
  out[p++] = clampNorm(env.cloudCover ?? 0.5);
  out[p++] = clampNorm((env.temperature ?? 25) / 50);
  out[p++] = clampNorm((env.humidity ?? 60) / 100);
  out[p++] = clampNorm((env.lightIntensity ?? 500) / 1000);
  out[p++] = clampNorm((env.windSpeed ?? 0) / 50);
  out[p++] = clampNorm((env.precipitation ?? 0) / 100);
  out[p++] = clampNorm((env.solarEfficiency ?? 0.5));

  // Battery (8 dims)
  out[p++] = clampNorm((e.batterySoc ?? 50) / 100);
  out[p++] = clampNorm((e.batteryTemperature ?? 25) / 60);
  out[p++] = clampNorm(e.batteryDegradation ?? 0);
  out[p++] = clampNorm((e.batteryChargePower ?? 0) / (e.batteryMaxCharge || 150) * 2 + 0.5);
  out[p++] = clampNorm((e.batteryMaxCharge ?? 150) / 300);
  out[p++] = clampNorm((e.batteryMaxDischarge ?? 150) / 300);
  out[p++] = clampNorm(1 - (e.batteryDegradation ?? 0));
  const cp = e.batteryChargePower ?? 0;
  out[p++] = cp > 5 ? 1.0 : cp < -5 ? 0.0 : 0.5;

  // Grid & pricing (8 dims)
  out[p++] = clampNorm((e.gridPrice ?? 0.7) / 1.5);
  out[p++] = peakTypeOrdinal(e.peakType ?? 'shoulder');
  out[p++] = clampNorm((e.gridImport ?? 0) / 3000);
  out[p++] = clampNorm((e.gridExport ?? 0) / 3000);
  out[p++] = clampNorm((e.totalLoad ?? 0) / 3000);
  out[p++] = clampNorm((e.totalSupply ?? 0) / 3000);
  out[p++] = clampNorm(e.lyapunovQ ?? 0);
  out[p++] = fsmStateOrdinal(e.fsmState ?? 'normal');

  // Zone loads (5 zones × 4 features = 20 dims)
  const ZONE_KEYS = ['industrial', 'tech_park', 'commercial', 'school', 'residential'];
  const ZONE_BASE: Record<string, number> = {
    industrial: 850, tech_park: 620, commercial: 720, school: 280, residential: 480,
  };
  for (const zk of ZONE_KEYS) {
    const load = e.zoneLoads?.[zk] ?? 0;
    const base = ZONE_BASE[zk] ?? 500;
    out[p++] = clampNorm(load / base);
    out[p++] = clampNorm(load / Math.max(1, e.totalLoad ?? 1));
    out[p++] = clampNorm(load / (base * 1.5));
    out[p++] = clampNorm(load / (base * 0.5));
  }

  // Plant outputs (5 plants × 4 features = 20 dims)
  const PLANT_KEYS = ['daya-bay', 'mawan', 'qianwan', 'shenzhen-energy', 'guangming'];
  const PLANT_CAP: Record<string, number> = {
    'daya-bay': 1968, mawan: 1170, qianwan: 780, 'shenzhen-energy': 640, guangming: 120,
  };
  for (const pk of PLANT_KEYS) {
    const output = e.plantOutputs?.[pk] ?? 0;
    const cap = PLANT_CAP[pk] ?? 100;
    const online = e.plantOnline?.[pk] ?? false;
    out[p++] = clampNorm(output / cap);
    out[p++] = online ? 1.0 : 0.0;
    out[p++] = clampNorm(output / Math.max(1, (e.totalSupply ?? 1) / 1000));
    out[p++] = output > 1 ? 1.0 : 0.0;
  }

  // Carbon (8 dims)
  out[p++] = clampNorm((e.carbonTotalKg ?? 0) / 10000);
  out[p++] = clampNorm(e.carbonIntensity ?? 0.5);
  out[p++] = clampNorm((e.carbonAvoidedKg ?? 0) / 5000);
  out[p++] = clampNorm(0.06); // carbon price ¥/kg CO₂
  out[p++] = clampNorm((e.carbonTotalKg ?? 0) / 5000);
  out[p++] = clampNorm((e.carbonIntensity ?? 0.5) * 2);
  out[p++] = e.carbonAvoidedKg > 0 ? 1.0 : 0.0;
  out[p++] = (e.carbonIntensity ?? 0.5) > 0.6 ? 1.0 : 0.0;

  // Hardware sensors (8 dims)
  out[p++] = clampNorm((env.hardwareTemperature ?? 25) / 50);
  out[p++] = clampNorm((env.hardwareHumidity ?? 60) / 100);
  out[p++] = clampNorm((env.hardwareLdrValue ?? 500) / 1023);
  out[p++] = clampNorm((env.solarFactor ?? 0.5));
  out[p++] = clampNorm((env.weatherCode ?? 0) / 100);
  out[p++] = (env.temperature ?? 25) > 35 ? 1.0 : 0.0;
  out[p++] = (env.humidity ?? 60) > 85 ? 1.0 : 0.0;
  out[p++] = (env.cloudCover ?? 0.5) > 0.7 ? 1.0 : 0.0;

  // Calendar & meta (8 dims)
  out[p++] = clampNorm((t.dayOfWeek ?? 0) / 7);
  out[p++] = (t.dayOfWeek ?? 0) >= 5 ? 1.0 : 0.0;
  out[p++] = clampNorm((t.month ?? 1) / 12);
  out[p++] = t.isRushHour ? 1.0 : 0.0;
  out[p++] = clampNorm((t.simHour ?? 0) / 24);
  out[p++] = clampNorm((t.simMinute ?? 0) / 60);
  out[p++] = (t.month ?? 1) >= 5 && (t.month ?? 1) <= 9 ? 1.0 : 0.0;
  out[p++] = 0.0; // reserved

  // Fill remaining energy dims to exactly 128
  while (p - startE < CFM_ENERGY_DIM) {
    out[p++] = 0;
  }

  // Safety: if for any reason we overshot 384, truncate
  return out.slice(0, CFM_INPUT_DIM) as Float32Array;
}

// ── parseModelOutput ────────────────────────────────────────────

/**
 * Parse the CFM's 13-dim output back into structured CityGlobalActions.
 *
 * Phase mapping logic is ad-hoc: weight × 4 then floor.
 * Could be improved with learned embeddings per junction.
 */
export function parseModelOutput(
  output: number[] | Float32Array,
  timestamp?: string,
  junctionIds?: string[],
): CityGlobalActions {
  if (!output || output.length < CFM_OUTPUT_DIM) {
    throw new Error(
      `parseModelOutput: expected at least ${CFM_OUTPUT_DIM} values, got ${output?.length ?? 0}`,
    );
  }

  const ts = timestamp ?? new Date().toISOString();

  // Default junction IDs (11 junctions across 5 zones)
  const defaultIds = [
    'ind-1', 'ind-2', 'tech-1', 'tech-2', 'com-1', 'com-2',
    'res-1', 'res-2', 'res-3', 'sch-1', 'sch-2',
  ];

  const ids = junctionIds ?? defaultIds;

  // Parse 11 traffic signals (dims 0-10)
  const trafficSignals: TrafficSignalAction[] = [];
  for (let i = 0; i < 11; i++) {
    const raw = output[i] ?? 0.5;
    const weight = clamp(raw, 0.01, 0.99);
    const targetPhase = Math.min(3, Math.floor(weight * 4));
    const greenDuration = Math.round(5 + weight * 85);

    trafficSignals.push({
      junctionId: ids[i] ?? `junction-${i}`,
      targetPhase,
      greenDuration,
    });
  }

  // Parse battery charge rate (dim 11)
  const batteryRaw = output[11] ?? 0;
  const batteryChargeRate = clamp(batteryRaw, -1, 1);

  // Parse solar panel angle (dim 12)
  const solarRaw = output[12] ?? 90;
  const solarPanelAngle = clamp(solarRaw, 0, 180);

  return {
    timestamp: ts,
    trafficSignals,
    batteryChargeRate: Math.round(batteryChargeRate * 1000) / 1000,
    solarPanelAngle: Math.round(solarPanelAngle * 10) / 10,
  };
}

// ── Internal Helpers ────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampNorm(v: number): number {
  return clamp(v, 0, 1);
}

function timeOfDayOrdinal(tod?: string): number {
  const map: Record<string, number> = {
    dawn: 0.0, morning: 0.2, noon: 0.4, afternoon: 0.6, evening: 0.8, night: 1.0,
  };
  return map[tod ?? 'morning'] ?? 0.2;
}

function peakTypeOrdinal(pt?: string): number {
  const map: Record<string, number> = { valley: 0.0, shoulder: 0.5, peak: 1.0 };
  return map[pt ?? 'shoulder'] ?? 0.5;
}

function fsmStateOrdinal(fs?: string): number {
  const map: Record<string, number> = {
    normal: 0.25, limit_protect: 0.5, anti_backflow: 0.75, dead_zone: 1.0,
  };
  return map[fs ?? 'normal'] ?? 0.25;
}
