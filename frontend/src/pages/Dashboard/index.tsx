// Dashboard 首页 —— 东西堆得有点多，后续考虑拆成子组件
// 目前把 JointPanel / GenerativePanel / PrivacyPanel / AIAdvice 全塞在一个页面里
// 性能上暂时没发现明显问题，但代码阅读体验一般
//
// TODO: 
//   - 把 stat card 抽成独立组件
//   - chart 的数据获取应该放到 hook 里，而不是直接在组件里拼
import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Row, Col, Tag } from 'antd';
import {
  CarOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useCountUp } from '../../hooks/useCountUp';
import { useWeather } from '../../hooks/useWeather';
import { useTrafficSim } from '../../hooks/useTrafficSim';
import Chart from '../../components/Charts';
import AIAdvice from '../../components/AIAdvice';
import JointPanel from '../../components/JointPanel';
import PrivacyPanel from '../../components/PrivacyPanel';
import GenerativePanel from '../../components/GenerativePanel';
import { ArbitragePanel } from '../../components/ArbitragePanel';
import SimToRealPanel from '../../components/SimToRealPanel';

// stat icon 颜色 —— 随便配的，不太好看但能用
const iconTheme: Record<string, { bg: string; fg: string }> = {
  trafficFlow:   { bg: 'rgba(79,195,247,0.12)', fg: '#4fc3f7' },
  solarOutput:   { bg: 'rgba(102,187,106,0.12)', fg: '#66bb6a' },
  batteryLevel:  { bg: 'rgba(255,167,38,0.12)', fg: '#ffa726' },
  temperature:   { bg: 'rgba(239,83,80,0.12)', fg: '#ef5350' },
};

// 车流量历史，rolling window 保持12个点
const MAX_HISTORY = 12;

// 算全市总车辆数，any 是因为类型没完全对齐，凑合用
function totalCars(simData: any): number {
  if (!simData?.zones) return 0;
  let sum = 0;
  for (const z of simData.zones) {
    for (const i of z.intersections) {
      for (const l of i.lanes) sum += l.carCount || 0;
    }
  }
  return sum;
}

// 平均拥堵指数，算法简单到有点假
function avgCongestion(simData: any): number {
  if (!simData?.zones) return 0;
  let sum = 0, count = 0;
  for (const z of simData.zones) {
    for (const i of z.intersections) {
      for (const l of i.lanes) { sum += l.congestionLevel || 0; count++; }
    }
  }
  return count > 0 ? sum / count : 0;
}

// stat card 组件 —— 单独拆出来是为了让 useCountUp 不违反 hooks 规则

