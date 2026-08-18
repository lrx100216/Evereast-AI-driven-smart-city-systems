/**
 * Traffic simulation type definitions
 * Extracted from trafficSimulation.ts for modularity
 */
export type SimZoneType = 'industrial' | 'tech_park' | 'school' | 'commercial' | 'residential';
export type Direction = 'N' | 'S' | 'E' | 'W';
export type SignalPhase = 'ns_green' | 'ew_green';

export interface LaneSnapshot {
  direction: Direction;
  carCount: number;
  avgSpeed: number;
  congestionLevel: number;
}

export interface GeoPosition {
  lat: number;
  lng: number;
  alt: number;
}

export interface Vehicle3D {
  id: number;
  type: string;
  position: GeoPosition;
  speed: number;
  heading: number;
  destination: string;
  waitTime: number;
}

export interface Intersection3D {
  id: string;
  name: string;
  nameZh: string;
  position: GeoPosition;
  signalColors: Record<Direction, 'green' | 'yellow' | 'red'>;
}

export interface Traffic3DSnapshot {
  timestamp: string;
  vehicles: Vehicle3D[];
  intersections: Intersection3D[];
}

export interface DirectionSignal {
  green: boolean;
  remaining: number;
}

export interface IntersectionSnapshot {
  id: string;
  name: string;
  lanes: LaneSnapshot[];
  signals: Record<Direction, DirectionSignal>;
  pedestrianCount: number;
}

export interface ZoneSnapshot {
  id: string;
  name: string;
  nameZh: string;
  type: SimZoneType;
  intersections: IntersectionSnapshot[];
}

export interface TrafficSimSnapshot {
  timestamp: string;
  simTime: string;
  simHour: number;
  simMinute: number;
  isRushHour: boolean;
  timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
  zones: ZoneSnapshot[];
}

export interface VehicleTypeParams {
  length: number;
  maxSpeed: number;
  maxAccel: number;
  comfDecel: number;
  emergDecel: number;
  desiredTimeHeadway: number;
  minGap: number;
  politeness: number;
  proportion: number;
}

export interface RoadSegment {
  id: string;
  fromIsec: string;
  toIsec: string;
  direction: Direction;
  length: number;
  speedLimit: number;
  laneCount: number;
}

export interface IntersectionNode {
  id: string;
  name: string;
  nameZh: string;
  zoneType: SimZoneType;
  x: number;
  y: number;
  lat: number;
  lng: number;
}

export interface TrafficMetrics {
  avgSpeed: number;
  totalQueue: number;
  totalVehicles: number;
  avgWaitTime: number;
  carbonEstimate: number;
}
