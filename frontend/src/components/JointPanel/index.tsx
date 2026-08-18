import { Card, Row, Col } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useJoint, type EVChargingStation } from '../../hooks/useJoint';

const T = 'rgba(13,27,62,';

function StationCard({ s, t }: { s: EVChargingStation; t: Record<string, string> }) {
  const discountColor = s.solarDiscount > 0.2 ? '#2e7d32' : s.solarDiscount > 0 ? '#e65100' : `${T}0.35)`;
  const bgColor = s.solarPowered
    ? 'rgba(102,187,106,0.08)'
    : `${T}0.03)`;
  const borderColor = s.solarPowered ? 'rgba(102,187,106,0.25)' : `${T}0.08)`;

  return (
    <div style={{
      background: bgColor, borderRadius: 10, padding: '10px 12px',
      border: `1px solid ${borderColor}`, minWidth: 150,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0d1b3e', marginBottom: 4 }}>
        {s.nameZh}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: `${T}0.45)` }}>{t.price}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: discountColor, fontFamily: 'monospace' }}>
          ¥{s.currentPrice}
          {s.solarDiscount > 0.1 && (
            <span style={{ fontSize: 10, marginLeft: 4, color: '#2e7d32' }}>-{Math.round(s.solarDiscount * 100)}%</span>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: `${T}0.35)` }}>
        <span>{t.cars}: {s.currentCars}/{s.capacity}</span>
        <span>{s.totalLoad}kW</span>
      </div>
      {s.queueLength > 0 && (
        <div style={{ fontSize: 10, color: '#c62828', marginTop: 2 }}>排队: {s.queueLength}</div>
      )}
    </div>
  );
}

export default function JointPanel() {
  const { t } = useLang();
  const jT = t.joint as Record<string, string>;
  const { snapshot } = useJoint();

  if (!snapshot) {
    return (
      <Card className="glass-card" title={<span style={{ color: '#0d1b3e' }}>{jT.title}</span>} styles={{ body: { padding: 16 } }}>
        <div style={{ textAlign: 'center', padding: 20, color: `${T}0.25)`, fontSize: 13 }}>等待数据…</div>
      </Card>
    );
  }

  return (
    <Card
      className="glass-card"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThunderboltOutlined style={{ fontSize: 18, color: snapshot.solarSurplus ? '#2e7d32' : '#e65100' }} />
          <span style={{ color: '#0d1b3e', fontWeight: 600 }}>{jT.title}</span>
          <span style={{ fontSize: 12, color: `${T}0.35)`, fontFamily: 'monospace' }}>{snapshot.simTime}</span>
        </div>
      }
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* Solar Surplus Banner */}
      {snapshot.solarSurplus ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(102,187,106,0.12), rgba(102,187,106,0.03))',
          border: '1px solid rgba(102,187,106,0.2)', borderRadius: 10,
          padding: '10px 16px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2e7d32', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 20 }}>☀</span> {jT.solarSurplus}
          </div>
          {snapshot.notifyMessageZh && (
            <div style={{ fontSize: 12, color: `${T}0.55)`, marginTop: 4 }}>
              {snapshot.notifyMessageZh}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: `${T}0.03)`, borderRadius: 10, border: `1px solid ${T}0.06)`,
          padding: '8px 16px', marginBottom: 14, textAlign: 'center', fontSize: 12, color: `${T}0.4)`,
        }}>
          {jT.noSurplus} · 电价 ¥{snapshot.gridPrice}/kWh
        </div>
      )}

      {/* Cost Breakdown */}
      <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
        <Col span={8}>
          <div style={{ textAlign: 'center', background: 'rgba(79,195,247,0.06)', borderRadius: 8, padding: '8px 4px', border: '1px solid rgba(79,195,247,0.1)' }}>
            <div style={{ fontSize: 10, color: `${T}0.4)` }}>{jT.electricityCost}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0277bd', fontFamily: 'monospace' }}>¥{snapshot.lyapunovCost}</div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{ textAlign: 'center', background: 'rgba(255,167,38,0.06)', borderRadius: 8, padding: '8px 4px', border: '1px solid rgba(255,167,38,0.1)' }}>
            <div style={{ fontSize: 10, color: `${T}0.4)` }}>{jT.carbonCost}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e65100', fontFamily: 'monospace' }}>¥{snapshot.lyapunovCarbon}</div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{ textAlign: 'center', background: 'rgba(102,187,106,0.06)', borderRadius: 8, padding: '8px 4px', border: '1px solid rgba(102,187,106,0.1)' }}>
            <div style={{ fontSize: 10, color: `${T}0.4)` }}>{jT.totalCost}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2e7d32', fontFamily: 'monospace' }}>¥{snapshot.lyapunovDPP}</div>
          </div>
        </Col>
      </Row>

      {/* EV Charging Stations Grid */}
      <div style={{ fontSize: 12, fontWeight: 600, color: `${T}0.5)`, marginBottom: 8 }}>
        {jT.chargingStations} ({snapshot.stations.length})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8, marginBottom: 14 }}>
        {snapshot.stations.map(s => (
          <StationCard key={s.id} s={s} t={jT} />
        ))}
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'flex', justifyContent: 'space-around', padding: '8px 0',
        borderTop: `1px solid ${T}0.06)`, fontSize: 11, color: `${T}0.45)`,
      }}>
        <span>{jT.evLoad}: <b style={{ color: '#0277bd' }}>{snapshot.totalEvLoad} kW</b></span>
        <span>{jT.congestion}: <b style={{ color: '#e65100' }}>{snapshot.congestionLevel}</b></span>
        <span>{jT.gridLoad}: <b style={{ color: '#0d1b3e' }}>{snapshot.totalGridLoad.toFixed(1)} MW</b></span>
      </div>
    </Card>
  );
}
