/**
 * Traffic simulation �� road network definition (hardcoded 11 intersections, Shenzhen area)
 * Extracted from trafficSimulation.ts for modularity
 */
import type {
  Direction, SimZoneType, VehicleTypeParams, RoadSegment, IntersectionNode,
} from './types';

// ���� Constants ������������������������������������������������������������������������������������������������

const DIRECTIONS: Direction[] = ['N', 'S', 'E', 'W'];

export const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const LEFT_OF: Record<Direction, Direction> = { N: 'W', S: 'E', E: 'N', W: 'S' };
export const RIGHT_OF: Record<Direction, Direction> = { N: 'E', S: 'W', E: 'S', W: 'N' };

// ���� Vehicle type parameters ��������������������������������������������������������������������

export const VEHICLE_TYPES: Record<string, VehicleTypeParams> = {
  car: {
    length: 4.5, maxSpeed: 13.9, maxAccel: 2.0, comfDecel: 2.5, emergDecel: 7.0,
    desiredTimeHeadway: 1.4, minGap: 2.0, politeness: 0.4, proportion: 0.82,
  },
  bus: {
    length: 10.0, maxSpeed: 11.1, maxAccel: 1.2, comfDecel: 1.8, emergDecel: 5.0,
    desiredTimeHeadway: 2.0, minGap: 3.0, politeness: 0.1, proportion: 0.06,
  },
  truck: {
    length: 12.0, maxSpeed: 9.7, maxAccel: 1.0, comfDecel: 1.5, emergDecel: 4.0,
    desiredTimeHeadway: 2.5, minGap: 4.0, politeness: 0.05, proportion: 0.07,
  },
  emergency: {
    length: 5.0, maxSpeed: 16.7, maxAccel: 3.5, comfDecel: 4.0, emergDecel: 9.0,
    desiredTimeHeadway: 0.8, minGap: 1.5, politeness: 0.0, proportion: 0.05,
  },
};

export function randomVehicleType(): string {
  const r = Math.random();
  let cumulative = 0;
  for (const [type, params] of Object.entries(VEHICLE_TYPES)) {
    cumulative += params.proportion;
    if (r <= cumulative) return type;
  }
  return 'car';
}

// ���� Intersections (coordinate system: ~3km x 3km, lat/lng ~Shenzhen) ����

export const INTERSECTIONS: IntersectionNode[] = [
  { id: 'ind-1', name: 'Industry Rd & Truck Way',    nameZh: '��ҵ����뿨��·',   zoneType: 'industrial',   x: 0.4, y: 0.3, lat: 22.501, lng: 113.908 },
  { id: 'ind-2', name: 'Factory Blvd & Warehouse Ave', nameZh: '����·��ִ���',   zoneType: 'industrial',   x: 0.8, y: 0.7, lat: 22.505, lng: 113.913 },
  { id: 'tech-1', name: 'Innovation Ave & Code St',  nameZh: '���´�������·',   zoneType: 'tech_park',   x: 1.3, y: 0.3, lat: 22.540, lng: 113.950 },
  { id: 'tech-2', name: 'AI Blvd & Data Dr',         nameZh: 'AI���������·',     zoneType: 'tech_park',   x: 1.7, y: 0.7, lat: 22.543, lng: 113.955 },
  { id: 'com-1', name: 'Main St & Market Sq',        nameZh: '�������г��㳡',     zoneType: 'commercial',  x: 2.3, y: 0.3, lat: 22.545, lng: 114.055 },
  { id: 'com-2', name: 'Shopping Blvd & Mall Dr',     nameZh: '���������̳�·',   zoneType: 'commercial',  x: 2.7, y: 0.7, lat: 22.548, lng: 114.060 },
  { id: 'res-1', name: 'Garden Rd & Park Ln',        nameZh: '��԰·�빫԰��',     zoneType: 'residential', x: 0.2, y: 1.3, lat: 22.518, lng: 113.935 },
  { id: 'res-2', name: 'Lake Ave & Tree St',         nameZh: '�������������·',   zoneType: 'residential', x: 0.5, y: 1.5, lat: 22.522, lng: 113.940 },
  { id: 'res-3', name: 'Sunrise Blvd & Moon Dr',     nameZh: '�ճ����������·',   zoneType: 'residential', x: 0.8, y: 1.7, lat: 22.525, lng: 113.945 },
  { id: 'sch-1', name: 'School Rd & Campus Way',     nameZh: 'ѧУ·��У԰��',     zoneType: 'school',      x: 1.3, y: 1.3, lat: 22.532, lng: 113.965 },
  { id: 'sch-2', name: 'Library Ave & Sports Blvd',  nameZh: 'ͼ���·���˶����', zoneType: 'school',      x: 1.7, y: 1.7, lat: 22.536, lng: 113.970 },
];

export const INTERSECTION_MAP = new Map<string, IntersectionNode>();
for (const n of INTERSECTIONS) INTERSECTION_MAP.set(n.id, n);

// ���� Road network ������������������������������������������������������������������������������������������

export const ROAD_SEGMENTS: RoadSegment[] = [];
export const SEGMENTS_BY_FROM = new Map<string, RoadSegment[]>();
export const SEGMENTS_BY_TO = new Map<string, RoadSegment[]>();
export const SEGMENT_MAP = new Map<string, RoadSegment>();

function dist(a: IntersectionNode, b: IntersectionNode): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) * 1000;
}

export function segmentDirection(a: IntersectionNode, b: IntersectionNode): Direction {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

export function buildNetwork() {
  const maxDist = 900;
  for (const a of INTERSECTIONS) {
    for (const b of INTERSECTIONS) {
      if (a.id === b.id) continue;
      const d = dist(a, b);
      if (d < maxDist) {
        const dir = segmentDirection(a, b);
        const speedLimit = 11.1 + Math.random() * 5.6;
        const laneCount = d > 500 ? 2 : 1;
        const seg: RoadSegment = {
          id: `${a.id}��${b.id}`,
          fromIsec: a.id,
          toIsec: b.id,
          direction: dir,
          length: d,
          speedLimit,
          laneCount,
        };
        ROAD_SEGMENTS.push(seg);
        SEGMENT_MAP.set(seg.id, seg);
        if (!SEGMENTS_BY_FROM.has(a.id)) SEGMENTS_BY_FROM.set(a.id, []);
        SEGMENTS_BY_FROM.get(a.id)!.push(seg);
        if (!SEGMENTS_BY_TO.has(b.id)) SEGMENTS_BY_TO.set(b.id, []);
        SEGMENTS_BY_TO.get(b.id)!.push(seg);
      }
    }
  }
}

buildNetwork();
