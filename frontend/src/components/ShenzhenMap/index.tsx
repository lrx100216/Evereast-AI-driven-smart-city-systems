import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../../config';

// ─── Types ───────────────────────────────────────────────────
interface GeoPos { lat: number; lng: number; alt: number }
interface Vehicle3D { id: number; type: string; position: GeoPos; speed: number; heading: number; destination: string; waitTime: number }
interface Intersection3D { id: string; name: string; nameZh: string; position: GeoPos; signalColors: Record<string, 'green'|'yellow'|'red'> }
interface Traffic3DSnapshot { timestamp: string; vehicles: Vehicle3D[]; intersections: Intersection3D[] }

// ─── Light Tech Palette ─────────────────────────────────────
const BG       = '#F4F7F6';
const ROAD     = 'rgba(79,172,254,0.25)';
const GRID     = 'rgba(79,172,254,0.08)';
const HUD_BG   = 'rgba(255,255,255,0.92)';

// Vehicle colors — light theme high-contrast
const VC: Record<string, string> = {
  car:       '#1E3A8A', // deep tech blue
  bus:       '#3B82F6', // sky blue
  truck:     '#0D9488', // mint teal
  emergency: '#F97316', // coral orange
};

const SIG_COLORS: Record<string, string> = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };

// ─── Geo ─────────────────────────────────────────────────────
const BBOX = { minLng: 113.90, maxLng: 114.07, minLat: 22.49, maxLat: 22.56 };
const mx = (lng: number, w: number) => ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * w;
const my = (lat: number, h: number) => ((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * h;

// ─── Buildings ───────────────────────────────────────────────
const BUILDINGS: { n: string; lat: number; lng: number; s: number }[] = [
  { n: '平安金融中心',   lat: 22.5365, lng: 114.0555, s: 9  },
  { n: '京基100',       lat: 22.5450, lng: 114.0490, s: 8  },
  { n: '地王大厦',      lat: 22.5420, lng: 114.0600, s: 7  },
  { n: '腾讯滨海',      lat: 22.5220, lng: 113.9380, s: 10 },
  { n: '深圳湾体育中心', lat: 22.5180, lng: 113.9500, s: 11 },
  { n: '海岸城',        lat: 22.5185, lng: 113.9400, s: 8  },
];

// ─── Component ───────────────────────────────────────────────
export default function ShenzhenMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef    = useRef<Traffic3DSnapshot | null>(null);
  const lerpRef    = useRef<Map<number, { x: number; y: number }>>(new Map());
  const rafRef     = useRef(0);
  const [info, setInfo] = useState({ cars: 0, time: '', fps: 0 });
  const [hoverLabel, setHoverLabel] = useState<{ text: string; x: number; y: number } | null>(null);

  // Socket
  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    s.on('traffic:3d', (d: Traffic3DSnapshot) => {
      dataRef.current = d;
      setInfo(p => ({ ...p, cars: d.vehicles.length, time: d.timestamp }));
    });
    return () => { s.disconnect(); };
  }, []);

  // Canvas setup + render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let lt = performance.now(), fc = 0, fps = 0;
    const resize = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      canvas.width  = r.width  * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize(); window.addEventListener('resize', resize);

    // Hover label reveal
    const onMove = (e: MouseEvent) => {
      const data = dataRef.current;
      if (!data) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      let found: { text: string; x: number; y: number } | null = null;
      for (const isec of data.intersections) {
        const ix = mx(isec.position.lng, rect.width), iy = my(isec.position.lat, rect.height);
        if (Math.hypot(cx - ix, cy - iy) < 14) { found = { text: isec.nameZh, x: ix, y: iy - 16 }; break; }
      }
      setHoverLabel(found);
    };
    canvas.addEventListener('mousemove', onMove);
    const onLeave = () => setHoverLabel(null);
    canvas.addEventListener('mouseleave', onLeave);

    const loop = () => {
      const n = performance.now(); fc++;
      if (n - lt >= 1000) { fps = fc; fc = 0; lt = n; setInfo(p => ({ ...p, fps })); }
      draw(ctx, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio, dataRef.current, lerpRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: BG }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* HUD — light glass style */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        background: HUD_BG, borderRadius: 12, padding: '12px 18px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.05)',
        border: '1px solid rgba(0,0,0,0.04)',
        pointerEvents: 'none',
      }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#1e293b', marginBottom: 4 }}>深圳数字孪生</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
          <span>车辆 <b style={{ color: '#1E3A8A' }}>{info.cars}</b></span>
          <span>FPS <b style={{ color: info.fps >= 55 ? '#22c55e' : info.fps >= 30 ? '#eab308' : '#ef4444' }}>{info.fps}</b></span>
          <span>{new Date(info.time).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Legend — light glass */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 10,
        background: HUD_BG, borderRadius: 8, padding: '6px 14px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.03)',
        display: 'flex', gap: 14, fontSize: 11, color: '#64748b',
        pointerEvents: 'none',
      }}>
        {Object.entries(VC).map(([k, c]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}60` }} />
            {{car:'小车',bus:'公交',truck:'卡车',emergency:'应急'}[k]}
          </span>
        ))}
      </div>

      {/* Hover label */}
      {hoverLabel && (
        <div style={{
          position: 'absolute', left: hoverLabel.x, top: hoverLabel.y, zIndex: 20,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(255,255,255,0.95)', borderRadius: 6,
          padding: '5px 10px', fontSize: 11, color: '#334155',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.05)',
          border: '1px solid rgba(0,0,0,0.04)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          animation: 'fadeIn 0.15s ease-out',
        }}>
          {hoverLabel.text}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DRAW — Light Tech Canvas Render
// ═══════════════════════════════════════════════════════════════

function draw(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  data: Traffic3DSnapshot | null,
  lerpMap: Map<number, { x: number; y: number }>,
) {
  ctx.clearRect(0, 0, w, h);

  // ── Grid ──────────────────────────────────────────────────
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.5;
  for (let x = 60; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 60; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // ── Water ─────────────────────────────────────────────────
  const [wx, wy] = [mx(113.915, w), my(22.50, h)];
  ctx.fillStyle = 'rgba(79,172,254,0.06)';
  ctx.beginPath(); ctx.moveTo(0, h);
  ctx.quadraticCurveTo(wx, wy, w * 0.1, h * 0.78);
  ctx.lineTo(w * 0.1, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(79,172,254,0.2)';
  ctx.font = 'italic 11px sans-serif';
  ctx.fillText('深圳湾', wx + 36, wy + 18);

  // Empty state
  if (!data) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('等待交通仿真数据…', w / 2, h / 2); ctx.textAlign = 'start';
    return;
  }

  // ── Shadows ON — light theme needs depth ──────────────────
  ctx.shadowBlur = 4;
  ctx.shadowColor = 'rgba(0,0,0,0.08)';

  // ── Roads ─────────────────────────────────────────────────
  ctx.lineCap = 'round';
  for (let i = 0; i < data.intersections.length; i++) {
    for (let j = i + 1; j < data.intersections.length; j++) {
      const a = data.intersections[i].position, b = data.intersections[j].position;
      if (Math.hypot(a.lat - b.lat, a.lng - b.lng) < 0.04) {
        const x1 = mx(a.lng, w), y1 = my(a.lat, h), x2 = mx(b.lng, w), y2 = my(b.lat, h);
        // Shadow layer
        ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        // Core road
        ctx.strokeStyle = ROAD; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
  }

  // ── Buildings ─────────────────────────────────────────────
  for (const b of BUILDINGS) {
    const x = mx(b.lng, w), y = my(b.lat, h), s = b.s;
    ctx.fillStyle = 'rgba(79,172,254,0.1)';
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.strokeStyle = 'rgba(79,172,254,0.25)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - s, y - s, s * 2, s * 2);
  }

  // ── Intersections ─────────────────────────────────────────
  for (const isec of data.intersections) {
    const x = mx(isec.position.lng, w), y = my(isec.position.lat, h);
    ctx.fillStyle = 'rgba(79,172,254,0.5)';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    // Signal dots
    const dirs: [number, number][] = [[-7, 0], [7, 0], [0, -7], [0, 7]];
    const keys = Object.keys(isec.signalColors);
    for (let d = 0; d < 4; d++) {
      const sx = x + dirs[d][0], sy = y + dirs[d][1];
      const c = SIG_COLORS[isec.signalColors[keys[d]]] || '#94a3b8';
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Vehicles — Lerp interpolation ─────────────────────────
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'rgba(0,0,0,0.12)';

  for (const v of data.vehicles) {
    const tx = mx(v.position.lng, w);
    const ty = my(v.position.lat, h);

    let cur = lerpMap.get(v.id);
    if (!cur) { cur = { x: tx, y: ty }; lerpMap.set(v.id, cur); }
    cur.x += (tx - cur.x) * 0.15;
    cur.y += (ty - cur.y) * 0.15;

    const c = VC[v.type] || '#64748b';
    const r = v.type === 'bus' || v.type === 'truck' ? 3.5 : 2.5;

    // Body
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2); ctx.fill();
    // Core highlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(cur.x, cur.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Cleanup lerp
  const activeIds = new Set(data.vehicles.map(v => v.id));
  for (const id of lerpMap.keys()) { if (!activeIds.has(id)) lerpMap.delete(id); }
}