function StatCard({ stat, mounted }: { stat: { key: string; icon: React.ReactNode; value: number; suffix: string; d: number }; mounted: boolean }) {
  const { t } = useLang();
  const raw = useCountUp(stat.value, 1500, mounted);
  const v = stat.d ? raw / 10 : raw;

  return (
    <Card className="glass-card" styles={{ body: { padding: 22 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div className="stat-icon-box" style={{ background: iconTheme[stat.key].bg, color: iconTheme[stat.key].fg }}>
          {stat.icon}
        </div>
        <span className="stat-label">{(t.dashboard as Record<string, string>)[stat.key]}</span>
      </div>
      <div className="stat-value">
        {stat.d ? v.toFixed(1) : v}
        <span className="stat-unit">{stat.suffix}</span>
      </div>
    </Card>
  );
}

// ─── Component ──────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useLang();
  const { data: weatherData } = useWeather();
  const { data: simData } = useTrafficSim();
  const mounted = true;

  // Rolling window of traffic history
  const [trafficHistory, setTrafficHistory] = useState<number[]>([]);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    const cars = totalCars(simData);
    if (cars === 0 && prevRef.current === 0) return;
    prevRef.current = cars;
    setTrafficHistory(prev => {
      const next = [...prev, cars];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  }, [simData]);

  // Live values
  const tempC = weatherData?.temperature ?? 26.5;
  const humidity = weatherData?.humidity ?? 60;
  const condition = weatherData?.weatherCondition ?? 'sunny';
  const solarFactor = weatherData?.solarFactor ?? 1;
  const liveCongestion = useMemo(() => simData ? Math.round(avgCongestion(simData)) : 83, [simData]);
  const totalCarsNow = useMemo(() => totalCars(simData), [simData]);
  const isRush = simData?.isRushHour;

  const solarBase = condition === 'sunny' ? 42 : condition === 'cloudy' ? 28 : 12;
  const batteryBase = condition === 'sunny' ? 67 : 45;
  const solarOutput = Math.round(solarBase * solarFactor * 10) / 10;
  const batteryLevel = Math.round(solarFactor * batteryBase + (1 - solarFactor) * 32);

  const trafficLabels = trafficHistory.length && simData
    ? trafficHistory.map((_, i) => {
        // Calculate sim minute offset from end: the rightmost label = current sim time
        // Each data point is one sim-minute apart
        const offset = trafficHistory.length - 1 - i; // 0 at newest (right), length-1 at oldest (left)
        let m = simData.simMinute - offset;
        let h = simData.simHour;
        while (m < 0) { m += 60; h = (h - 1 + 24) % 24; }
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      })
    : [];

  const stats = [
    { key: 'trafficFlow',  icon: <CarOutlined />,       value: liveCongestion,          suffix: '%',   d: 0 },
    { key: 'solarOutput',  icon: <ThunderboltOutlined />, value: Math.round(solarOutput * 10), suffix: 'kW',  d: 1 },
    { key: 'batteryLevel', icon: <DashboardOutlined />,  value: batteryLevel,           suffix: '%',   d: 0 },
    { key: 'temperature',  icon: <CloudOutlined />,      value: Math.round(tempC * 10), suffix: '°C', d: 1 },
  ];

  return (
    <div>
      {/* ========== Title ========== */}
      <h1 className="page-title anim-up">{t.dashboard.title}</h1>

      {/* ========== Status bar ========== */}
      <div className="anim-slide" style={{ marginBottom: 24 }}>
        <Card className="glass-card" styles={{ body: { padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12 } }}>
          <span className="status-dot online" />
          <span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 14 }}>{t.dashboard.systemStatus}</span>
          <span style={{ color: '#66bb6a', fontWeight: 600, fontSize: 14 }}>{t.dashboard.running}</span>
          <span style={{ color: 'rgba(13,27,62,0.3)', fontSize: 13 }}>· {t.dashboard.allNormal}</span>
          {simData && (
            <span style={{ color: 'rgba(13,27,62,0.25)', fontSize: 13, marginLeft: 12 }}>
              🕐 {simData.simTime} {isRush ? '🚨高峰' : '平峰'}
            </span>
          )}
          {weatherData && (
            <span style={{ color: 'rgba(13,27,62,0.25)', fontSize: 13, marginLeft: 'auto' }}>
              {condition === 'sunny' ? '☀️' : condition === 'cloudy' ? '⛅' : '🌧️'}
              {' '}深圳 · {tempC.toFixed(1)}°C · {humidity}%RH
            </span>
          )}
        </Card>
      </div>

      {/* ========== Stats ========== */}
      <Row gutter={[20, 20]} className="stagger">
        {stats.map((s) => (
          <Col xs={24} sm={12} lg={6} key={s.key}>
            <StatCard stat={s} mounted={mounted} />
          </Col>
        ))}
      </Row>

      {/* ========== Charts ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col xs={24} lg={16}>
          <Card
            className="glass-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.traffic.trafficFlow}</span>
                {simData && (
                  <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: isRush ? 'rgba(239,83,80,0.15)' : 'rgba(102,187,106,0.15)', color: isRush ? '#ef5350' : '#66bb6a', fontWeight: 600 }}>
                    {isRush ? '🚨 高峰' : '✅ 平峰'} · 全市 {totalCarsNow} 辆车
                  </Tag>
                )}
              </div>
            }
          >
            {mounted && trafficHistory.length > 1 ? (
              <Chart type="line" data={trafficHistory} categories={trafficLabels} color={['#4fc3f7']} />
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>
                {(t.status as Record<string, string>).waitingForData}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.dashboard.energyEfficiency}</span>}
          >
            <div style={{ padding: '8px 0' }}>
              {mounted && <Chart type="gauge" data={[78]} color={['#4fc3f7', '#66bb6a']} />}
            </div>
          </Card>
        </Col>
      </Row>

      {/* ========== Joint Energy-Traffic Optimization ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <JointPanel />
        </Col>
      </Row>

      {/* ========== Cross-Domain Causal Arbitrage ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <ArbitragePanel />
        </Col>
      </Row>

      {/* ========== Generative Urban Simulation ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <GenerativePanel />
        </Col>
      </Row>

      {/* ========== Federated Learning + DP ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <PrivacyPanel />
        </Col>
      </Row>

      {/* ========== Sim-to-Real Discrepancy Monitor ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <SimToRealPanel />
        </Col>
      </Row>

      {/* ========== AI Advice ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <AIAdvice mode="full" />
        </Col>
      </Row>
    </div>
  );
}
