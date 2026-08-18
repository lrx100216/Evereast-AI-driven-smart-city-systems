/**
 * ParticleBackground — Full-screen particle background animation.
 *
 * Renders a 3-layer particle system (stars, orbs, dust) with mouse repulsion,
 * star connections, click burst, and mouse trail.
 *
 * Performance optimisations:
 *   - Pre-rendered radial-gradient glow textures (avoids createRadialGradient per frame)
 *   - Spatial grid for connection checks (O(n²) → O(n))
 *   - Single-pass rendering
 *   - Retina-aware DPR scaling (render at 0.75× on HiDPI)
 *   - Pre-parsed RGBA values (no regex in draw loop)
 */

import { useEffect, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────

interface BaseParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  phase: number; // for twinkle / oscillation
}

interface StarParticle extends BaseParticle {
  type: 'star';
  hue: number;
  glow: number;
  pulseSpeed: number;
}

interface OrbParticle extends BaseParticle {
  type: 'orb';
  /** Pre-parsed RGBA channels [r, g, b] */
  rgb: [number, number, number];
  glow: number;
  orbitCenter: { x: number; y: number } | null;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
}

interface DustParticle extends BaseParticle {
  type: 'dust';
  /** Pre-parsed RGBA */
  rgb: [number, number, number];
  drift: number;
}

type Particle = StarParticle | OrbParticle | DustParticle;

interface BurstParticle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  rgb: [number, number, number];
}

// ─── Config ─────────────────────────────────────────────────────

const CONFIG = {
  starCount: 140,        // reduced from 180 — pre-rendered glow looks bigger
  orbCount: 18,
  dustCount: 80,         // reduced from 120 — visual impact is marginal
  connectDist: 145,      // slightly lower — fewer connections per frame
  mouseRadius: 200,
  mouseForce: 0.08,
  trailLength: 12,
  burstParticles: 24,
  dprScale: 0.75,        // render at 75% device pixel ratio on HiDPI
  spatialCellSize: 80,   // spatial grid cell size for connection culling
};

const STAR_HUES = [
  { h: 210, s: 60, l: 70 }, // blue
  { h: 145, s: 50, l: 65 }, // green
  { h: 35, s: 70, l: 70 },  // orange
  { h: 0, s: 55, l: 70 },   // red
  { h: 270, s: 45, l: 70 }, // purple
];

const ORB_COLORS: Array<[number, number, number]> = [
  [79, 195, 247],
  [102, 187, 106],
  [255, 167, 38],
  [239, 83, 80],
  [206, 147, 216],
];

const DUST_RGBS: Array<[number, number, number]> = [
  [255, 255, 255],
  [200, 230, 255],
  [255, 240, 210],
];

// ─── Pre-rendered glow caches ───────────────────────────────────

/** Get-or-create a star glow canvas for a given hue */
function getStarGlow(hue: number, maxRadius: number): HTMLCanvasElement {
  const key = `star_${hue}_${Math.round(maxRadius)}`;
  const cached = starGlowCache.get(key);
  if (cached) return cached;

  const size = Math.ceil(maxRadius * 3 * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 3);
  gradient.addColorStop(0, `hsla(${hue}, 60%, 70%, 0.40)`);
  gradient.addColorStop(0.3, `hsla(${hue}, 50%, 55%, 0.15)`);
  gradient.addColorStop(1, `hsla(${hue}, 40%, 40%, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  starGlowCache.set(key, c);
  return c;
}

function getOrbGlow(rgb: [number, number, number], maxRadius: number): HTMLCanvasElement {
  const key = `orb_${rgb.join('_')}_${Math.round(maxRadius)}`;
  const cached = orbGlowCache.get(key);
  if (cached) return cached;

  const size = Math.ceil(maxRadius * 4 * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const [r, g, b] = rgb;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 4);
  gradient.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
  gradient.addColorStop(0.4, `rgba(${r},${g},${b},0.2)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  orbGlowCache.set(key, c);
  return c;
}

const starGlowCache = new Map<string, HTMLCanvasElement>();
const orbGlowCache = new Map<string, HTMLCanvasElement>();

// ─── Spatial Grid (for connection culling) ──────────────────────

interface GridCell {
  stars: StarParticle[];
}

function buildSpatialGrid(
  stars: StarParticle[],
  w: number,
  h: number,
  cellSize: number,
): GridCell[][] {
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);
  const grid: GridCell[][] = Array.from({ length: cols }, () =>
    Array.from({ length: rows }, () => ({ stars: [] })),
  );

  for (const s of stars) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(s.x / cellSize)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(s.y / cellSize)));
    grid[cx][cy].stars.push(s);
  }

  return grid;
}

