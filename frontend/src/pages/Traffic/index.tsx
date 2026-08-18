/**
 * 【模块说明】Traffic 交通监控 — 城市交通仿真与信号优化页面
 * Module: Traffic — Urban traffic simulation and signal optimization
 *
 * 【功能】展示实时交通流量/行人/平均车速/拥堵统计、城市路网仿真、
 *         信号灯MARL控制、What-If沙盘、无人机监测、AI建议
 * Function: Displays traffic stats, city grid simulation, MARL signal
 *           control, what-if sandbox, drone feed, and AI advice.
 *
 * 【关键配置】
 * - MAX_HISTORY: 实时车流量折线图历史数据点数量（默认12）
 * - SPEED_OPTIONS: 仿真倍速选项（0.25× ~ 8×）
 * - iconTheme: 统计卡片图标颜色主题
 *
 * 【主要组件/函数】
 * - StatCard: 带数字跳动动画的统计卡片
 * - setSimSpeed: 通过 API 设置仿真倍速
 * - derivedStats: 从交通仿真数据聚合车辆/行人/车速/拥堵指标
 * - droneDetections: 从仿真数据生成无人机检测事件
 * - congestionData / congestionHotspot: 拥堵数据与热点提取
 *
 * 【依赖 Hooks】
 * - useLang: 国际化多语言
 * - useCountUp: 数字递增动画
 * - useTrafficSim: 实时交通仿真数据
 */
import { useState, useMemo, useEffect } from 'react';
import { Card, Row, Col, Button, Slider } from 'antd';
import { CarOutlined, TeamOutlined, DashboardOutlined, BulbOutlined, FieldTimeOutlined } from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useCountUp } from '../../hooks/useCountUp';
import { useTrafficSim } from '../../hooks/useTrafficSim';
import { API_URL } from '../../config';
import Chart from '../../components/Charts';
import DroneFeed from '../../components/DroneFeed';
import AIAdvice from '../../components/AIAdvice';
import TrafficSystem from '../../components/TrafficSystem';
import MARLPanel from '../../components/MARLPanel';
import WhatIfPanel from '../../components/WhatIfPanel';
import axios from 'axios';

const MAX_HISTORY = 12;
const SPEED_OPTIONS: Record<number, string> = {
  0.25: '0.25×', 0.5: '0.5×', 1: '1×', 2: '2×', 4: '4×', 8: '8×',
};

const iconTheme: Record<string, { bg: string; fg: string }> = {
  trafficFlow:     { bg: 'rgba(79,195,247,0.12)', fg: '#4fc3f7' },
  pedestrianFlow:  { bg: 'rgba(102,187,106,0.12)', fg: '#66bb6a' },
  avgSpeed:        { bg: 'rgba(255,167,38,0.12)', fg: '#ffa726' },
  congestion:      { bg: 'rgba(239,83,80,0.12)', fg: '#ef5350' },
};

