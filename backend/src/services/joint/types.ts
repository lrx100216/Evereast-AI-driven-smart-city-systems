// ═══════════════════════════════════════════════════════════════
// Joint Energy-Traffic Optimization — Shared Types
// ═══════════════════════════════════════════════════════════════

// ─── EV Charging Station ────────────────────────────────────

export interface EVChargingStation {
  id: string;
  name: string;
  nameZh: string;
  intersectionId: string;   // which intersection this station is at
  zoneType: string;
  capacity: number;          // max simultaneous charging vehicles
  currentCars: number;       // currently charging
  queueLength: number;       // waiting to charge
  basePrice: number;         // ¥/kWh — baseline electricity price
  currentPrice: number;      // ¥/kWh — dynamic price after solar discount
  solarDiscount: number;     // 0–1, how much solar is reducing the price
  chargeRate: number;        // kW per car
  totalLoad: number;         // kW — total current load from this station
  solarPowered: boolean;     // primarily powered by solar right now
}

// ─── Joint Snapshot ─────────────────────────────────────────

export interface JointSnapshot {
  timestamp: string;
  simTime: string;
  simHour: number;

  // Traffic
  totalVehicles: number;
  avgSpeed: number;
  congestionLevel: number;   // 0–100

  // Energy
  solarOutput: number;       // kW
  batterySoc: number;        // %
  gridPrice: number;         // ¥/kWh
  totalGridLoad: number;     // kW
  gridCarbonIntensity: number; // kg CO2/kWh

  // EV Charging
  stations: EVChargingStation[];
  totalEvLoad: number;       // kW — all stations combined
  evDemandFromCongestion: number; // kW — extra demand driven by traffic

  // Optimization
  lyapunovCost: number;       // electricity cost component
  lyapunovCarbon: number;     // carbon cost component
  lyapunovDPP: number;        // total drift-plus-penalty
  fsmState: string;

  // Notification
  solarSurplus: boolean;
  notifyMessage: string | null;
  notifyMessageZh: string | null;

  // History
  priceHistory: { time: string; price: number; solar: number }[];
  evLoadHistory: { time: string; evLoad: number; congestion: number }[];
}

// ─── Notification ───────────────────────────────────────────

export interface EVNotification {
  id: number;
  timestamp: string;
  message: string;
  messageZh: string;
  stationId: string;
  discountPercent: number;
  currentPrice: number;
  valleyPrice: number;
}
