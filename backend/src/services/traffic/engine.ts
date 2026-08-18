/**
 * Traffic simulation engine — TrafficSimulationEngine class + all simulation logic
 * Extracted from trafficSimulation.ts as part of modular refactoring
 */

import type {
  TrafficSimSnapshot, Traffic3DSnapshot, TrafficMetrics,
  SimZoneType, Direction, ZoneSnapshot, IntersectionSnapshot,
  LaneSnapshot, DirectionSignal, Vehicle3D, Intersection3D,
  RoadSegment,
} from './types';
import {
  VEHICLE_TYPES, randomVehicleType, INTERSECTIONS, INTERSECTION_MAP,
  ROAD_SEGMENTS, SEGMENTS_BY_FROM, SEGMENTS_BY_TO, SEGMENT_MAP,
  OPPOSITE, LEFT_OF, RIGHT_OF, segmentDirection,
} from './network';
import { SignalController } from './signalController';
import { arrivalRate, ZONE_DEMAND } from './zoneDemand';

const DIRECTIONS: Direction[] = ['N', 'S', 'E', 'W'];

interface Vehicle {
  id: number;
  type: string;           // 'car' | 'bus' | 'truck' | 'emergency'
  speed: number;          // m/s
  accel: number;          // m/s² (current acceleration)
  position: number;       // meters from START of current segment (0 = just entered)
  segmentId: string;      // which road segment it's on
  routeRemaining: string[]; // remaining segments to traverse
  turnIntent: 'left' | 'straight' | 'right';  // what it does at next intersection
  waitTime: number;       // seconds spent at speed < 0.5 m/s
  spawned: boolean;       // has entered the network yet
}

// IDM 加速度计算 — Treiber et al. 2000, adapted for emergency scenarios


function idmAccel(vehicle: Vehicle, leader: Vehicle | null, segment: RoadSegment): number {
  const p = VEHICLE_TYPES[vehicle.type];
  const v = Math.max(0, vehicle.speed);
  const v0 = Math.min(p.maxSpeed, segment.speedLimit);

  // Free-road acceleration (no leader)
  const freeAccel = p.maxAccel * (1 - Math.pow(v / v0, 4));
  if (!leader) return freeAccel;

  // Gap to leader (MUST use leader's length, not follower's!)
  const leaderLen = VEHICLE_TYPES[leader.type]?.length ?? 4.5;
  const gap = leader.position - vehicle.position - leaderLen;

  // Collision imminent — use emergency deceleration
  if (gap <= 0) return -p.emergDecel;

  // Standard IDM: Δv = v - v_leader
  const dv = v - leader.speed;
  const sStar = Math.max(0,
    p.minGap + v * p.desiredTimeHeadway + (v * dv) / (2 * Math.sqrt(p.maxAccel * p.comfDecel))
  );

  const s = Math.max(0.1, gap);

  // When gap is critically small relative to desired gap, blend in emergency decel
  const criticalRatio = sStar / s;
  if (criticalRatio > 4) {
    // Emergency: gap is less than 25% of desired — use emergency decel
    const a = p.maxAccel * (1 - Math.pow(v / v0, 4) - criticalRatio * criticalRatio);
    return Math.max(-p.emergDecel, a);
  }

  // Normal IDM — cap at comfortable deceleration
  const a = p.maxAccel * (1 - Math.pow(v / v0, 4) - criticalRatio * criticalRatio);
  return Math.max(-p.comfDecel, Math.min(p.maxAccel, a));
}

interface ZoneDef {
  type: SimZoneType;
  intersections: { id: string; name: string; nameZh: string }[];
}


const ZONE_DEFS: ZoneDef[] = [
  {
    type: 'industrial',
    intersections: [
      { id: 'ind-1', name: 'Industry Rd & Truck Way', nameZh: '工业大道与卡车路' },
      { id: 'ind-2', name: 'Factory Blvd & Warehouse Ave', nameZh: '工厂路与仓储街' },
    ],
  },
  {
    type: 'tech_park',
    intersections: [
      { id: 'tech-1', name: 'Innovation Ave & Code St', nameZh: '创新大道与代码路' },
      { id: 'tech-2', name: 'AI Blvd & Data Dr', nameZh: 'AI大道与数据路' },
    ],
  },
  {
    type: 'school',
    intersections: [
      { id: 'sch-1', name: 'School Rd & Campus Way', nameZh: '学校路与校园街' },
      { id: 'sch-2', name: 'Library Ave & Sports Blvd', nameZh: '图书馆路与运动大道' },
    ],
  },
  {
    type: 'commercial',
    intersections: [
      { id: 'com-1', name: 'Main St & Market Sq', nameZh: '主街与市场广场' },
      { id: 'com-2', name: 'Shopping Blvd & Mall Dr', nameZh: '购物大道与商场路' },
    ],
  },
  {
    type: 'residential',
    intersections: [
      { id: 'res-1', name: 'Garden Rd & Park Ln', nameZh: '花园路与公园巷' },
      { id: 'res-2', name: 'Lake Ave & Tree St', nameZh: '湖滨大道与树林路' },
      { id: 'res-3', name: 'Sunrise Blvd & Moon Dr', nameZh: '日出大道与月亮路' },
    ],
  },
];