// ─── Component ──────────────────────────────────────────────────

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];
    const mouse = { x: -9999, y: -9999, active: false };
    const trail: Array<{ x: number; y: number; life: number }> = [];
    const bursts: BurstParticle[] = [];
    let w = 0; let h = 0;

    // ── Resize (retina-aware) ──
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * CONFIG.dprScale;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      canvas!.style.width = w + 'px';
      canvas!.style.height = h + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Helpers ──
    function rand(a: number, b: number) { return a + Math.random() * (b - a); }

    function createStar(): StarParticle {
      const c = STAR_HUES[Math.floor(Math.random() * STAR_HUES.length)];
      return {
        type: 'star',
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.15, 0.15),
        vy: rand(-0.15, 0.15),
        size: rand(1, 3.5),
        opacity: rand(0.15, 0.6),
        phase: Math.random() * Math.PI * 2,
        hue: c.h,
        glow: rand(0.5, 2),
        pulseSpeed: rand(0.008, 0.025),
      };
    }

    function createOrb(): OrbParticle {
      return {
        type: 'orb',
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.08, 0.08),
        vy: rand(-0.08, 0.08),
        size: rand(6, 18),
        opacity: rand(0.03, 0.12),
        phase: Math.random() * Math.PI * 2,
        rgb: ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)],
        glow: rand(1.5, 4),
        orbitCenter: null,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: rand(0.001, 0.004),
        orbitRadius: rand(30, 80),
      };
    }

    function createDust(): DustParticle {
      return {
        type: 'dust',
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.05, 0.05),
        vy: rand(-0.05, 0.05),
        size: rand(0.5, 1.5),
        opacity: rand(0.05, 0.2),
        phase: Math.random() * Math.PI * 2,
        rgb: DUST_RGBS[Math.floor(Math.random() * DUST_RGBS.length)],
        drift: rand(-0.02, 0.02),
      };
    }

    function init() {
      resize();
      // In case resize updated w/h after initial construction
      for (let i = 0; i < CONFIG.starCount; i++) particles.push(createStar());
      for (let i = 0; i < CONFIG.orbCount; i++) particles.push(createOrb());
      for (let i = 0; i < CONFIG.dustCount; i++) particles.push(createDust());
    }

    // ── Update ──
    function updateParticle(p: Particle, _time: number) {
      if (p.type === 'star') {
        p.x += p.vx; p.y += p.vy;
        p.phase += p.pulseSpeed;
      } else if (p.type === 'orb') {
        if (p.orbitCenter && !mouse.active) {
          p.orbitAngle += p.orbitSpeed;
          p.x = p.orbitCenter.x + Math.cos(p.orbitAngle) * p.orbitRadius;
          p.y = p.orbitCenter.y + Math.sin(p.orbitAngle) * p.orbitRadius;
        } else {
          p.x += p.vx; p.y += p.vy;
        }
        p.phase += 0.003;
      } else {
        p.x += p.vx + p.drift;
        p.y += p.vy + Math.sin(_time * 0.0003 + p.phase) * 0.02;
        p.phase += 0.002;
      }

      // Wrap edges
      const margin = 40;
      if (p.x < -margin) p.x = w + margin;
      if (p.x > w + margin) p.x = -margin;
      if (p.y < -margin) p.y = h + margin;
      if (p.y > h + margin) p.y = -margin;

      // Mouse interaction
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONFIG.mouseRadius && dist > 1) {
        const force = (1 - dist / CONFIG.mouseRadius) * CONFIG.mouseForce;
        p.vx -= (dx / dist) * force;
        p.vy -= (dy / dist) * force;
      }

      // Damping
      p.vx *= 0.98; p.vy *= 0.98;
    }

    // ── Draw (single-pass) ──
    // We draw dust first (back), then connections, then orbs, then stars (front).
    // Group by type so we don't re-filter inside the loop.

    const stars: StarParticle[] = [];
    const orbs: OrbParticle[] = [];
    const dusts: DustParticle[] = [];

    function collectByType() {
      stars.length = 0;
      orbs.length = 0;
      dusts.length = 0;
      for (const p of particles) {
        if (p.type === 'star') stars.push(p);
        else if (p.type === 'orb') orbs.push(p);
        else dusts.push(p);
      }
    }

    function drawGlowUsingCache(
      glowCanvas: HTMLCanvasElement,
      x: number, y: number, radius: number, alpha: number,
    ) {
      const s = radius * 6; // canvas size ≈ radius * 3 * 2
      ctx!.globalAlpha = alpha;
      ctx!.drawImage(glowCanvas, x - s / 2, y - s / 2, s, s);
      ctx!.globalAlpha = 1;
    }

    // ── Connections (spatial-grid accelerated) ──
    function drawConnections() {
      const grid = buildSpatialGrid(stars, w, h, CONFIG.spatialCellSize);
      const cols = grid.length;
      const rows = grid[0]?.length ?? 0;
      const dist2 = CONFIG.connectDist * CONFIG.connectDist;

      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const cell = grid[cx][cy];
          if (cell.stars.length === 0) continue;

          // Check within cell + neighbouring cells (including self)
          for (let nx = Math.max(0, cx - 1); nx <= Math.min(cols - 1, cx + 1); nx++) {
            for (let ny = Math.max(0, cy - 1); ny <= Math.min(rows - 1, cy + 1); ny++) {
              const other = grid[nx][ny].stars;
              for (let i = 0; i < cell.stars.length; i++) {
                const a = cell.stars[i];
                // In self-cell, start j after i to avoid duplicate pairs
                const startJ = (nx === cx && ny === cy) ? i + 1 : 0;
                for (let j = startJ; j < other.length; j++) {
                  const b = other[j];
                  const dx = a.x - b.x;
                  const dy = a.y - b.y;
                  const d2 = dx * dx + dy * dy;
                  if (d2 >= dist2) continue;

                  const dist = Math.sqrt(d2);
                  const alpha = (1 - dist / CONFIG.connectDist) * 0.12;
                  const hueMix = (a.hue + b.hue) / 2;
                  ctx!.beginPath();
                  ctx!.moveTo(a.x, a.y);
                  ctx!.lineTo(b.x, b.y);
                  ctx!.strokeStyle = `hsla(${hueMix}, 50%, 60%, ${alpha})`;
                  ctx!.lineWidth = 0.5 + (1 - dist / CONFIG.connectDist) * 0.8;
                  ctx!.stroke();
                }
              }
            }
          }
        }
      }
    }

    // ── Main Loop ──
    function animate(time: number) {
      ctx!.clearRect(0, 0, w, h);

      // Update physics
      for (const p of particles) updateParticle(p, time);

      // Collect by type (once per frame)
      collectByType();

      // Draw dust (back layer)
      for (const p of dusts) {
        const twinkle = 0.6 + 0.4 * Math.sin(p.phase);
        const alpha = p.opacity * twinkle;
        const [r, g, b] = p.rgb;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx!.fill();
      }

      // Mouse trail
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].life -= 0.04;
        if (trail[i].life <= 0) { trail.splice(i, 1); continue; }
        const t = trail[i];
        ctx!.beginPath();
        ctx!.arc(t.x, t.y, 2 + t.life * 2, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(79, 195, 247, ${t.life * 0.25})`;
        ctx!.fill();
      }

      // Connections (between dust and orbs)
      drawConnections();

      // Draw orbs (middle layer) — use pre-rendered glow
      for (const p of orbs) {
        const twinkle = 0.7 + 0.3 * Math.sin(p.phase);
        const alpha = p.opacity * twinkle;
        const glowR = p.size * p.glow;
        const glowCanvas = getOrbGlow(p.rgb, glowR);
        drawGlowUsingCache(glowCanvas, p.x, p.y, glowR * 4, alpha);
      }

      // Draw stars (front layer) — use pre-rendered glow
      for (const p of stars) {
        const twinkle = 0.6 + 0.4 * Math.sin(p.phase);
        const alpha = p.opacity * twinkle;
        const glowR = p.size * p.glow;

        // Glow texture
        const glowCanvas = getStarGlow(p.hue, glowR);
        drawGlowUsingCache(glowCanvas, p.x, p.y, glowR * 3, alpha * 0.5);

        // Bright core
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.hue}, 70%, 80%, ${alpha * 0.8})`;
        ctx!.fill();
      }

      // Click bursts
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.x += b.vx; b.y += b.vy;
        b.vx *= 0.96; b.vy *= 0.96;
        b.life -= 0.015;
        if (b.life <= 0) { bursts.splice(i, 1); continue; }
        const [rr, gg, bb] = b.rgb;
        ctx!.beginPath();
        ctx!.arc(b.x, b.y, 1.5 + b.life * 2, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${rr},${gg},${bb},${b.life * 0.6})`;
        ctx!.fill();
      }

      animId = requestAnimationFrame(animate);
    }

    // ── Events ──
    function onMouseLeave() {
      mouse.x = -9999; mouse.y = -9999; mouse.active = false;
    }
    function onTouchEnd() {
      mouse.x = -9999; mouse.y = -9999; mouse.active = false;
    }

    function onMouseMoveWithTrail(e: MouseEvent) {
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
      trail.push({ x: e.clientX, y: e.clientY, life: 1 });
      if (trail.length > CONFIG.trailLength) trail.shift();
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      mouse.x = t.clientX; mouse.y = t.clientY; mouse.active = true;
      trail.push({ x: t.clientX, y: t.clientY, life: 1 });
      if (trail.length > CONFIG.trailLength) trail.shift();
    }

    function onClickBurst(e: MouseEvent) {
      const colorSet = [
        [79, 195, 247] as [number, number, number],
        [129, 212, 250] as [number, number, number],
        [102, 187, 106] as [number, number, number],
        [255, 167, 38] as [number, number, number],
        [239, 83, 80] as [number, number, number],
        [206, 147, 216] as [number, number, number],
      ];
      for (let i = 0; i < CONFIG.burstParticles; i++) {
        const angle = (Math.PI * 2 * i) / CONFIG.burstParticles + Math.random() * 0.5;
        const speed = 1 + Math.random() * 3;
        bursts.push({
          x: e.clientX, y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          rgb: colorSet[Math.floor(Math.random() * colorSet.length)],
        });
      }
    }

    // ── Startup ──
    init();
    animId = requestAnimationFrame(animate);
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMoveWithTrail);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('click', onClickBurst);

    return () => {
      cancelAnimationFrame(animId);
      starGlowCache.clear();
      orbGlowCache.clear();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMoveWithTrail);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('click', onClickBurst);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
