import { useRef, useEffect } from 'react';
import type { IntersectionData, SignalState } from '../../hooks/useTrafficSim';

// ─── Constants ──────────────────────────────────────────

const W = 180;
const H = 180;
const ROAD_W = 18;
const HALF_RW = ROAD_W / 2;
const CAR_R = 3.2;
const CX = W / 2;
const CY = H / 2;

// Turn direction mapping: { [from]: to }
const LEFT_TURN: Record<string, string> = { N: 'W', S: 'E', E: 'N', W: 'S' };
const RIGHT_TURN: Record<string, string> = { N: 'E', S: 'W', E: 'S', W: 'N' };

interface CarState {
  direction: 'N' | 'S' | 'E' | 'W';
  t: number;
  speed: number;
  color: string;
}

function getCarColor(speedKmh: number): string {
  if (speedKmh > 30) return '#66bb6a';
  if (speedKmh > 15) return '#ffa726';
  return '#ef5350';
}

/** Check if a direction has green light */
function isDirGreen(signals: Record<string, SignalState>, dir: string): boolean {
  return signals[dir]?.green ?? false;
}

// ─── Car management ─────────────────────────────────────

function rebuildCars(
  lanes: IntersectionData['lanes'],
  prev: CarState[],
): CarState[] {
  const result: CarState[] = [];
  const MIN_GAP = 0.08; // minimum visual gap between cars (8% of lane length)
  for (const lane of lanes) {
    const count = Math.min(lane.carCount, 6); // max 6 visible to avoid clutter
    const existing = prev.filter((c) => c.direction === lane.direction);
    const speed = Math.max(0.08, Math.min(1.2, lane.avgSpeed / 35));
    const color = getCarColor(lane.avgSpeed);
    // Space cars evenly from 0.05 to 0.95 with minimum gap
    const maxT = 0.95;
    const minT = 0.03;
    const range = maxT - minT;
    const gap = count > 1 ? range / (count - 1) : 0;
    const actualGap = Math.max(gap, MIN_GAP);

    // If total span exceeds range, clamp last car to maxT and space previous cars
    const totalSpan = (count - 1) * actualGap;
    const clampedGap = totalSpan > range ? range / Math.max(1, count - 1) : actualGap;

    for (let i = 0; i < count; i++) {
      const idealT = minT + i * clampedGap;
      result.push({
        direction: lane.direction,
        t: existing[i]?.t ?? Math.min(idealT, maxT),
        speed,
        color,
      });
    }
  }
  return result;
}

// ─── Drawing helpers ────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(60,60,80,0.06)';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 10);
  ctx.fill();
}

function drawRoads(ctx: CanvasRenderingContext2D) {
  // Road strips
  ctx.fillStyle = 'rgba(60,60,80,0.12)';
  ctx.fillRect(CX - HALF_RW, 0, ROAD_W, H);
  ctx.fillRect(0, CY - HALF_RW, W, ROAD_W);

  // Stop lines (white dashes before intersection)
  ctx.strokeStyle = 'rgba(180,190,200,0.6)';
  ctx.lineWidth = 2;
  // N stop line
  ctx.beginPath();
  ctx.moveTo(CX - HALF_RW + 2, CY - 20);
  ctx.lineTo(CX + HALF_RW - 2, CY - 20);
  ctx.stroke();
  // S stop line
  ctx.beginPath();
  ctx.moveTo(CX - HALF_RW + 2, CY + 20);
  ctx.lineTo(CX + HALF_RW - 2, CY + 20);
  ctx.stroke();
  // W stop line
  ctx.beginPath();
  ctx.moveTo(CX - 20, CY - HALF_RW + 2);
  ctx.lineTo(CX - 20, CY + HALF_RW - 2);
  ctx.stroke();
  // E stop line
  ctx.beginPath();
  ctx.moveTo(CX + 20, CY - HALF_RW + 2);
  ctx.lineTo(CX + 20, CY + HALF_RW - 2);
  ctx.stroke();

  // Dashed center lines
  ctx.strokeStyle = 'rgba(140,150,170,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(CX, 0);
  ctx.lineTo(CX, CY - 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX, CY + 20);
  ctx.lineTo(CX, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, CY);
  ctx.lineTo(CX - 20, CY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX + 20, CY);
  ctx.lineTo(W, CY);
  ctx.stroke();

  ctx.setLineDash([]);
}

function getCarPosition(car: CarState): { x: number; y: number } {
  // Offset cars slightly from center line based on direction
  const offset = 5;
  switch (car.direction) {
    case 'N': return { x: CX - offset, y: H - car.t * H };
    case 'S': return { x: CX + offset, y: car.t * H };
    case 'E': return { x: car.t * W, y: CY - offset };
    case 'W': return { x: W - car.t * W, y: CY + offset };
  }
}

