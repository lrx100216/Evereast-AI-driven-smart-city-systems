import { Card, Tag, Button, message } from 'antd';
import { useLang } from '../../i18n/LanguageContext';
import { API_URL } from '../../config';
import type { TrafficSimData, ZoneData, IntersectionData } from '../../hooks/useTrafficSim';
import IntersectionCanvas from './IntersectionCanvas';
import axios from 'axios';

// zone 颜色配置 —— 硬编码，懒得抽到 theme 里
const ZONE_CFG: Record<string, { grad: string; border: string; color: string }> = {
  industrial:  { grad: 'linear-gradient(135deg, rgba(79,195,247,0.08), rgba(79,195,247,0.02))', border: 'rgba(79,195,247,0.12)',  color: '#4fc3f7' },
  tech_park:   { grad: 'linear-gradient(135deg, rgba(102,187,106,0.08), rgba(102,187,106,0.02))', border: 'rgba(102,187,106,0.12)', color: '#66bb6a' },
  school:      { grad: 'linear-gradient(135deg, rgba(255,167,38,0.08), rgba(255,167,38,0.02))', border: 'rgba(255,167,38,0.12)', color: '#ffa726' },
  commercial:  { grad: 'linear-gradient(135deg, rgba(239,83,80,0.08), rgba(239,83,80,0.02))', border: 'rgba(239,83,80,0.12)',  color: '#ef5350' },
  residential: { grad: 'linear-gradient(135deg, rgba(171,71,188,0.08), rgba(171,71,188,0.02))', border: 'rgba(171,71,188,0.12)', color: '#ab47bc' },
};

function zoneGradient(type: string): string { return ZONE_CFG[type]?.grad ?? 'transparent'; }
function zoneBorder(type: string): string { return ZONE_CFG[type]?.border ?? 'transparent'; }
function zoneColor(type: string): string { return ZONE_CFG[type]?.color ?? '#aaa'; }

const TIME_ICONS: Record<string, string> = {
  dawn: '🌅', morning: '☀️', noon: '🌤️', afternoon: '⛅', evening: '🌇', night: '🌙',
};

// ─── Intersection card ──────────────────────────────────

function IntersectionCard({
  intersection,
  type,
  onApplySignal,
}: {
  intersection: IntersectionData;
  type: string;
  onApplySignal: (id: string, direction: string, duration: number) => void;
}) {
  const { t: _t } = useLang();
  const dirs = ['N', 'S', 'E', 'W'] as const;
  const color = zoneColor(type);

  return (
    <Card
      size="small"
      styles={{ body: { padding: 8 } }}
      style={{
        background: 'rgba(255,255,255,0.4)',
        borderRadius: 12,
        border: `1px solid rgba(13,27,62,0.3)`,
        overflow: 'hidden',
      }}
    >
      {/* Intersection name */}
      <div style={{ fontSize: 10, fontWeight: 600, color: '#0d1b3e', marginBottom: 4, textAlign: 'center' }}>
        {intersection.name}
      </div>

      {/* Canvas */}
      <IntersectionCanvas intersection={intersection} />

      {/* Per-direction signal status */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'center' }}>
        {dirs.map((d) => {
          const sig = intersection.signals[d];
          return (
            <div
              key={d}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '1px 0',
                borderRadius: 4,
                fontSize: 8,
                fontWeight: 700,
                fontFamily: 'monospace',
                background: sig.green ? 'rgba(102,187,106,0.1)' : 'rgba(239,83,80,0.08)',
                color: sig.green ? '#66bb6a' : '#ef5350',
              }}
            >
              {d} {sig.remaining}s
            </div>
          );
        })}
      </div>

      {/* Per-direction control buttons */}
      <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
        {dirs.map((d) => (
          <Button
            key={d}
            size="small"
            onClick={() => onApplySignal(intersection.id, d, 15)}
            style={{
              flex: 1,
              height: 22,
              fontSize: 9,
              fontWeight: 600,
              borderRadius: 4,
              padding: 0,
              border: `1px solid ${color}22`,
              color: color,
              background: `${color}08`,
            }}
          >
            {d}→15s
          </Button>
        ))}
      </div>
    </Card>
  );
}

// ─── Zone card ──────────────────────────────────────────

