import { useState, useEffect, useRef } from 'react';
import { Card, Tag } from 'antd';
import { useLang } from '../../i18n/LanguageContext';

interface Waypoint { x: number; y: number; label: string; }
interface Detection {
  id: number; time: string; location: string;
  type: 'car' | 'pedestrian' | 'congestion' | 'incident';
  detail: string;
}
interface DroneTelemetry { altitude: number; speed: number; battery: number; signal: number; }

interface CongestionPoint {
  location: string;    // waypoint label
  congestionPct: number; // 0-100
}

interface DroneFeedProps {
  externalDetections?: Detection[];
  externalTelemetry?: DroneTelemetry;
  /** Traffic congestion data from simulation — used to color the patrol route */
  congestionData?: CongestionPoint[];
  /** Most congested intersection for camera focus */
  hotspot?: string;
}

const PATROL_ROUTE: Waypoint[] = [
  { x: 12, y: 18, label: 'A-1' }, { x: 32, y: 12, label: 'A-2' },
  { x: 52, y: 16, label: 'A-3' }, { x: 72, y: 22, label: 'B-1' },
  { x: 82, y: 42, label: 'B-2' }, { x: 76, y: 62, label: 'B-3' },
  { x: 56, y: 76, label: 'C-1' }, { x: 34, y: 72, label: 'C-2' },
  { x: 18, y: 58, label: 'C-3' }, { x: 10, y: 36, label: 'D-1' },
];

const PATROL_SPEED = 2.8;