function drawCar(ctx: CanvasRenderingContext2D, car: CarState, stopped: boolean) {
  const pos = getCarPosition(car);

  // Shadow
  ctx.beginPath();
  ctx.arc(pos.x + 1, pos.y + 1, CAR_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, CAR_R, 0, Math.PI * 2);
  ctx.fillStyle = stopped ? 'rgba(239,83,80,0.5)' : car.color;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTrafficLight(
  ctx: CanvasRenderingContext2D,
  signals: Record<string, SignalState>,
) {
  const nsGreen = signals.N.green;
  const ewGreen = signals.E.green;

  // NS lights (top and bottom of intersection)
  drawDirectionLight(ctx, CX - 12, CY - 25, nsGreen, signals.N.remaining);
  drawDirectionLight(ctx, CX + 12, CY + 25, nsGreen, signals.S.remaining);

  // EW lights (left and right of intersection)
  drawDirectionLight(ctx, CX - 25, CY - 12, ewGreen, signals.W.remaining);
  drawDirectionLight(ctx, CX + 25, CY + 12, ewGreen, signals.E.remaining);

  // Center indicator
  ctx.beginPath();
  ctx.arc(CX, CY, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(100,110,130,0.3)';
  ctx.fill();
}

function drawDirectionLight(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  green: boolean, remaining: number,
) {
  const color = green ? '#66bb6a' : '#ef5350';
  const glowColor = green
    ? 'rgba(102,187,106,0.2)'
    : 'rgba(239,83,80,0.2)';

  // Glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  // Circle
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  // Countdown
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(remaining), x, y + 0.5);
}

// ─── Component ──────────────────────────────────────────

export default function IntersectionCanvas({
  intersection,
}: {
  intersection: IntersectionData;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(intersection);
  const carsRef = useRef<CarState[]>([]);
  const lastTimeRef = useRef(0);

  // Sync data ref and rebuild cars when props change
  useEffect(() => {
    dataRef.current = intersection;
    carsRef.current = rebuildCars(intersection.lanes, carsRef.current);
  }, [intersection]);

  // Single RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    let animId: number;

    const frame = (timestamp: number) => {
      const dt = Math.min(
        (timestamp - lastTimeRef.current) / 1000,
        0.1,
      );
      lastTimeRef.current = timestamp;

      const data = dataRef.current;
      const cars = carsRef.current;
      const signals = data.signals;

      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx);
      drawRoads(ctx);

      // Group cars by direction for collision avoidance (will be updated lazily)
      const carsByDir: Record<string, CarState[]> = {};
      for (const car of cars) {
        (carsByDir[car.direction] ??= []).push(car);
      }

      /** Rebuild carsByDir for a specific direction (after a car turns into it) */
      function rebuildDir(dir: string) {
        carsByDir[dir] = cars.filter(c => c.direction === dir).sort((a, b) => a.t - b.t);
      }

      // Update and draw cars with smooth red-light deceleration + collision avoidance
      for (const car of cars) {
        const green = isDirGreen(signals, car.direction);
        const t = car.t;

        // Find the car immediately ahead in the same direction
        const sameDir = carsByDir[car.direction] ?? [];
        const leader = sameDir.find(c => c.t > car.t && c.t - car.t < 0.25);

        if (green) {
          // Green: accelerate smoothly, but respect leader
          const maxT = leader ? leader.t - 0.10 : 0.99; // min 10% gap behind leader
          car.speed = Math.min(car.speed + 0.3 * dt, 1.0);
          car.t = Math.min(car.t + car.speed * 0.6 * dt, maxT);
        } else {
          // Red light: smooth deceleration based on distance to stop line
          const distToStop = 1.0 - t;
          if (distToStop < 0.05) {
            car.speed = 0;
          } else if (distToStop < 0.35) {
            car.speed = Math.max(0, car.speed - 1.5 * dt);
            const stopLine = Math.min(0.99, leader ? leader.t - 0.10 : 0.99);
            car.t = Math.min(car.t + car.speed * 0.4 * dt, stopLine);
          } else {
            car.speed = Math.max(0.06, car.speed - 0.2 * dt);
            const maxT = leader ? leader.t - 0.10 : 0.95;
            car.t = Math.min(car.t + car.speed * 0.4 * dt, maxT);
          }
        }

        // When car passes intersection (only on green)
        if (car.t >= 0.98 && green) {
          // Remove from old direction group before changing
          const oldDir = car.direction;
          carsByDir[oldDir] = (carsByDir[oldDir] ?? []).filter(c => c !== car);

          const roll = Math.random();
          if (roll < 0.25) {
            car.direction = LEFT_TURN[car.direction] as any;
          } else if (roll < 0.45) {
            car.direction = RIGHT_TURN[car.direction] as any;
          }
          car.t = 0;
          car.speed = 0.3 + Math.random() * 0.3;

          // Rebuild new direction group so subsequent cars see this one
          rebuildDir(car.direction);
        }

        drawCar(ctx, car, car.speed < 0.05);
      }

      drawTrafficLight(ctx, signals);

      animId = requestAnimationFrame(frame);
    };

    lastTimeRef.current = 0;
    animId = requestAnimationFrame((ts) => {
      lastTimeRef.current = ts;
      animId = requestAnimationFrame(frame);
    });

    return () => {
      cancelAnimationFrame(animId);
      lastTimeRef.current = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        borderRadius: 10,
        display: 'block',
        margin: '0 auto',
        width: W,
        height: H,
      }}
    />
  );
}