function StatCard({ stat, mounted }: { stat: { key: string; icon: React.ReactNode; value: number; suffix: string }; mounted: boolean }) {
  const { t } = useLang();
  const v = useCountUp(stat.value, 1500, mounted);
  return (
    <Card className="glass-card" styles={{ body: { padding: 22 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div className="stat-icon-box" style={{ background: iconTheme[stat.key].bg, color: iconTheme[stat.key].fg }}>
          {stat.icon}
        </div>
        <span className="stat-label">{(t.traffic as any)[stat.key]}</span>
      </div>
      <div className="stat-value">
        {v}
        <span className="stat-unit">{stat.suffix}</span>
      </div>
    </Card>
  );
}

export default function Traffic() {
  const { t } = useLang();
  const [mounted] = useState(true);
  const { data: trafficData } = useTrafficSim();
  const [speed, setSpeed] = useState(1);

  // Rolling window for real-time traffic flow chart
  const [trafficHistory, setTrafficHistory] = useState<{ value: number; label: string }[]>([]);

  useEffect(() => {
    if (!trafficData) return;
    let cars = 0;
    for (const z of trafficData.zones) {
      for (const i of z.intersections) {
        for (const l of i.lanes) cars += l.carCount;
      }
    }
    setTrafficHistory(prev => {
      const next = [...prev, { value: cars, label: trafficData.simTime }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  }, [trafficData]);

  const setSimSpeed = async (val: number) => {
    setSpeed(val);
    try { await axios.post(`${API_URL}/traffic-sim/speed`, { speed: val }); } catch {}
  };

  // Derive stats from real traffic simulation data
  const derivedStats = useMemo(() => {
    if (!trafficData?.zones) {
      return { totalCars: 0, totalPeds: 0, avgSpeed: 0, avgCongestion: 0 };
    }
    let totalCars = 0, totalPeds = 0, speedSum = 0, speedCount = 0, congSum = 0, congCount = 0;
    for (const z of trafficData.zones) {
      for (const isec of z.intersections) {
        totalPeds += isec.pedestrianCount;
        for (const l of isec.lanes) {
          totalCars += l.carCount;
          speedSum += l.avgSpeed;
          speedCount++;
          congSum += l.congestionLevel;
          congCount++;
        }
      }
    }
    return {
      totalCars,
      totalPeds,
      avgSpeed: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
      avgCongestion: congCount > 0 ? Math.round(congSum / congCount) : 0,
    };
  }, [trafficData]);

  const stats = [
    { key: 'trafficFlow', icon: <CarOutlined />, value: derivedStats.totalCars, suffix: '' },
    { key: 'pedestrianFlow', icon: <TeamOutlined />, value: derivedStats.totalPeds, suffix: '' },
    { key: 'avgSpeed', icon: <DashboardOutlined />, value: derivedStats.avgSpeed, suffix: 'km/h' },
    { key: 'congestion', icon: <BulbOutlined />, value: derivedStats.avgCongestion, suffix: '%' },
  ];

  // Derive drone detections from traffic simulation data (no side effects in useMemo)
  const droneDetections = useMemo(() => {
    if (!trafficData) return undefined;
    const dets: Array<{ id: number; time: string; location: string; type: 'car' | 'pedestrian' | 'congestion' | 'incident'; detail: string }> = [];
    const now = new Date().toLocaleTimeString();
    let localId = 0;
    for (const zone of trafficData.zones) {
      for (const isec of zone.intersections) {
        const totalCars = isec.lanes.reduce((s, l) => s + l.carCount, 0);
        const totalPeds = isec.pedestrianCount;
        const avgCong = isec.lanes.reduce((s, l) => s + l.congestionLevel, 0) / Math.max(1, isec.lanes.length);
        if (totalCars > 0) { dets.push({ id: ++localId, time: now, location: isec.name, type: 'car', detail: `${totalCars} vehicles, avg ${Math.round(isec.lanes.reduce((s, l) => s + l.avgSpeed, 0) / Math.max(1, isec.lanes.length))} km/h` }); }
        if (totalPeds > 0) { dets.push({ id: ++localId, time: now, location: isec.name, type: 'pedestrian', detail: `${totalPeds} pedestrians detected` }); }
        if (avgCong > 50) { dets.push({ id: ++localId, time: now, location: isec.name, type: 'congestion', detail: `congestion ${Math.round(avgCong)}%` }); }
        for (const lane of isec.lanes) {
          if (lane.congestionLevel > 80 && lane.avgSpeed > 10) { dets.push({ id: ++localId, time: now, location: isec.name, type: 'incident', detail: `High speed on congested lane (${lane.direction})` }); }
        }
      }
    }
    return dets.slice(0, 10);
  }, [trafficData]);

  const chartValues = useMemo(() => trafficHistory.map(h => h.value), [trafficHistory]);
  const chartLabels = useMemo(() => trafficHistory.map(h => h.label), [trafficHistory]);

  // Memoize congestion data for DroneFeed
  const congestionData = useMemo(() =>
    trafficData?.zones.flatMap(z => z.intersections.flatMap(i => i.lanes.map(l => ({
      location: i.name, congestionPct: l.congestionLevel
    }))))?.filter((_, idx) => idx % 4 === 0),
  [trafficData]);

  const congestionHotspot = useMemo(() =>
    trafficData?.zones.flatMap(z => z.intersections).sort((a, b) => {
      const aMax = Math.max(...a.lanes.map(l => l.congestionLevel));
      const bMax = Math.max(...b.lanes.map(l => l.congestionLevel));
      return bMax - aMax;
    })[0]?.name,
  [trafficData]);

  return (
    <div>
      <h1 className="page-title anim-up">{t.traffic.title}</h1>

      <Row gutter={[20, 20]} className="stagger">
        {stats.map((s) => (
          <Col xs={12} lg={6} key={s.key}>
            <StatCard stat={s} mounted={mounted} />
          </Col>
        ))}
      </Row>

      {/* Traffic Simulation City Grid */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.trafficSystem?.title || '城市交通仿真'}</span>}
            extra={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FieldTimeOutlined style={{ color: 'rgba(13,27,62,0.3)' }} />
                <Slider
                  min={0.25} max={8} step={0.25}
                  value={speed}
                  onChange={setSimSpeed}
                  style={{ width: 120, margin: 0 }}
                  tooltip={{ formatter: (v?: number) => v ? `${v}×` : '1×' }}
                />
                <span style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', minWidth: 32 }}>{SPEED_OPTIONS[speed] || `${speed}×`}</span>
              </div>
            }
          >
            <TrafficSystem data={trafficData ?? undefined} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col xs={24} lg={14}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.traffic.trafficFlow}</span>}
          >
            {mounted && chartValues.length > 1 ? (
              <Chart type="line" data={chartValues} categories={chartLabels} color={['#4fc3f7']} />
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>
                {(t.status as Record<string, string>).waitingForData}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.traffic.signalControl}</span>}
          >
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 20 }}>
                {['#ef5350', '#ffa726', '#66bb6a'].map((c, i) => (
                  <div key={i} className="anim-breathe" style={{ width: 14, height: 14, borderRadius: '50%', background: c, boxShadow: `0 0 12px ${c}80`, animationDelay: `${i * 0.3}s` }} />
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(13,27,62,0.45)', marginBottom: 16, lineHeight: 1.6 }}>
                {t.traffic.aiAdjusted}
              </div>
              <Button type="primary" icon={<BulbOutlined />}
                style={{ borderRadius: 10, background: 'linear-gradient(135deg, #4fc3f7, #66bb6a)', border: 'none', boxShadow: '0 4px 14px rgba(79,195,247,0.3)', height: 40, paddingInline: 24 }}>
                {t.traffic.optimization}
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      {/* MARL Signal Control */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <MARLPanel />
        </Col>
      </Row>

      {/* What-If Sandbox */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <WhatIfPanel />
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}><AIAdvice mode="traffic" /></Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <Card className="glass-card" title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.traffic.droneFeed}</span>}>
            <DroneFeed
              externalDetections={droneDetections}
              congestionData={congestionData}
              hotspot={congestionHotspot}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
