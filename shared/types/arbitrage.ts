// Cross-Domain Causal Arbitrage type definitions
// The core concept: treat EV traffic flow as "mobile battery mass" for grid regulation
//
// Data flow: Weather → Solar Efficiency → Grid Stress → EV Pricing → Traffic Diversion

import type { Direction } from './common';

// ─── Zone / Sector Definitions ─────────────────────────────────

/** Zone grouping: stressed (Sector A) vs safe (Sector B) vs buffer */
export type SectorType = 'A_stressed' | 'B_safe' | 'buffer';

export interface SectorAssignment {
  zoneType: string;
  sector: SectorType;
  /** Station IDs in this sector */
  stationIds: number[];
  /** Intersection indices in this sector */
  intersectionIndices: number[];
}

// ─── Grid Stress Model ─────────────────────────────────────────

export interface GridStressInput {
  /** Cloud cover [0, 1] — from weather API or DHT11 simulator */
  cloudCover: number;
  /** Solar efficiency [0, 1] from weather service */
  solarEfficiency: number;
  /** Temperature (°C) */
  temperature: number;
  /** Current total load (kW) */
  totalLoad: number;
  /** Peak type: 'valley' | 'shoulder' | 'peak' */
  peakType: string;
  /** Battery state of charge [0, 100] */
  batterySoc: number;
  /** Forecast period (minutes ahead) */
  forecastMinutes: number;
}

export interface ZoneStressForecast {
  /** Zone type identifier */
  zoneType: string;
  /** Sector this zone belongs to */
  sector: SectorType;
  /** Grid stress probability [0, 1] */
  stressProbability: number;
  /** Expected solar efficiency drop [0, 1] */
  solarDrop: number;
  /** Expected load surge ratio (1.0 = normal) */
  loadSurgeRatio: number;
  /** Risk level */
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface GridStressSnapshot {
  timestamp: string;
  /** Per-zone stress forecasts */
  zones: ZoneStressForecast[];
  /** Aggregate sector-level stress */
  sectorA: { avgStress: number; maxStress: number; riskLevel: string };
  sectorB: { avgStress: number; maxStress: number; riskLevel: string };
  /** Weather context that triggered this */
  weatherContext: {
    cloudCover: number;
    solarEfficiency: number;
    isRaining: boolean;
  };
}

// ─── Lyapunov Pricing ─────────────────────────────────────────

export interface PricingSignal {
  /** Charging station ID */
  stationId: number;
  /** Zone type this station belongs to */
  zoneType: string;
  /** Sector type */
  sector: SectorType;
  /** Base price (¥/kWh) before arbitrage adjustment */
  basePrice: number;
  /** Adjusted price (¥/kWh) after arbitrage */
  adjustedPrice: number;
  /** Price delta (positive = raised, negative = lowered) */
  priceDelta: number;
  /** Direction indicator */
  direction: 'raise' | 'lower' | 'unchanged';
  /** Reason for the adjustment */
  reason: string;
  /** Recommended EV diversion intensity [0, 1] */
  diversionSignal: number;
}

export interface LyapunovPricingSnapshot {
  timestamp: string;
  /** All station pricing decisions */
  stations: PricingSignal[];
  /** Sector A aggregate (stressed — prices raised) */
  sectorA: { avgPrice: number; avgDelta: number; stationCount: number };
  /** Sector B aggregate (safe — prices lowered) */
  sectorB: { avgPrice: number; avgDelta: number; stationCount: number };
  /** Lyapunov virtual queue Q(t) */
  lyapunovQ: number;
  /** Lyapunov drift Δ(t) */
  lyapunovDrift: number;
}

// ─── Traffic Diversion ─────────────────────────────────────────

export interface DiversionMetrics {
  /** Number of vehicles diverted from Sector A to Sector B in last tick */
  divertedCount: number;
  /** Cumulative diverted vehicles */
  totalDiverted: number;
  /** Intersections with active red extension */
  redExtendedIntersections: number[];
  /** MARL actions taken for diversion */
  activeActions: {
    intersectionIndex: number;
    actionType: 'extend_red' | 'push_reroute' | 'normal';
    intensity: number;
  }[];
  /** Effectiveness metric [0, 1] */
  diversionEffectiveness: number;
  /** EV vehicles in each sector */
  evCount: { sectorA: number; sectorB: number };
}

// ─── Mobile Battery Model (V2G) ────────────────────────────────

export interface MobileBatteryState {
  /** Total EV count city-wide */
  totalEvCount: number;
  /** Estimated aggregate battery capacity (kWh) */
  totalCapacityKwh: number;
  /** Aggregate SOC across all EVs [0, 1] */
  aggregateSoc: number;
  /** V2G discharge potential (kW) */
  v2gDischargeKw: number;
  /** Per-sector breakdown */
  bySector: {
    sector: SectorType;
    evCount: number;
    capacityKwh: number;
    avgSoc: number;
    dischargeKw: number;
  }[];
  /** Current V2G active status */
  isInjecting: boolean;
  /** Current injection rate (kW) */
  injectionRateKw: number;
}

// ─── Full Arbitrage Snapshot (single socket event) ─────────────

export interface ArbitrageSnapshot {
  timestamp: string;
  isActive: boolean;
  /** Grid stress — cause */
  gridStress: GridStressSnapshot;
  /** Pricing decisions — mediator */
  pricing: LyapunovPricingSnapshot;
  /** Traffic diversion — effect */
  diversion: DiversionMetrics;
  /** Mobile battery — side effect */
  mobileBattery: MobileBatteryState;
  /** Causal chain effect estimates */
  causalMetrics: {
    /** ATE: grid stress reduction due to diversion */
    stressReductionAte: number;
    /** ATE: price differential between sectors */
    priceGapAte: number;
    /** Relative change in avg speed */
    speedChange: number;
    /** Relative change in carbon emission */
    carbonChange: number;
  };
  /** Comparison: with vs without arbitrage */
  comparison: {
    without: { gridImport: number; gridCost: number; avgSpeed: number; carbonKg: number };
    withArbitrage: { gridImport: number; gridCost: number; avgSpeed: number; carbonKg: number };
  };
}

// ─── DJI Tello Drone ───────────────────────────────────────────

export interface DroneCommand {
  type: 'takeoff' | 'land' | 'forward' | 'back' | 'left' | 'right' |
        'cw' | 'ccw' | 'up' | 'down' | 'flip' | 'streamon' | 'streamoff';
  value?: number;
}

export interface DroneTelemetry {
  /** Battery percentage [0, 100] */
  battery: number;
  /** Altitude (cm) */
  height: number;
  /** Speed (cm/s) */
  speed: number;
  /** Temperature (°C) */
  temperature: number;
  /** Attitude: roll/pitch/yaw */
  roll: number;
  pitch: number;
  yaw: number;
  /** Distance tof (cm) */
  tof: number;
  /** WiFi SNR */
  wifiSnr: number;
}

export interface DetectionEvent {
  id: string;
  timestamp: string;
  type: 'vehicle' | 'pedestrian' | 'congestion' | 'incident' | 'traffic_light';
  confidence: number;
  /** Bounding box [x, y, width, height] in frame coordinates */
  bbox: [number, number, number, number];
  /** Optional classification label */
  label?: string;
  /** Optional speed estimate (km/h) */
  speedEstimate?: number;
}

export interface DroneFrameResult {
  timestamp: string;
  frameIndex: number;
  detections: DetectionEvent[];
  /** Derived traffic density [0, 1] */
  density: number;
  /** Vehicle count in frame */
  vehicleCount: number;
  /** Processing latency (ms) */
  latencyMs: number;
}