// time helpers


function pad(n: number): string { return n.toString().padStart(2, '0'); }

function getTimeOfDay(hour: number): 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' {
  if (hour < 6) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 14) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function isRushHour(hour: number): boolean {
  return (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
}

// pedestrian — 目前只是占位，没做真实的人行仿真

const PEDESTRIAN_BASE: Record<SimZoneType, number> = {
  industrial: 1, tech_park: 2, school: 6, commercial: 5, residential: 3,
};

function formatSimTime(hour: number, minute: number): string {
  const h = Math.floor(hour);
  const m = Math.floor(minute);
  const s = Math.round((minute - m) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


const PHYSICS_DT = 0.25; 


const EMISSION_FACTORS: Record<string, number> = {
  car: 2.3, bus: 8.0, truck: 10.0, emergency: 3.0,
};


class TrafficSimulationEngine {
  private simHour: number;
  private simMinute: number;
  private simSecond = 0;
  private readonly BASE_INTERVAL_MS = 2000; // 2 real seconds per sim-minute at 1×
  private tickIntervalMs = this.BASE_INTERVAL_MS;
  private running = false;
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private tickGeneration = 0; // guards against double-tick chains after setSpeed
  private tickCallbacks: ((snapshot: TrafficSimSnapshot) => void)[] = [];

  private controllers = new Map<string, SignalController>(); // 每个路口一个信号灯

  private vehiclesOnSegment = new Map<string, Vehicle[]>(); // segId -> 车辆列表

  private allVehicles: Vehicle[] = []; // 所有活着的车

  private nextVehicleId = 1; // 自增ID，MARL训练时设cap防止爆内存
  private maxVehicles = 0; // 0 = unlimited
  private exitedCount = 0;
  private spawnedToday = 0;

  private closedSegments = new Set<string>(); // what-if 封路用

  constructor() {
    this.simHour = 6;
    this.simMinute = 0;
    for (const isec of INTERSECTIONS) {
      this.controllers.set(isec.id, new SignalController(isec.id));
    }
    // Initialize vehicle arrays for all segments
    for (const seg of ROAD_SEGMENTS) {
      this.vehiclesOnSegment.set(seg.id, []);
    }
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

  private scheduleTick() {
    const gen = this.tickGeneration;
    this.intervalId = setTimeout(() => {
      // If setSpeed was called after scheduling, don't spawn a second chain
      if (gen !== this.tickGeneration) return;
      try { this.tick(); } catch (e) { console.error('[TrafficSim] tick error:', e); }
      if (this.running && gen === this.tickGeneration) this.scheduleTick();
    }, this.tickIntervalMs);
  }

  reset(startHour = 6) {
    this.simHour = startHour;
    this.simMinute = 0;
    this.simSecond = 0;
    this.allVehicles = [];
    this.exitedCount = 0;
    this.spawnedToday = 0;
    this.nextVehicleId = 1;
    for (const segId of this.vehiclesOnSegment.keys()) {
      this.vehiclesOnSegment.set(segId, []);
    }
    for (const [id] of this.controllers) {
      this.controllers.set(id, new SignalController(id));
    }
  }

  onTick(cb: (snapshot: TrafficSimSnapshot) => void) {
    this.tickCallbacks.push(cb);
  }

  getCurrentSnapshot(): TrafficSimSnapshot {
    return this.buildSnapshot();
  }

  setSignalCycle(intersectionId: string, greenDuration: number, direction?: Direction) {
    const ctrl = this.controllers.get(intersectionId);
    if (!ctrl) return;
    if (direction) {
      ctrl.setGreenDuration(direction, greenDuration);
    } else {
      for (const d of DIRECTIONS) ctrl.setGreenDuration(d, greenDuration);
    }
  }

  setSpeed(speed: number) {
    const clamped = Math.max(0.1, Math.min(20, speed));
    this.tickIntervalMs = Math.round(this.BASE_INTERVAL_MS / clamped);
    if (this.running) {
      // Cancel any pending tick and start a new generation.
      // The generation counter prevents the old tick callback (which may
      // have already fired before clearTimeout took effect) from spawning
      // a competing scheduleTick chain.
      this.tickGeneration++;
      if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
      }
      this.scheduleTick();
    }
  }

  getSpeed(): number {
    // Return raw speed (not rounded to 1 decimal) for precision
    return Math.round((this.BASE_INTERVAL_MS / this.tickIntervalMs) * 100) / 100;
  }

  /** Set max vehicles cap (0 = unlimited). Surplus spawning is skipped. */
  setMaxVehicles(max: number) {
    this.maxVehicles = Math.max(0, max);
  }

  getVehicleCount(): number {
    return this.allVehicles.length;
  }

  getExitedCount(): number {
    return this.exitedCount;
  }

  /** Close a road segment (for what-if analysis). Vehicles can't enter closed segments. */
  closeSegment(segmentId: string): void {
    this.closedSegments.add(segmentId);
    // Count exiting vehicles before removing them
    const removed = this.vehiclesOnSegment.get(segmentId) || [];
    this.exitedCount += removed.length;
    this.vehiclesOnSegment.set(segmentId, []);
  }

  /** Reopen a previously closed road segment. */
  reopenSegment(segmentId: string): void {
    this.closedSegments.delete(segmentId);
  }

  /** Close all segments connected to specific intersections. */
  closeSegmentsAround(intersectionIds: string[]): void {
    for (const seg of ROAD_SEGMENTS) {
      if (intersectionIds.includes(seg.fromIsec) || intersectionIds.includes(seg.toIsec)) {
        this.closeSegment(seg.id);
      }
    }
  }

  isSegmentClosed(segmentId: string): boolean {
    return this.closedSegments.has(segmentId);
  }

  // ── Main tick (always 1 sim-minute, 60 substeps) ──

  private tick() {
    this.tickPhysics();
    const snap = this.buildSnapshot();
    for (const cb of this.tickCallbacks) cb(snap);
  }

  /** Run one tick of physics + time advance, no callbacks, no snapshot build. */
  private tickPhysics() {
    const stepsPerMinute = Math.round(60 / PHYSICS_DT);
    for (let step = 0; step < stepsPerMinute; step++) {
      this.physicsStep();
    }
    this.simMinute += 1;
    while (this.simMinute >= 60) {
      this.simMinute -= 60;
      this.simHour = (this.simHour + 1) % 24;
    }
  }

  // ── MARL Integration Methods ──

  /** Advance simulation by N minutes in fast-forward mode. Returns accumulated metrics. */
  advanceMinutes(minutes: number): TrafficMetrics {
    let totalQueue = 0;
    let totalSpeed = 0;
    let totalVehicles = 0;
    let totalWait = 0;
    let totalCarbon = 0;
    let samples = 0;

    for (let m = 0; m < minutes; m++) {
      this.tickPhysics();

      const mets = this.collectMetrics();
      totalQueue += mets.totalQueue;
      totalSpeed += mets.avgSpeed;
      totalVehicles += mets.totalVehicles;
      totalWait += mets.avgWaitTime;
      totalCarbon += mets.carbonEstimate;
      samples++;
    }

    return {
      avgSpeed: samples > 0 ? Math.round(totalSpeed / samples * 10) / 10 : 0,
      totalQueue: Math.round(totalQueue / samples),
      totalVehicles: Math.round(totalVehicles / samples),
      avgWaitTime: samples > 0 ? Math.round(totalWait / samples * 10) / 10 : 0,
      carbonEstimate: Math.round(totalCarbon * 100) / 100,
    };
  }

  /** Collect instantaneous metrics from current simulation state. */
  private collectMetrics(): TrafficMetrics {
    let totalSpeed = 0;
    let vehicleCount = 0;
    let queueCount = 0;
    let totalWait = 0;
    let carbon = 0;

    for (const [, vehicles] of this.vehiclesOnSegment) {
      for (const v of vehicles) {
        const speedKmh = v.speed * 3.6;
        totalSpeed += speedKmh;
        totalWait += v.waitTime;
        vehicleCount++;

        if (speedKmh < 5) queueCount++;

        // Carbon: emission factor × speed penalty × minutes/60 (per-minute snapshot)
        const ef = EMISSION_FACTORS[v.type] || 2.3;
        const speedPenalty = speedKmh < 15 ? 1.5 : speedKmh > 60 ? 0.7 : 1.0;
        carbon += ef * speedPenalty / 60;
      }
    }

    return {
      avgSpeed: vehicleCount > 0 ? Math.round(totalSpeed / vehicleCount * 10) / 10 : 0,
      totalQueue: queueCount,
      totalVehicles: vehicleCount,
      avgWaitTime: vehicleCount > 0 ? Math.round(totalWait / vehicleCount * 10) / 10 : 0,
      carbonEstimate: Math.round(carbon * 100) / 100,
    };
  }

  /** Get all intersection IDs. */
  getIntersectionIds(): string[] {
    return INTERSECTIONS.map(i => i.id);
  }

  /** Get the zone type for an intersection. */
  getIntersectionZoneType(intersectionId: string): SimZoneType | null {
    const node = INTERSECTION_MAP.get(intersectionId);
    return node ? node.zoneType : null;
  }

  /** Get per-direction vehicle counts and speeds for an intersection. */
  getIntersectionLaneData(intersectionId: string): {
    direction: Direction; carCount: number; avgSpeed: number; queueCount: number;
  }[] {
    const result: { direction: Direction; carCount: number; avgSpeed: number; queueCount: number }[] = [];

    for (const dir of DIRECTIONS) {
      const segs = (SEGMENTS_BY_TO.get(intersectionId) || []).filter(s => s.direction === dir);
      let carCount = 0;
      let totalSpeed = 0;
      let queueCount = 0;

      for (const seg of segs) {
        const vehicles = this.vehiclesOnSegment.get(seg.id) || [];
        carCount += vehicles.length;
        for (const v of vehicles) {
          totalSpeed += v.speed * 3.6;
          if (v.speed * 3.6 < 5) queueCount++;
        }
      }

      result.push({
        direction: dir,
        carCount,
        avgSpeed: carCount > 0 ? Math.round(totalSpeed / carCount * 10) / 10 : 0,
        queueCount,
      });
    }

    return result;
  }

  /** Get IDs of neighboring intersections (connected via road segments). */
  getNeighborIntersections(intersectionId: string): string[] {
    const neighbors = new Set<string>();
    // Outbound neighbors (intersections we connect TO)
    for (const seg of (SEGMENTS_BY_FROM.get(intersectionId) || [])) {
      neighbors.add(seg.toIsec);
    }
    // Inbound neighbors (intersections that connect TO us)
    for (const seg of (SEGMENTS_BY_TO.get(intersectionId) || [])) {
      neighbors.add(seg.fromIsec);
    }
    neighbors.delete(intersectionId);
    return [...neighbors];
  }

  /** Get current signal phase info for an intersection. */
  getSignalPhaseInfo(intersectionId: string): { currentPhaseIdx: number; greenDirs: Direction[] } {
    const ctrl = this.controllers.get(intersectionId);
    if (!ctrl) return { currentPhaseIdx: 0, greenDirs: [] };
    const phase = ctrl['phases'][ctrl['currentPhaseIdx']];
    return {
      currentPhaseIdx: ctrl['currentPhaseIdx'],
      greenDirs: phase ? [...phase.greenDirections] : [],
    };
  }

  /** Apply a MARL agent action to an intersection's signal timing. */
  applyAgentAction(intersectionId: string, actionIdx: number): void {
    const ctrl = this.controllers.get(intersectionId);
    if (!ctrl) return;

    const phases = ctrl['phases'] as { name: string; greenDirections: Direction[]; greenTime: number; yellowTime: number; allRedTime: number }[];
    const currentIdx = ctrl['currentPhaseIdx'];
    const currentPhase = phases[currentIdx];

    switch (actionIdx) {
      case 0: // extend_green: +5s to current phase green time
        currentPhase.greenTime = Math.min(90, currentPhase.greenTime + 5);
        break;
      case 1: { // shorten_cycle: -5s from all non-current phases (speeds up rotation)
        for (let i = 0; i < phases.length; i++) {
          if (i !== currentIdx) {
            phases[i].greenTime = Math.max(5, phases[i].greenTime - 5);
          }
        }
        break;
      }
      case 2: // maintain: no change
        break;
    }
  }

  getSimTime(): { hour: number; minute: number } {
    return { hour: this.simHour, minute: this.simMinute };
  }

  getGlobalMetrics(): TrafficMetrics {
    return this.collectMetrics();
  }

  // 生成3D数据给Cesium，车太多会卡，所以只采样前 ~30 辆
  get3DSnapshot(): Traffic3DSnapshot {
    const MAX_3D_VEHICLES = 30;
    const allVehicles: Vehicle3D[] = [];
    for (const [segId, segVehicles] of this.vehiclesOnSegment) {
      const seg = SEGMENT_MAP.get(segId);
      if (!seg) continue;
      const fromNode = INTERSECTION_MAP.get(seg.fromIsec);
      const toNode = INTERSECTION_MAP.get(seg.toIsec);
      if (!fromNode || !toNode) continue;

      for (const v of segVehicles) {
        const frac = Math.min(1, Math.max(0, v.position / seg.length));
        const lat = fromNode.lat + (toNode.lat - fromNode.lat) * frac;
        const lng = fromNode.lng + (toNode.lng - fromNode.lng) * frac;
        const dx = toNode.lng - fromNode.lng;
        const dy = toNode.lat - fromNode.lat;
        const perpX = -dy * 0.00008;
        const perpY = dx * 0.00008;
        const heading = (Math.atan2(dy, dx) * 180) / Math.PI;

        allVehicles.push({
          id: v.id,
          type: v.type,
          position: { lat: lat + perpY * (Math.random() - 0.5), lng: lng + perpX * (Math.random() - 0.5), alt: 0 },
          speed: Math.round(v.speed * 3.6 * 10) / 10,
          heading: Math.round(heading),
          destination: toNode.nameZh,
          waitTime: Math.round(v.waitTime),
        });
      }
    }

    // Sample evenly from all vehicles (max ~50 for performance)
    const vehicles: Vehicle3D[] = [];
    const step = Math.max(1, Math.floor(allVehicles.length / MAX_3D_VEHICLES));
    for (let i = 0; i < allVehicles.length; i += step) {
      vehicles.push(allVehicles[i]);
      if (vehicles.length >= MAX_3D_VEHICLES) break;
    }

    const intersections: Intersection3D[] = [];
    for (const isec of INTERSECTIONS) {
      const ctrl = this.controllers.get(isec.id);
      const signals: Record<Direction, 'green' | 'yellow' | 'red'> = { N: 'red', S: 'red', E: 'red', W: 'red' };
      if (ctrl) {
        for (const d of DIRECTIONS) signals[d] = ctrl.getColor(d);
      }
      intersections.push({
        id: isec.id, name: isec.name, nameZh: isec.nameZh,
        position: { lat: isec.lat, lng: isec.lng, alt: 20 },
        signalColors: signals,
      });
    }

    return { timestamp: new Date().toISOString(), vehicles, intersections };
  }

  // ── Single physics step (dt = PHYSICS_DT sim-seconds) ──

  private physicsStep() {
    this.simSecond += PHYSICS_DT;
    if (this.simSecond >= 60) {
      this.simSecond -= 60;
    }

    // 1. Advance signal controllers
    for (const ctrl of this.controllers.values()) {
      ctrl.advance(PHYSICS_DT);
    }

    // 2. Spawn new vehicles at network boundaries
    this.spawnVehicles();

    // 3. Update vehicle dynamics on each segment
    for (const seg of ROAD_SEGMENTS) {
      this.updateSegment(seg);
    }

    // 4. Process vehicles at intersection approaches (transfer between segments)
    this.processIntersections();

    // 5. Remove vehicles that have exited the network
    this.cleanupExited();
  }

  // ── Vehicle spawning ──

  private spawnVehicles() {
    // Vehicle cap: skip spawning when at capacity
    if (this.maxVehicles > 0 && this.allVehicles.length >= this.maxVehicles) return;

    // Spawn vehicles on ALL road segments (each intersection generates its own traffic).
    // The spawn rate per segment is proportional to the zone demand of the FROM intersection.
    for (const seg of ROAD_SEGMENTS) {
      // Skip closed segments
      if (this.closedSegments.has(seg.id)) continue;
      const fromNode = INTERSECTION_MAP.get(seg.fromIsec);
      if (!fromNode) continue;
      const zoneType = fromNode.zoneType;
      const rate = arrivalRate(zoneType, this.simHour, this.simMinute) / seg.laneCount;
      const prob = rate * PHYSICS_DT;
      if (Math.random() >= prob) continue;

      const vtype = randomVehicleType();
      const route = this.buildRoute(seg.fromIsec, seg.direction);
      if (route.length < 2) continue;

      // Spawn at a random position in the first 30% of the segment
      const spawnPos = Math.random() * seg.length * 0.3;

      // Safety check: don't spawn on top of existing vehicles
      const existing = this.vehiclesOnSegment.get(seg.id) || [];
      const p = VEHICLE_TYPES[vtype];
      const minSafeGap = p.length + p.minGap + 5; // car length + jam gap + margin
      let blocked = false;
      for (const ev of existing) {
        if (Math.abs(ev.position - spawnPos) < minSafeGap) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const vehicle: Vehicle = {
        id: this.nextVehicleId++,
        type: vtype,
        speed: VEHICLE_TYPES[vtype].maxSpeed * 0.6,
        accel: 0,
        position: spawnPos,
        segmentId: seg.id,
        routeRemaining: route,
        turnIntent: route.length >= 3
          ? this.determineTurn(seg.direction, seg.toIsec, route[2])
          : 'straight',
        waitTime: 0,
        spawned: true,
      };

      this.vehiclesOnSegment.get(seg.id)!.push(vehicle);
      this.allVehicles.push(vehicle);
    }
  }

  // Build a route: list of intersection IDs the vehicle will pass through
  private buildRoute(startIsecId: string, entryDir: Direction): string[] {
    // Simple route: pick a random destination intersection and find shortest path
    const dest = INTERSECTIONS[Math.floor(Math.random() * INTERSECTIONS.length)];
    if (dest.id === startIsecId) {
      // Pick another
      const others = INTERSECTIONS.filter(i => i.id !== startIsecId);
      if (others.length === 0) return [startIsecId];
      return this.shortestPath(startIsecId, others[Math.floor(Math.random() * others.length)].id);
    }
    return this.shortestPath(startIsecId, dest.id);
  }

  // BFS shortest path through the network
  private shortestPath(from: string, to: string): string[] {
    if (from === to) return [from];
    const visited = new Set<string>();
    const queue: { node: string; path: string[] }[] = [{ node: from, path: [from] }];
    visited.add(from);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      const outSegs = SEGMENTS_BY_FROM.get(node) || [];
      for (const seg of outSegs) {
        const next = seg.toIsec;
        if (next === to) return [...path, to];
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ node: next, path: [...path, next] });
        }
      }
    }
    return [from]; // no path found
  }

  private determineTurn(fromDir: Direction, atIsec: string, nextIsec: string): 'left' | 'straight' | 'right' {
    const fromNode = INTERSECTION_MAP.get(atIsec);
    const toNode = INTERSECTION_MAP.get(nextIsec);
    if (!fromNode || !toNode) return 'straight';
    const travelDir = segmentDirection(fromNode, toNode);

    if (travelDir === fromDir) return 'straight';
    if (travelDir === LEFT_OF[fromDir]) return 'left';
    if (travelDir === RIGHT_OF[fromDir]) return 'right';
    // Must be opposite (shouldn't happen with shortest path)
    return 'straight';
  }

  // ── Segment update (IDM car-following) ──

  private updateSegment(seg: RoadSegment) {
    const vehicles = this.vehiclesOnSegment.get(seg.id) || [];
    if (vehicles.length === 0) return;

    // Sort by position (descending → process from front to back)
    vehicles.sort((a, b) => b.position - a.position);

    const isecNode = INTERSECTION_MAP.get(seg.toIsec);
    const ctrl = this.controllers.get(seg.toIsec);

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const leader = i > 0 ? vehicles[i - 1] : null;

      // Check if near intersection stop line
      const distToStopLine = seg.length - v.position;
      const signalColor = ctrl?.getColor(seg.direction) || 'green';

      // Red-light stopping zone: 60m gives enough distance to stop from road speed
      // v²/(2a) = 13.9²/(2×2.5) ≈ 38.6m for cars at 50km/h with comf decel
      // Use 60m to add safety margin (reaction time + heavier vehicles)
      const RED_ZONE = 60;
      const YELLOW_ZONE = 35;

      // Determine if vehicle should stop at intersection
      let mustStop = false;
      // Only stop if vehicle is BEFORE the stop line (hasn't entered intersection)
      const beforeStopLine = distToStopLine > 0;
      if (beforeStopLine && distToStopLine < RED_ZONE && signalColor === 'red') {
        mustStop = true;
      } else if (beforeStopLine && distToStopLine < YELLOW_ZONE && signalColor === 'yellow') {
        // Can't clear intersection in time → stop
        const timeToClear = distToStopLine / Math.max(1, v.speed);
        const yellowRemaining = ctrl?.getRemaining(seg.direction) || 0;
        if (timeToClear > yellowRemaining) mustStop = true;
      }

      // For left-turning vehicles, check if they need to yield
      if (v.turnIntent === 'left' && distToStopLine < 15 && signalColor === 'green') {
        // Yield to oncoming through traffic (simplified: 50% chance of yielding)
        if (Math.random() < 0.3) mustStop = true;
      }

      const p = VEHICLE_TYPES[v.type];

      if (mustStop && distToStopLine < 0.5) {
        // At stop line — hold
        v.speed = 0;
        v.accel = 0;
        v.waitTime += PHYSICS_DT;
      } else if (mustStop && distToStopLine > 0) {
        // Approaching red/yellow → decelerate to stop at line
        // Use emergency decel cap so vehicles CAN actually stop in time
        const decelToStop = (v.speed * v.speed) / (2 * Math.max(0.1, distToStopLine));
        v.accel = -Math.min(p.emergDecel, decelToStop);
        v.speed = Math.max(0, v.speed + v.accel * PHYSICS_DT);
        if (v.speed < 0.5) v.waitTime += PHYSICS_DT;
      } else if (distToStopLine <= 0) {
        // Vehicle has already entered the intersection — do NOT stop mid-intersection
        // Continue at current speed (will transfer to next segment at processIntersections)
        // Apply normal IDM
        const a = idmAccel(v, leader, seg);
        v.accel = Math.max(-p.emergDecel, Math.min(p.maxAccel, a));
        v.speed = Math.max(0, Math.min(p.maxSpeed, v.speed + v.accel * PHYSICS_DT));
      } else {
        // Normal IDM car-following
        // Effective leader includes the stop line
        let effectiveLeader = leader;
        if (!leader && signalColor === 'red' && distToStopLine < 100) {
          // Virtual leader at stop line
          effectiveLeader = {
            id: -1, type: 'car', speed: 0, accel: 0,
            position: seg.length, segmentId: seg.id,
            routeRemaining: [], turnIntent: 'straight', waitTime: 0, spawned: true,
          } as Vehicle;
        }

        const a = idmAccel(v, effectiveLeader, seg);
        v.accel = Math.max(-p.emergDecel, Math.min(p.maxAccel, a));
        v.speed = Math.max(0, Math.min(p.maxSpeed, v.speed + v.accel * PHYSICS_DT));
        if (v.speed < 0.3) v.waitTime += PHYSICS_DT;
        else v.waitTime = Math.max(0, v.waitTime - PHYSICS_DT);
      }

      // Move vehicle
      v.position += v.speed * PHYSICS_DT;
    }
  }

  // ── Process intersections (vehicle transfer between segments) ──

  private processIntersections() {
    for (const isec of INTERSECTIONS) {
      const ctrl = this.controllers.get(isec.id)!;

      // Find all inbound segments (roads leading TO this intersection)
      const inboundSegs = SEGMENTS_BY_TO.get(isec.id) || [];
      const outboundSegs = SEGMENTS_BY_FROM.get(isec.id) || [];

      for (const inSeg of inboundSegs) {
        const vehicles = this.vehiclesOnSegment.get(inSeg.id) || [];
        const signalColor = ctrl.getColor(inSeg.direction);

        // Vehicles that have passed the stop line
        const passed: Vehicle[] = [];
        const remaining: Vehicle[] = [];

        for (const v of vehicles) {
          if (v.position >= inSeg.length) {
            passed.push(v);
          } else {
            remaining.push(v);
          }
        }

        this.vehiclesOnSegment.set(inSeg.id, remaining);

        // Transfer passed vehicles to next segment
        for (const v of passed) {
          // route[0]=origin, route[1]=current intersection
          // Need route[2] to continue; if only [origin, current], vehicle exits
          if (v.routeRemaining.length < 3) {
            this.exitedCount++;
            continue;
          }

          // For red/yellow signals, vehicles shouldn't pass (clamp)
          if (signalColor === 'red' && v.position - inSeg.length < 2) {
            v.position = inSeg.length - 0.1;
            v.speed = 0;
            remaining.push(v);
            continue;
          }

          // Find segment from current intersection (isec) to next destination (route[2])
          const realNext = v.routeRemaining[2];
          const nextSeg = this.findConnectingSegment(isec.id, realNext, inSeg.direction);

          // Skip closed segments — vehicle exits the network
          if (nextSeg && this.closedSegments.has(nextSeg.id)) {
            this.exitedCount++;
            continue;
          }

          if (nextSeg) {
            // Collision check: don't transfer if the next segment has a vehicle
            // right at the entrance (position < safe gap)
            const nextVehicles = this.vehiclesOnSegment.get(nextSeg.id) || [];
            const p = VEHICLE_TYPES[v.type];
            const entranceSafeGap = p.length + p.minGap + 2;
            const blocked2 = nextVehicles.some(nv => nv.position < entranceSafeGap);
            if (blocked2) {
              // Hold at the stop line until the entrance clears
              v.position = inSeg.length - 0.1;
              v.speed = Math.min(v.speed, 1.0);
              remaining.push(v);
              continue;
            }

            v.segmentId = nextSeg.id;
            v.position = 0;
            v.routeRemaining = v.routeRemaining.slice(1); // drop origin, current→[0]

            // Update turn intent for the intersection after next
            if (v.routeRemaining.length >= 3) {
              v.turnIntent = this.determineTurn(nextSeg.direction, nextSeg.toIsec, v.routeRemaining[2]);
            } else {
              v.turnIntent = 'straight';
            }

            this.vehiclesOnSegment.get(nextSeg.id)!.push(v);
          }
        }

        this.vehiclesOnSegment.set(inSeg.id, remaining);
      }
    }
  }

  private findConnectingSegment(fromIsec: string, toIsec: string, fromDir: Direction): RoadSegment | null {
    const outSegs = SEGMENTS_BY_FROM.get(fromIsec) || [];
    for (const seg of outSegs) {
      if (seg.toIsec === toIsec) return seg;
    }
    // Fallback: find any outbound segment going roughly the same direction
    for (const seg of outSegs) {
      if (seg.direction === fromDir) return seg; // straight through
    }
    return outSegs[0] || null;
  }

  // ── Cleanup ──

  private cleanupExited() {
    // Remove vehicles that have been out of the network for a while
    const active = new Set<number>();
    for (const [, vehicles] of this.vehiclesOnSegment) {
      for (const v of vehicles) active.add(v.id);
    }
    this.allVehicles = this.allVehicles.filter(v => active.has(v.id));
  }

  // ── Build snapshot (aggregate agent state → API format) ──

  private buildSnapshot(): TrafficSimSnapshot {
    const hour = this.simHour;
    const minute = this.simMinute;

    // Build per-intersection lane data from vehicles on inbound segments
    const intersectionLanes = new Map<string, Map<Direction, Vehicle[]>>();

    for (const isec of INTERSECTIONS) {
      const dirVehicles = new Map<Direction, Vehicle[]>();
      for (const d of DIRECTIONS) dirVehicles.set(d, []);
      intersectionLanes.set(isec.id, dirVehicles);
    }

    for (const seg of ROAD_SEGMENTS) {
      const vehicles = this.vehiclesOnSegment.get(seg.id) || [];
      if (vehicles.length === 0) continue;
      const dirMap = intersectionLanes.get(seg.toIsec);
      if (dirMap) {
        const existing = dirMap.get(seg.direction) || [];
        for (const v of vehicles) existing.push(v);
        dirMap.set(seg.direction, existing);
      }
    }

    const zones: ZoneSnapshot[] = ZONE_DEFS.map((def) => {
      const intersections: IntersectionSnapshot[] = def.intersections.map((isecDef) => {
        const ctrl = this.controllers.get(isecDef.id)!;
        const dirVehicles = intersectionLanes.get(isecDef.id) || new Map();

        const lanes: LaneSnapshot[] = DIRECTIONS.map((dir) => {
          const vehicles = dirVehicles.get(dir) || [];
          const carCount = vehicles.length;
          const speeds = vehicles.map((v: Vehicle) => v.speed * 3.6);
          const avgSpeed = carCount > 0
            ? Math.round(speeds.reduce((a: number, b: number) => a + b, 0) / carCount * 10) / 10
            : ZONE_DEMAND[def.type].peakFlowRate > 600 ? 40 : 30;

          // Congestion: based on vehicle density on the segment
          // Find the actual segment length for capacity calculation
          const segForDir = ROAD_SEGMENTS.find(s => s.toIsec === isecDef.id && s.direction === dir);
          const segLen = segForDir?.length || 200;
          const laneCapacity = Math.floor(segLen / (VEHICLE_TYPES.car.length + VEHICLE_TYPES.car.minGap));
          const congestionLevel = laneCapacity > 0
            ? Math.min(100, Math.round((carCount / laneCapacity) * 100))
            : 0;

          return {
            direction: dir,
            carCount,
            avgSpeed,
            congestionLevel,
          };
        });

        const isGreen = (d: Direction) => ctrl.getColor(d) === 'green';
        const signals: Record<Direction, DirectionSignal> = {
          N: { green: isGreen('N'), remaining: Math.round(ctrl.getRemaining('N')) },
          S: { green: isGreen('S'), remaining: Math.round(ctrl.getRemaining('S')) },
          E: { green: isGreen('E'), remaining: Math.round(ctrl.getRemaining('E')) },
          W: { green: isGreen('W'), remaining: Math.round(ctrl.getRemaining('W')) },
        };

        const hourPattern = ZONE_DEMAND[def.type].hourlyPattern[hour] / 10;
        const pedCount = Math.round(
          PEDESTRIAN_BASE[def.type] * hourPattern * 3 * (0.8 + Math.random() * 0.4)
        );

        return {
          id: isecDef.id,
          name: isecDef.name,
          lanes,
          signals,
          pedestrianCount: pedCount,
        };
      });

      return {
        id: def.type,
        name: ZONE_DEMAND[def.type].zoneType === 'industrial' ? 'Industrial Zone' :
             def.type === 'tech_park' ? 'Tech Park' :
             def.type === 'school' ? 'School Zone' :
             def.type === 'commercial' ? 'Business District' : 'Residential Area',
        nameZh: def.type === 'industrial' ? '工业区' :
                def.type === 'tech_park' ? '科技园' :
                def.type === 'school' ? '学校区' :
                def.type === 'commercial' ? '商业区' : '住宅区',
        type: def.type,
        intersections,
      };
    });

    return {
      timestamp: new Date().toISOString(),
      simTime: formatSimTime(hour, minute),
      simHour: hour,
      simMinute: minute,
      isRushHour: isRushHour(hour),
      timeOfDay: getTimeOfDay(hour),
      zones,
    };
  }
}


// ─── Network exports for MARL ──────────────────────────────

export { INTERSECTIONS, INTERSECTION_MAP, SEGMENTS_BY_TO, SEGMENTS_BY_FROM, ROAD_SEGMENTS, DIRECTIONS };
export { TrafficSimulationEngine };

// ─── Singleton ─────────────────────────────────────────────

export const trafficSim = new TrafficSimulationEngine();