const BUILDINGS = [
  { x: 22, y: 22, w: 8, h: 6, color: 'rgba(102,187,106,0.08)' },
  { x: 45, y: 18, w: 6, h: 10, color: 'rgba(102,187,106,0.08)' },
  { x: 68, y: 28, w: 10, h: 7, color: 'rgba(129,212,140,0.07)' },
  { x: 38, y: 42, w: 7, h: 9, color: 'rgba(102,187,106,0.07)' },
  { x: 62, y: 48, w: 9, h: 6, color: 'rgba(239,83,80,0.06)' },
  { x: 20, y: 46, w: 6, h: 8, color: 'rgba(102,187,106,0.07)' },
  { x: 48, y: 58, w: 8, h: 7, color: 'rgba(129,212,140,0.06)' },
  { x: 72, y: 60, w: 6, h: 9, color: 'rgba(102,187,106,0.08)' },
  { x: 28, y: 66, w: 7, h: 6, color: 'rgba(102,187,106,0.06)' },
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function dist(ax: number, ay: number, bx: number, by: number) { return Math.sqrt((bx-ax)**2 + (by-ay)**2); }
function now() { return new Date().toLocaleTimeString(); }

const badgeColor = (t: string) => ({ car:'#4fc3f7', pedestrian:'#66bb6a', congestion:'#ffa726', incident:'#ef5350' }[t] || '#aaa');
const badgeLabel = (t: string) => ({ car:'CAR', pedestrian:'PED', congestion:'JAM', incident:'!' }[t] || '?');

export default function DroneFeed({ externalDetections, externalTelemetry, congestionData, hotspot }: DroneFeedProps) {
  const { t } = useLang();
  const isExternal = !!externalTelemetry;

  const [wpIndex, setWpIndex] = useState(0);
  const posRef = useRef({ x: PATROL_ROUTE[0].x, y: PATROL_ROUTE[0].y });
  const [pos, setPos] = useState(posRef.current);
  const progressRef = useRef(0);

  const [telemetry, setTelemetry] = useState<DroneTelemetry>({ altitude: 15, speed: 0, battery: 92, signal: 95 });
  const [detections, setDetections] = useState<Detection[]>([]);
  const [activeDetection, setActiveDetection] = useState<Detection | null>(null);
  const detIdRef = useRef(0);
  const lastDetectRef = useRef(0);
  const [_camView, setCamView] = useState(0);

  // Congestion map for route coloring
  const congMap = new Map<string, number>();
  if (congestionData) {
    for (const c of congestionData) congMap.set(c.location, c.congestionPct);
  }

  // Initialize
  useEffect(() => {
    const d: Detection = { id: detIdRef.current++, time: now(), location: PATROL_ROUTE[0].label, type: 'car', detail: 'Drone patrol started — connected to traffic model' };
    setDetections([d]); setActiveDetection(d);
  }, []);

  // Animation loop
  useEffect(() => {
    if (isExternal) return;
    let running = true; let lastTime = performance.now();
    const tick = (time: number) => {
      if (!running) return;
      const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
      const from = PATROL_ROUTE[wpIndex];
      const to = PATROL_ROUTE[(wpIndex + 1) % PATROL_ROUTE.length];
      const segLen = dist(from.x, from.y, to.x, to.y);
      const step = (PATROL_SPEED / segLen) * dt;
      progressRef.current += step;
      if (progressRef.current >= 1) {
        progressRef.current = 0;
        const nextWp = (wpIndex + 1) % PATROL_ROUTE.length;
        setWpIndex(nextWp);
        posRef.current = { x: PATROL_ROUTE[nextWp].x, y: PATROL_ROUTE[nextWp].y };
        setPos(posRef.current);
      } else {
        const eased = progressRef.current * progressRef.current * (3 - 2 * progressRef.current);
        posRef.current = { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased) };
        setPos({ ...posRef.current });
      }
      setTelemetry(prev => ({
        altitude: Math.max(5, Math.min(30, prev.altitude + (Math.random()-0.5)*0.4)),
        speed: 6 + Math.sin(time/2000)*2 + (Math.random()-0.5),
        battery: Math.max(10, prev.battery - Math.random()*0.005),
        signal: Math.max(60, Math.min(100, prev.signal + (Math.random()-0.5)*0.6)),
      }));
      if (Math.floor(time/4000) !== Math.floor((time-dt*1000)/4000)) setCamView(v => (v+1)%3);
      if (time - lastDetectRef.current > 4000 + Math.random()*3000) {
        lastDetectRef.current = time;
        const wp = PATROL_ROUTE[wpIndex];
        const cong = congMap.get(wp.label) || 0;
        const types: Detection['type'][] = cong > 60 ? ['congestion','incident','car'] : cong > 30 ? ['car','pedestrian','car'] : ['car','pedestrian','car'];
        const tpe = types[Math.floor(Math.random()*types.length)];
        const detail = tpe === 'congestion' ? `Congestion ${cong}% at ${wp.label} — traffic model alert`
          : tpe === 'incident' ? `Potential incident near ${wp.label}, high density`
          : tpe === 'pedestrian' ? `${Math.floor(3+cong/10)} pedestrians crossing ${wp.label}`
          : `${Math.floor(8+cong/3)} vehicles detected at ${wp.label}`;
        const d: Detection = { id: detIdRef.current++, time: now(), location: wp.label, type: tpe, detail };
        setDetections(prev => [d, ...prev].slice(0, 30));
        setActiveDetection(d);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { running = false; };
  }, [wpIndex, isExternal, congestionData]);

  // External sync
  useEffect(() => { if (externalTelemetry) setTelemetry(externalTelemetry); }, [externalTelemetry]);
  useEffect(() => {
    if (externalDetections && externalDetections.length > 0) {
      setDetections(prev => [...externalDetections.slice(0, 5), ...prev].slice(0, 30));
      setActiveDetection(externalDetections[0]);
    }
  }, [externalDetections]);

  const hotLabel = hotspot || (activeDetection?.location);

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      {/* Map */}
      <div className="glass-card" style={{ flex: '1 1 480px', minHeight: 400, position: 'relative', overflow: 'hidden', background: 'rgba(20,50,20,0.55) !important', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(102,187,106,0.015) 2px, rgba(102,187,106,0.015) 4px)', pointerEvents: 'none', zIndex: 5 }} />
        <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#66bb6a', display: 'inline-block' }} />
          <span style={{ color: 'rgba(200,240,200,0.6)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>{t.traffic.drone.liveFeed}</span>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 6 }}>
          <span style={{ color: 'rgba(180,220,180,0.3)', fontSize: 10, fontFamily: 'monospace' }}>{isExternal ? t.traffic.drone.hardwareMode : t.traffic.drone.simulation}</span>
        </div>

        {/* Road grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          {[0,10,20,30,40,50,60,70,80,90,100].map(y => <line key={'h'+y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(102,187,106,0.06)" strokeWidth="0.3" />)}
          {[0,10,20,30,40,50,60,70,80,90,100].map(x => <line key={'v'+x} x1={x} y1="0" x2={x} y2="100" stroke="rgba(102,187,106,0.06)" strokeWidth="0.3" />)}
          {/* Congestion heat on arteries */}
          {PATROL_ROUTE.map((wp, i) => {
            const cong = congMap.get(wp.label) || 0;
            const alpha = cong > 60 ? 0.3 : cong > 30 ? 0.15 : 0.05;
            const color = cong > 60 ? '#ef5350' : cong > 30 ? '#ffa726' : '#66bb6a';
            return <circle key={'heat'+i} cx={wp.x} cy={wp.y} r={2+ cong/20} fill={color} opacity={alpha} />;
          })}
          {/* Patrol route — color segments by congestion */}
          <path d={PATROL_ROUTE.map((p,i) => `${i===0?'M':'L'}${p.x} ${p.y}`).join(' ')+'Z'} fill="none" stroke="rgba(102,187,106,0.2)" strokeWidth="0.5" strokeDasharray="1 0.8" />
        </svg>

        {BUILDINGS.map((b,i) => <div key={i} style={{ position:'absolute', left:`${b.x}%`, top:`${b.y}%`, width:`${b.w}%`, height:`${b.h}%`, background:b.color, borderRadius:2, border:'1px solid rgba(255,255,255,0.03)', zIndex:1 }} />)}

        {/* Waypoints with congestion color */}
        {PATROL_ROUTE.map((wp,i) => {
          const cong = congMap.get(wp.label) || 0;
          const ringColor = cong > 60 ? 'rgba(239,83,80,0.3)' : cong > 30 ? 'rgba(255,167,38,0.2)' : 'rgba(102,187,106,0.15)';
          return <div key={i} style={{ position:'absolute', left:`calc(${wp.x}% - 7px)`, top:`calc(${wp.y}% - 7px)`, width:16, height:16, borderRadius:'50%', background:'rgba(102,187,106,0.08)', border:`1px solid ${ringColor}`, display:'flex',alignItems:'center',justifyContent:'center', zIndex:2, fontSize:5, color:'rgba(200,240,200,0.25)', fontFamily:'monospace' }} title={wp.label}>{i+1}</div>;
        })}

        {/* Drone */}
        <div style={{ position:'absolute', left:`calc(${pos.x}% - 14px)`, top:`calc(${pos.y}% - 14px)`, width:28, height:28, zIndex:4, filter:'drop-shadow(0 0 8px rgba(102,187,106,0.5))', pointerEvents:'none' }}>
          <div style={{ position:'absolute', inset:-8, borderRadius:'50%', background:'radial-gradient(circle, rgba(102,187,106,0.2) 0%, transparent 70%)', animation:'pulseGlow 2s ease-in-out infinite' }} />
          <svg viewBox="0 0 24 24" fill="none" style={{ width:28, height:28, position:'relative', zIndex:1 }}>
            <circle cx="12" cy="12" r="3" fill="#66bb6a" opacity={0.9} />
            <path d="M12 2L14 7H10L12 2Z" fill="#66bb6a" opacity={0.6} />
            <path d="M12 22L14 17H10L12 22Z" fill="#66bb6a" opacity={0.6} />
            <path d="M2 12L7 10V14L2 12Z" fill="#66bb6a" opacity={0.6} />
            <path d="M22 12L17 10V14L22 12Z" fill="#66bb6a" opacity={0.6} />
            <circle cx="12" cy="12" r="1" fill="#fff" opacity={0.8} />
          </svg>
        </div>

        {/* Detection pulse */}
        {activeDetection && <div style={{ position:'absolute', left:`calc(${pos.x}% - 25px)`, top:`calc(${pos.y}% - 25px)`, width:50, height:50, borderRadius:'50%', border:'2px solid rgba(239,83,80,0.3)', animation:'ping 1.5s ease-out infinite', zIndex:3, pointerEvents:'none' }} />}

        {activeDetection && <Tag color={badgeColor(activeDetection.type)} style={{ position:'absolute', left:`calc(${pos.x}% + 18px)`, top:`calc(${pos.y}% + 18px)`, zIndex:5, fontSize:10, fontWeight:600, borderRadius:6, border:'none', margin:0, animation:'fadeIn 0.3s ease-out', pointerEvents:'none', fontFamily:'monospace' }}>{activeDetection.location} · {activeDetection.detail}</Tag>}
      </div>

      {/* Side Panel */}
      <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 220 }}>
        {/* Telemetry */}
        <Card className="glass-card" styles={{ body: { padding: 16 } }} style={{ margin: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(30,60,30,0.45)', fontWeight: 600, marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.traffic.drone.telemetry}</div>
          {[
            { key:'altitude', label:t.traffic.drone.altitude, value:`${telemetry.altitude.toFixed(1)}m`, pct:telemetry.altitude/30 },
            { key:'speed', label:t.traffic.drone.speed, value:`${telemetry.speed.toFixed(1)} km/h`, pct:telemetry.speed/12 },
            { key:'battery', label:t.traffic.drone.battery, value:`${telemetry.battery.toFixed(0)}%`, pct:telemetry.battery/100, color:telemetry.battery>30?'#66bb6a':'#ef5350' },
            { key:'signal', label:t.traffic.drone.signal, value:`${telemetry.signal.toFixed(0)}%`, pct:telemetry.signal/100, color:telemetry.signal>70?'#66bb6a':'#ffa726' },
          ].map(m => (
            <div key={m.key} style={{ marginBottom: 10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                <span style={{ color:'rgba(30,60,30,0.5)', fontWeight:500 }}>{m.label}</span>
                <span style={{ color:'#1a3c1a', fontWeight:600, fontFamily:'monospace' }}>{m.value}</span>
              </div>
              <div style={{ height:3, borderRadius:2, background:'rgba(102,187,106,0.08)', overflow:'hidden' }}>
                <div style={{ width:`${m.pct*100}%`, height:'100%', borderRadius:2, background: m.color || 'linear-gradient(90deg, #66bb6a, #81d48c)', transition:'width 0.3s ease' }} />
              </div>
            </div>
          ))}
        </Card>

        {/* Camera View — shows hotspot */}
        <Card className="glass-card" styles={{ body: { padding: 0, overflow: 'hidden' } }} style={{ margin: 0 }}>
          <div style={{ height: 130, background: '#0a1a0a', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,255,136,0.03) 1px, rgba(0,255,136,0.03) 2px)', zIndex: 1 }} />
            <div style={{ textAlign: 'center', zIndex: 2, position: 'relative' }}>
              <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 4 }}>🚁</div>
              <div style={{ fontSize: 11, color: 'rgba(102,187,106,0.5)', fontFamily: 'monospace', letterSpacing: 0.5 }}>
                {hotLabel ? `▶ ${hotLabel}` : t.traffic.drone.cameraIntersection}
              </div>
              {activeDetection && <div style={{ fontSize: 9, color: 'rgba(102,187,106,0.3)', marginTop: 3, fontFamily: 'monospace' }}>{activeDetection.detail}</div>}
            </div>
            <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(102,187,106,0.06)', borderRadius: 'inherit', pointerEvents: 'none', zIndex: 3 }} />
            {[{ top: 4, left: 4 },{ top: 4, right: 4 },{ bottom: 4, left: 4 },{ bottom: 4, right: 4 }].map((pos,i) => (
              <div key={i} style={{ position:'absolute', width:10, height:10, ...pos, borderColor:'rgba(102,187,106,0.15)', borderStyle:'solid', borderWidth: pos.left ? '1px 0 0 1px' : pos.right ? '1px 1px 0 0' : '0 0 1px 1px', zIndex:4 }} />
            ))}
            <div style={{ position:'absolute', top:8, right:10, zIndex:4, display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:'#ef5350', display:'inline-block', animation:'pulseGlow 1s ease-in-out infinite' }} />
              <span style={{ fontSize:8, color:'rgba(239,83,80,0.5)', fontFamily:'monospace', letterSpacing:1 }}>REC</span>
            </div>
          </div>
        </Card>

        {/* Detection Log */}
        <Card className="glass-card" styles={{ body: { padding: 12 } }} style={{ margin: 0, flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(30,60,30,0.45)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.traffic.drone.detectionLog}</div>
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {detections.slice(0, 12).map((d) => (
              <div key={d.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 6px', borderRadius:6, background: d.id===activeDetection?.id ? 'rgba(102,187,106,0.06)' : 'transparent', fontSize:11 }}>
                <span style={{ display:'inline-block', padding:'0 5px', borderRadius:3, background:`${badgeColor(d.type)}1a`, color:badgeColor(d.type), fontSize:9, fontWeight:700, fontFamily:'monospace' }}>{badgeLabel(d.type)}</span>
                <span style={{ color:'rgba(30,60,30,0.3)', fontSize:10, fontFamily:'monospace', flexShrink:0 }}>{d.location}</span>
                <span style={{ color:'rgba(30,60,30,0.55)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.detail}</span>
                <span style={{ color:'rgba(30,60,30,0.2)', fontSize:9, fontFamily:'monospace', flexShrink:0 }}>{d.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <style>{`@keyframes ping { 0%{transform:scale(0.5);opacity:0.6} 100%{transform:scale(2);opacity:0} }`}</style>
    </div>
  );
}