function ZoneCard({ zone, onApplySignal }: { zone: ZoneData; onApplySignal: (id: string, d: string, n: number) => void }) {
  const isThreeCol = zone.intersections.length >= 3;

  return (
    <div
      className="zone-card"
      style={{
        background: zoneGradient(zone.type),
        borderRadius: 16,
        border: `1px solid ${zoneBorder(zone.type)}`,
        padding: 14,
      }}
    >
      {/* Zone header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: zoneColor(zone.type),
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0d1b3e' }}>
          {zone.nameZh}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.3)' }}>
          {zone.name}
        </span>
      </div>
      {/* Animated intersections */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {zone.intersections.map((isec) => (
          <div
            key={isec.id}
            style={{
              flex: isThreeCol ? '1 1 160px' : '1 1 200px',
              maxWidth: isThreeCol ? 185 : 220,
              minWidth: 160,
            }}
          >
            <IntersectionCard intersection={isec} type={zone.type} onApplySignal={onApplySignal} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────

export default function TrafficSystem({ data }: { data?: TrafficSimData } = {}) {
  const { t } = useLang();

  const applySignal = async (intersectionId: string, direction: string, greenDuration: number) => {
    try {
      await axios.post(`${API_URL}/traffic-sim/signal/cycle`, { intersectionId, direction, greenDuration });
      message.success(`${direction}方向已调整`);
    } catch {
      message.error('调整失败');
    }
  };

  if (!data) {
    return (
      <Card className="glass-card" styles={{ body: { padding: 24, textAlign: 'center' } }}>
        <div className="anim-breathe" style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid rgba(79,195,247,0.2)',
          borderTopColor: '#4fc3f7',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 12px',
        }} />
        <div style={{ fontSize: 13, color: 'rgba(13,27,62,0.35)' }}>
          {t.trafficSystem?.loading || '加载交通仿真数据...'}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </Card>
    );
  }

  const gridLayout: (ZoneData | null)[][] = [
    [null, null, null],
    [null, null, null],
  ];
  for (const zone of data.zones) {
    if (zone.type === 'industrial') gridLayout[0][0] = zone;
    else if (zone.type === 'tech_park') gridLayout[0][1] = zone;
    else if (zone.type === 'commercial') gridLayout[0][2] = zone;
    else if (zone.type === 'residential') gridLayout[1][0] = zone;
    else if (zone.type === 'school') gridLayout[1][1] = zone;
  }

  return (
    <div>
      {/* Sim time header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          marginBottom: 20, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{TIME_ICONS[data.timeOfDay] || '🌤️'}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#0d1b3e', fontFamily: 'monospace', letterSpacing: 1 }}>
            {data.simTime}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Tag
            style={{
              borderRadius: 6, border: 'none', fontSize: 11,
              background: data.isRushHour ? 'rgba(239,83,80,0.1)' : 'rgba(102,187,106,0.1)',
              color: data.isRushHour ? '#ef5350' : '#66bb6a',
              fontWeight: 600, padding: '2px 10px',
            }}
          >
            {data.isRushHour ? (t.trafficSystem?.rushHour || '🚨 高峰时段') : (t.trafficSystem?.smooth || '✅ 平峰时段')}
          </Tag>
          {data.isRushHour && (
            <Tag
              style={{
                borderRadius: 6, border: 'none', fontSize: 11,
                background: 'rgba(255,167,38,0.1)', color: '#ffa726',
                fontWeight: 600, padding: '2px 10px',
              }}
            >
              ⚠️ {t.trafficSystem?.congestionWarning || '全市拥堵预警'}
            </Tag>
          )}
        </div>
        {/* Summary stats */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          {(() => {
            const totalCars = data.zones.reduce(
              (s, z) => s + z.intersections.reduce(
                (s2, isec) => s2 + isec.lanes.reduce((s3, l) => s3 + l.carCount, 0), 0
              ), 0
            );
            const totalLanes = data.zones.reduce(
              (s, z) => s + z.intersections.reduce(
                (s2, isec) => s2 + isec.lanes.length, 0
              ), 0
            );
            const avgSpeed = data.zones.reduce(
              (s, z) => s + z.intersections.reduce(
                (s2, isec) => s2 + isec.lanes.reduce((s3, l) => s3 + l.avgSpeed, 0), 0
              ), 0
            ) / Math.max(1, totalLanes);
            return (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0d1b3e', fontFamily: 'monospace' }}>{totalCars}</div>
                  <div style={{ fontSize: 10, color: 'rgba(13,27,62,0.3)' }}>{t.trafficSystem?.totalVehicles || '总车辆'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0d1b3e', fontFamily: 'monospace' }}>{avgSpeed.toFixed(0)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(13,27,62,0.3)' }}>km/h</div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* City grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 14,
        }}
      >
        {gridLayout.flat().map((zone, i) => (
          <div key={i}>
            {zone ? (
              <ZoneCard zone={zone} onApplySignal={applySignal} />
            ) : (
              <div style={{
                height: '100%', minHeight: 200,
                borderRadius: 16, border: '1px dashed rgba(79,195,247,0.08)',
                background: 'rgba(79,195,247,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'rgba(13,27,62,0.2)',
              }}>
                {t.trafficSystem?.greenArea || '绿化带'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
