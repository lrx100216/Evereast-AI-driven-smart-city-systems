/**
 * 【模块说明】Energy 能源管理 — 微电网与储能优化页面
 * Module: Energy — Microgrid and battery energy storage optimization
 *
 * 【功能】展示光伏/储能/负荷/电网统计、实时能量流图、电池可视化、
 *         李雅普诺夫漂移加惩罚优化、峰谷电价时间线、碳排放追踪、AI建议
 * Function: Displays solar/battery/load/grid stats, real-time energy flow,
 *           battery visual, Lyapunov drift-plus-penalty optimization,
 *           time-of-use pricing, carbon tracking, and AI advice.
 *
 * 【关键配置】
 * - SPEED_OPTIONS: 仿真倍速选项（0.25× ~ 8×）
 * - PEAK_STYLE: 峰/平/谷电价时段颜色与标签
 * - FSM_STYLE: 储能状态机样式（正常/越限保护/防逆流/死区休眠）
 * - ZONE_COLORS: 各园区负荷柱状图配色
 *
 * 【主要组件/函数】
 * - EnergyFlow / FlowNodeBox / FlowArrowDir: 实时能量流可视化
 * - BatteryVisual: 带充放电动画的电池SOC可视化
 * - LyapunovPanel / RowMetric: 李雅普诺夫优化指标与FSM状态
 * - TimeHistoryChart: SOC/电价/电网购入历史趋势图
 * - PricingTimeline: 深圳24小时峰谷电价时段条
 * - LoadCurve: 典型日负荷曲线
 * - EnergyStatCard: 带数字动画的能源统计卡片
 * - setSimSpeed: 通过 API 设置仿真倍速
 *
 * 【依赖 Hooks】
 * - useLang: 国际化多语言
 * - useCountUp: 数字递增动画
 * - useEnergySim: 实时能源仿真数据
 */
import { useState } from 'react';
import { Card, Row, Col, Tag, Slider } from 'antd';
import { SafetyOutlined, FieldTimeOutlined } from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useCountUp } from '../../hooks/useCountUp';
import { useEnergySim } from '../../hooks/useEnergySim';
import { API_URL } from '../../config';
import type { EnergySimData } from '../../hooks/useEnergySim';
import Chart from '../../components/Charts';
import AIAdvice from '../../components/AIAdvice';
import WhatIfPanel from '../../components/WhatIfPanel';
import axios from 'axios';

const SPEED_OPTIONS: Record<number, string> = {
  0.25: '0.25×', 0.5: '0.5×', 1: '1×', 2: '2×', 4: '4×', 8: '8×',
};

// ─── Theme ────────────────────────────────────────────────
const PEAK_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  peak:    { color: '#ef5350', bg: 'rgba(239,83,80,0.1)', label: '峰电' },
  shoulder:{ color: '#ffa726', bg: 'rgba(255,167,38,0.1)', label: '平电' },
  valley:  { color: '#66bb6a', bg: 'rgba(102,187,106,0.1)', label: '谷电' },
};

const FSM_STYLE: Record<string, { color: string; bg: string }> = {
  normal:        { color: '#66bb6a', bg: 'rgba(102,187,106,0.1)' },
  limit_protect: { color: '#ef5350', bg: 'rgba(239,83,80,0.1)' },
  anti_backflow: { color: '#ffa726', bg: 'rgba(255,167,38,0.1)' },
  dead_zone:     { color: '#ab47bc', bg: 'rgba(171,71,188,0.1)' },
};

const ZONE_COLORS: Record<string, string> = {
  industrial: '#4fc3f7', tech_park: '#66bb6a',
  commercial: '#ffa726', school: '#ab47bc', residential: '#ef5350',
};

// ─── Energy Flow Diagram ─────────────────────────────────

function EnergyFlow({ data }: { data: EnergySimData }) {
  const { battery, grid } = data;
  const isCharging = battery.chargePower > 1;
  const isDischarging = battery.chargePower < -1;
  const soc = battery.soc;
  const peak = grid.peakType;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 0, padding: '12px 0',
    }}>
      <FlowNodeBox icon="☀️" label="光伏" value={grid.totalSupply - (battery.chargePower < 0 ? Math.abs(battery.chargePower) : 0)} unit="kW" color="#ffa726" />
      <FlowArrowDir dir={data.simHour >= 6 && data.simHour < 18 ? 'right' : 'none'} color="#ffa726" />

      <FlowNodeBox icon={peak === 'peak' ? '⚡' : peak === 'valley' ? '🌙' : '☁️'}
        label={PEAK_STYLE[peak].label}
        value={grid.gridImport > 0 ? grid.gridImport : grid.gridExport}
        unit={grid.gridImport > 0 ? '购入kW' : '售出kW'}
        color={PEAK_STYLE[peak].color}
        sub={`¥${grid.price.toFixed(2)}/kWh`}
      />
      <FlowArrowDir dir={grid.gridImport > 0 ? 'right' : grid.gridExport > 0 ? 'left' : 'none'} color={PEAK_STYLE[peak].color} />

      <FlowNodeBox icon="🔋" label={`储能 ${soc.toFixed(0)}%`}
        value={isCharging ? battery.chargePower : isDischarging ? Math.abs(battery.chargePower) : 0}
        unit={isCharging ? '充电kW' : isDischarging ? '放电kW' : '静置'}
        color={isCharging ? '#66bb6a' : isDischarging ? '#ef5350' : 'rgba(13,27,62,0.25)'}
        glow={isCharging || isDischarging}
      />
      <FlowArrowDir dir={isCharging ? 'left' : isDischarging ? 'right' : 'none'} color="#66bb6a" />

      <FlowNodeBox icon="🏙️" label="总负荷" value={grid.totalLoad} unit="kW" color="#ef5350" />
    </div>
  );
}

function FlowNodeBox({ icon, label, value, unit, color, sub, glow }: {
  icon: string; label: string; value: number; unit: string; color: string; sub?: string; glow?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 14px', borderRadius: 12,
      background: `${color}08`,
      border: `1px solid ${color}20`,
      minWidth: 80,
      boxShadow: glow ? `0 0 16px ${color}30` : 'none',
      transition: 'box-shadow 0.3s',
    }}>
      <span style={{ fontSize: 22, marginBottom: 2 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(13,27,62,0.5)', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.5 }}> {unit}</span>
      </span>
      {sub && <span style={{ fontSize: 9, color: 'rgba(13,27,62,0.35)', marginTop: 1 }}>{sub}</span>}
    </div>
  );
}

function FlowArrowDir({ dir, color }: { dir: 'left' | 'right' | 'none'; color: string }) {
  if (dir === 'none') return <div style={{ width: 28, textAlign: 'center', color: 'rgba(13,27,62,0.2)', fontSize: 12 }}>—</div>;
  return (
    <div style={{ width: 28, textAlign: 'center', color, fontSize: 18, opacity: 0.6 }}>
      {dir === 'right' ? '▶' : '◀'}
    </div>
  );
}

// ─── Battery Visual ──────────────────────────────────────

function BatteryVisual({ soc, chargePower }: { soc: number; chargePower: number }) {
  const isCharging = chargePower > 1;
  const isDischarging = chargePower < -1;
  const pct = Math.round(soc);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
      {/* Battery container: cap on top, body below (correct orientation) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 80, height: 136 }}>
        {/* Cap (positive terminal) — sits on top of the battery body */}
        <div style={{
          width: 24, height: 6,
          background: isCharging ? 'rgba(102,187,106,0.4)' : isDischarging ? 'rgba(239,83,80,0.4)' : 'rgba(13,27,62,0.12)',
          borderRadius: '3px 3px 0 0',
          transition: 'background 0.5s',
        }} />
        {/* Battery body */}
        <div style={{
          position: 'relative', width: '100%', flex: 1, borderRadius: 12,
          border: `2px solid ${isCharging ? 'rgba(102,187,106,0.4)' : isDischarging ? 'rgba(239,83,80,0.4)' : 'rgba(13,27,62,0.12)'}`,
          background: 'rgba(13,27,62,0.03)',
          overflow: 'hidden',
          boxShadow: isCharging ? '0 0 20px rgba(102,187,106,0.15)' : isDischarging ? '0 0 20px rgba(239,83,80,0.15)' : 'none',
          transition: 'box-shadow 0.5s, border-color 0.5s',
        }}>
          {/* Charge level fill — grows from bottom upward */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${pct}%`,
            background: isCharging
              ? 'linear-gradient(to top, #66bb6a, #81c784)'
              : isDischarging
                ? 'linear-gradient(to top, #ef5350, #e57373)'
                : 'linear-gradient(to top, #4fc3f7, #64b5f6)',
            transition: 'height 0.5s ease, background 0.5s',
            borderRadius: '0 0 10px 10px',
          }} />
          {isCharging && <div className="anim-slide" style={{
            position: 'absolute', bottom: `${pct - 5}%`, left: 0, right: 0, height: 6,
            background: 'rgba(13,27,62,0.06)',
            borderRadius: '50%',
          }} />}
          {/* Charging bubbles floating upward from the fill surface */}
          {isCharging && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="anim-up" style={{
              position: 'absolute', left: `${20 + i * 25}%`, bottom: `${pct + 5}%`,
              width: 4, height: 4, borderRadius: '50%',
              background: '#66bb6a', opacity: 0.6,
              animationDelay: `${i * 0.3}s`,
            }} />
          ))}
          {/* Discharging particles drifting downward from the empty top */}
          {isDischarging && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="anim-down" style={{
              position: 'absolute', left: `${20 + i * 25}%`, top: `${100 - pct + 5}%`,
              width: 4, height: 4, borderRadius: '50%',
              background: '#ef5350', opacity: 0.6,
              animationDelay: `${i * 0.3}s`,
            }} />
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#0d1b3e', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {pct}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', fontWeight: 600 }}>%</div>
        <Tag style={{
          marginTop: 6, borderRadius: 6, border: 'none', fontSize: 10,
          background: isCharging ? 'rgba(102,187,106,0.1)' : isDischarging ? 'rgba(239,83,80,0.1)' : 'rgba(13,27,62,0.06)',
          color: isCharging ? '#66bb6a' : isDischarging ? '#ef5350' : 'rgba(13,27,62,0.35)',
          fontWeight: 600,
        }}>
          {isCharging ? `充电 ${chargePower.toFixed(0)}kW` : isDischarging ? `放电 ${Math.abs(chargePower).toFixed(0)}kW` : '静置'}
        </Tag>
      </div>
    </div>
  );
}

// ─── Lyapunov Panel ──────────────────────────────────────

function LyapunovPanel({ data }: { data: EnergySimData }) {
  const { lyapunov, fsm, grid } = data;

  return (
    <div>
      <div style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 12,
        background: 'rgba(79,195,247,0.04)',
        border: '1px solid rgba(79,195,247,0.08)',
        fontSize: 11, color: 'rgba(13,27,62,0.5)', lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 700, color: '#0d1b3e', marginBottom: 4, fontSize: 12 }}>
          <span style={{ marginRight: 4 }}>🧪</span> Drift-Plus-Penalty
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <RowMetric label="Q(t) 虚拟队列" value={lyapunov.Q.toFixed(1)} color="#4fc3f7" />
          <RowMetric label="L = ½Q²" value={(0.5 * lyapunov.Q * lyapunov.Q).toFixed(1)} color="#4fc3f7" />
          <RowMetric label="Δ(t) 漂移" value={lyapunov.drift.toFixed(2)} color="#ab47bc" />
          <RowMetric label="V 基础权重" value={lyapunov.V.toString()} color="#66bb6a" />
          <RowMetric label="V 动态(含SOC偏差)" value={lyapunov.dynamicV?.toString() || lyapunov.V.toString()} color="#66bb6a" />
          <RowMetric label="搜索动作数" value={lyapunov.actionCount?.toString() || '13'} color="#ab47bc" />
          <RowMetric label="Cost(t) 电费" value={`${lyapunov.penalty.toFixed(2)} ¥`} color="#ef5350" />
          <div style={{
            marginTop: 4, padding: '6px 10px', borderRadius: 6,
            background: 'rgba(79,195,247,0.08)',
            fontSize: 13, fontWeight: 700, color: '#4fc3f7', textAlign: 'center',
          }}>
            min Δ + V·Cost = {lyapunov.driftPlusPenalty.toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: (FSM_STYLE[fsm.state]?.bg || 'rgba(102,187,106,0.06)'),
        border: `1px solid ${(FSM_STYLE[fsm.state]?.color || '#66bb6a')}20`,
        fontSize: 11,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <SafetyOutlined style={{ color: FSM_STYLE[fsm.state]?.color || '#66bb6a' }} />
          <span style={{ fontWeight: 700, color: '#0d1b3e' }}>FSM 状态机</span>
          <Tag style={{
            marginLeft: 'auto', borderRadius: 4, border: 'none', fontSize: 10,
            background: (FSM_STYLE[fsm.state]?.bg || 'rgba(102,187,106,0.1)'),
            color: (FSM_STYLE[fsm.state]?.color || '#66bb6a'), fontWeight: 700,
          }}>
            {fsm.state === 'normal' ? '正常' :
             fsm.state === 'limit_protect' ? '越限保护' :
             fsm.state === 'anti_backflow' ? '防逆流' : '死区休眠'}
          </Tag>
        </div>
        <div style={{ color: 'rgba(13,27,62,0.45)', fontSize: 10 }}>{fsm.reason}</div>
      </div>

      <div style={{
        marginTop: 12, padding: '10px 14px', borderRadius: 8,
        background: grid.peakType === 'peak' ? 'rgba(239,83,80,0.04)' : grid.peakType === 'valley' ? 'rgba(102,187,106,0.04)' : 'rgba(255,167,38,0.04)',
        border: `1px solid ${PEAK_STYLE[grid.peakType].color}15`,
        fontSize: 11, color: 'rgba(13,27,62,0.5)',
      }}>
        <div style={{ fontWeight: 600, color: '#0d1b3e', marginBottom: 2 }}>
          当前策略
        </div>
        <div style={{ lineHeight: 1.7 }}>
          {grid.peakType === 'peak' && '⚡ 峰电时段：电池放电削峰，减少从电网购电'}
          {grid.peakType === 'valley' && '🌙 谷电时段：电池充电储能，趁低价囤电'}
          {grid.peakType === 'shoulder' && '☁️ 平电时段：平衡充放，保持 SOC 在目标区间'}
        </div>
      </div>
    </div>
  );
}

function RowMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'rgba(13,27,62,0.45)' }}>{label}</span>
      <span style={{ fontWeight: 700, color, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

// ─── Time History Chart ──────────────────────────────────

function TimeHistoryChart({ data }: { data: EnergySimData }) {
  const hist = data.history;
  if (!hist || hist.length < 2) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>;
  }

  return (
    <Chart
      type="line"
      data={[
        hist.map(h => h.soc),
        hist.map(h => h.price * 100),
        hist.map(h => h.gridImport),
      ]}
      categories={hist.map(h => h.simTime)}
      color={['#66bb6a', '#ffa726', '#4fc3f7']}
    />
  );
}

// ─── 24h Pricing Timeline ───────────────────────────────

function PricingTimeline({ hour, minute }: { hour: number; minute: number }) {
  const t = hour + minute / 60;
  const segments: [number, number, 'valley' | 'shoulder' | 'peak'][] = [
    [0, 7, 'valley'], [7, 9, 'shoulder'], [9, 11.5, 'peak'],
    [11.5, 14, 'shoulder'], [14, 16.5, 'peak'], [16.5, 19, 'shoulder'],
    [19, 21, 'peak'], [21, 23, 'shoulder'], [23, 24, 'valley'],
  ];
  const colors = { valley: '#66bb6a', shoulder: '#ffa726', peak: '#ef5350' };
  const labels = { valley: '谷', shoulder: '平', peak: '峰' };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,62,0.35)' }}>⏱ 深圳峰谷电价时段</span>
      </div>
      <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', position: 'relative', background: 'rgba(13,27,62,0.04)' }}>
        {segments.map(([start, end, type], i) => (
          <div key={i} style={{
            flex: end - start, background: `${colors[type]}20`,
            borderRight: '1px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: colors[type], fontWeight: 700,
          }}>{labels[type]}</div>
        ))}
        <div style={{
          position: 'absolute', left: `${(t / 24) * 100}%`, top: -2,
          transform: 'translateX(-50%)', zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ width: 2, height: 24, background: '#0d1b3e', borderRadius: 1 }} />
          <div style={{ fontSize: 9, fontWeight: 700, color: '#0d1b3e', marginTop: 2, background: 'rgba(255,255,255,0.8)', padding: '0 4px', borderRadius: 3 }}>
            {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: 'rgba(13,27,62,0.35)' }}>
        <span><span style={{ color: '#66bb6a' }}>●</span> 谷电 0.26元 (23:00-7:00)</span>
        <span><span style={{ color: '#ffa726' }}>●</span> 平电 0.70元</span>
        <span><span style={{ color: '#ef5350' }}>●</span> 峰电 1.17元 (9:00-11:30/14:00-16:30/19:00-21:00)</span>
      </div>
    </div>
  );
}

// ─── 24h Typical Load Curve ──────────────────────────────

function LoadCurve({ hour: _hour }: { hour: number }) {
  const curve = [45,42,38,35,35,38,45,55,68,80,85,88,90,88,85,87,90,92,95,88,78,68,58,50];
  const categories = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  return <Chart type="line" data={curve} categories={categories} color={['#4fc3f7']} style={{ height: 120 }} />;
}

// ─── StatCard for energy ─────────────────────────────────

function EnergyStatCard({ label, value, unit, color, icon }: { label: string; value: number; unit: string; color: string; icon: string }) {
  const [mounted] = useState(true);
  const v = useCountUp(value, 1500, mounted);

  return (
    <Card className="glass-card" styles={{ body: { padding: 22 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value" style={{ color }}>
        {v}
        <span className="stat-unit">{unit}</span>
      </div>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────

export default function Energy() {
  const { t } = useLang();
  const { data: simData } = useEnergySim();
  const [speed, setSpeed] = useState(1);

  const setSimSpeed = async (val: number) => {
    setSpeed(val);
    try { await axios.post(`${API_URL}/energy-sim/speed`, { speed: val }); } catch {}
  };

  const totalLoad = simData?.grid.totalLoad ?? 0;
  const soc = simData?.battery.soc ?? 55;
  const solarOut = simData ? Math.round(Math.max(0, simData.grid.totalSupply - (simData.battery.chargePower < 0 ? Math.abs(simData.battery.chargePower) : 0))) : 0;
  const gridIm = simData?.grid.gridImport ?? 0;
  const peakType = simData?.grid.peakType ?? 'shoulder';
  const chargePower = simData?.battery.chargePower ?? 0;

  return (
    <div>
      <h1 className="page-title anim-up">{t.energy.title}</h1>

      {/* ========== Stat Row ========== */}
      <Row gutter={[20, 20]} className="stagger" style={{ marginBottom: 20 }}>
        <Col xs={12} lg={6}>
          <EnergyStatCard label={t.energy.powerOutput} value={solarOut} unit="kW" color="#ffa726" icon="☀️" />
        </Col>
        <Col xs={12} lg={6}>
          <EnergyStatCard label={t.energy.batteryStorage} value={Math.round(soc)} unit="%" color="#66bb6a" icon="🔋" />
        </Col>
        <Col xs={12} lg={6}>
          <EnergyStatCard label={t.energy.consumption} value={totalLoad} unit="kW" color="#ef5350" icon="🏙️" />
        </Col>
        <Col xs={12} lg={6}>
          <EnergyStatCard label="电网购入" value={gridIm} unit="kW" color="#4fc3f7" icon="⚡" />
        </Col>
      </Row>

      {/* ========== Top Status Bar ========== */}
      <div className="anim-slide" style={{ marginBottom: 20 }}>
        <Card className="glass-card" styles={{ body: { padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }}>
          <span className="status-dot online" />
          <span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 13 }}>能源调控</span>
          {simData && (
            <>
              <span style={{ color: 'rgba(13,27,62,0.25)', fontSize: 12 }}>🕐 {simData.simTime}</span>
              <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, margin: 0, background: PEAK_STYLE[peakType].bg, color: PEAK_STYLE[peakType].color, fontWeight: 700 }}>
                {PEAK_STYLE[peakType].label} ¥{simData.grid.price.toFixed(2)}
              </Tag>
              <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: (FSM_STYLE[simData.fsm.state]?.bg || 'rgba(102,187,106,0.1)'), color: (FSM_STYLE[simData.fsm.state]?.color || '#66bb6a'), fontWeight: 600 }}>
                <SafetyOutlined /> {simData.fsm.state === 'normal' ? 'FSM 正常' : `FSM ${simData.fsm.state}`}
              </Tag>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FieldTimeOutlined style={{ color: 'rgba(13,27,62,0.35)' }} />
                <Slider
                  min={0.25} max={8} step={0.25}
                  value={speed}
                  onChange={setSimSpeed}
                  style={{ width: 100, margin: 0 }}
                  tooltip={{ formatter: (v?: number) => v ? `${v}×` : '1×' }}
                />
                <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.35)', minWidth: 30 }}>{SPEED_OPTIONS[speed] || `${speed}×`}</span>
              </div>
              <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: 'rgba(79,195,247,0.1)', color: '#4fc3f7', fontWeight: 600 }}>
                🧪 李雅普诺夫优化
              </Tag>
            </>
          )}
        </Card>
      </div>

      {/* ========== Energy Flow + Pricing Timeline ========== */}
      <div className="anim-up" style={{ marginBottom: 20 }}>
        <Card className="glass-card" styles={{ body: { padding: '12px 20px' } }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 4 }}>⚡ 实时能量流</div>
          {simData ? <EnergyFlow data={simData} /> : <div style={{ padding: 16, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>}
          {simData && <PricingTimeline hour={simData.simHour} minute={simData.simMinute} />}
        </Card>
      </div>

      {/* ========== Main Row ========== */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={9}>
          <Card className="glass-card" styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>🔋 储能系统</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {simData ? <BatteryVisual soc={soc} chargePower={chargePower} /> : <div style={{ padding: 20, color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>}
            </div>
            {simData && (
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.04)', marginTop: 12, paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(13,27,62,0.35)' }}>
                  <span>容量 {simData.battery.capacity}kWh</span>
                  <span>最大充电 {simData.battery.maxChargeRate}kW</span>
                  <span>最大放电 {simData.battery.maxDischargeRate}kW</span>
                </div>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card className="glass-card" styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>🧪 调控决策引擎</div>
            {simData ? <LyapunovPanel data={simData} /> : <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>}
          </Card>
        </Col>
        <Col xs={24} lg={5}>
          <Card className="glass-card" styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>🌱 碳排放追踪</div>
            {simData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: (simData?.carbon?.totalKg ?? 0) > 100 ? '#ef5350' : '#66bb6a', fontVariantNumeric: 'tabular-nums' }}>
                    {(simData?.carbon?.totalKg ?? 0).toFixed(0)}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)' }}>累计碳排放 (kg CO₂)</div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(79,195,247,0.06)', fontSize: 11, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(13,27,62,0.45)' }}>电网碳强度</span>
                    <span style={{ fontWeight: 700, color: '#0d1b3e' }}>{(simData?.carbon?.intensity ?? 0).toFixed(3)} kg/kWh</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: 'rgba(13,27,62,0.45)' }}>太阳能减排</span>
                    <span style={{ fontWeight: 700, color: '#66bb6a' }}>{(simData?.carbon?.avoidedKg ?? 0).toFixed(0)} kg</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: 'rgba(13,27,62,0.45)' }}>电池健康度</span>
                    <span style={{ fontWeight: 700, color: '#4fc3f7' }}>{((simData?.battery?.capacity ?? 500) / 500 * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ========== Zone Load + 24h Curve + History ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={8}>
          <Card className="glass-card" styles={{ body: { padding: 20 } }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>🏙️ 各园区实时负荷</div>
            {simData ? (
              <Chart
                type="bar"
                data={simData.zones.map(z => z.load)}
                categories={simData.zones.map(z => z.nameZh)}
                color={simData.zones.map(z => ZONE_COLORS[z.type] || '#4fc3f7')}
              />
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={4}>
          <Card className="glass-card" styles={{ body: { padding: 16 } }} style={{ height: '100%' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 8 }}>📊 深圳典型日负荷曲线</div>
            {simData && <LoadCurve hour={simData.simHour} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="glass-card" styles={{ body: { padding: 20 } }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>📈 SOC / 电价 / 电网 趋势</div>
            {simData ? <TimeHistoryChart data={simData} /> : <div style={{ padding: 20, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>}
          </Card>
        </Col>
      </Row>

      {/* ========== Power Plants ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col span={24}>
          <Card className="glass-card" styles={{ body: { padding: 16 } }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>🏭 深圳主力电厂出力</div>
            {simData ? (
              <Row gutter={[12, 12]}>
                {simData.plants.map((p) => (
                  <Col xs={12} lg={4} key={p.id}>
                    <div style={{
                      padding: '10px 14px', borderRadius: 8,
                      background: p.online ? 'rgba(255,255,255,0.4)' : 'rgba(13,27,62,0.03)',
                      border: `1px solid ${p.online ? 'rgba(79,195,247,0.15)' : 'rgba(13,27,62,0.05)'}`,
                      opacity: p.online ? 1 : 0.35,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{p.type === 'nuclear' ? '☢️' : p.type === 'gas' ? '🔥' : p.type === 'coal' ? '⛏️' : '☀️'}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.online ? '#66bb6a' : '#ddd', display: 'inline-block' }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0d1b3e' }}>{p.nameZh}</div>
                      <div style={{ fontSize: 9, color: 'rgba(13,27,62,0.35)', marginBottom: 2 }}>{p.capacity}MW</div>
                      {p.online && <div style={{ fontSize: 13, fontWeight: 700, color: '#4fc3f7' }}>{p.output} <span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(13,27,62,0.35)' }}>MW</span></div>}
                      {!p.online && <div style={{ fontSize: 10, color: 'rgba(13,27,62,0.25)' }}>离线</div>}
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              <div style={{ padding: 12, textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>等待数据...</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ========== What-If Sandbox ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col span={24}>
          <WhatIfPanel />
        </Col>
      </Row>

      {/* ========== CFM v4 Model Showcase ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <Card className="glass-card" styles={{ body: { padding: 20 } }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 180px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0d1b3e', marginBottom: 2, letterSpacing: -0.5 }}>
                  CFM v4
                </div>
                <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', fontWeight: 600, marginBottom: 8 }}>
                  City Foundation Model
                </div>
                <Tag style={{ borderRadius: 6, border: 'none', fontSize: 10, background: 'rgba(79,195,247,0.12)', color: '#4fc3f7', fontWeight: 700 }}>
                  384 → 13 · ONNX
                </Tag>
              </div>

              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Parameters', value: '129.7M', sub: 'v3: 52M · +149%', color: '#4fc3f7' },
                    { label: 'Layers', value: '18', sub: 'v3: 12 layers · +50%', color: '#66bb6a' },
                    { label: 'Hidden Dim', value: '768', sub: 'v3: 512 · +50%', color: '#ffa726' },
                    { label: 'Attention Heads', value: '12', sub: 'v3: 16 heads · head_dim=64', color: '#ab47bc' },
                  ].map(m => (
                    <div key={m.label} style={{
                      padding: '10px 14px', borderRadius: 10,
                      background: m.color + '08',
                      border: '1px solid ' + m.color + '15',
                    }}>
                      <div style={{ fontSize: 10, color: 'rgba(13,27,62,0.35)', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{m.value}</div>
                      <div style={{ fontSize: 9, color: 'rgba(13,27,62,0.25)', marginTop: 1, fontFamily: 'monospace' }}>{m.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: '0 0 220px' }}>
                <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Architecture
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { name: 'SwiGLU', desc: 'Gated FFN activation', color: '#4fc3f7' },
                    { name: 'RMSNorm', desc: 'Pre-layer normalization', color: '#66bb6a' },
                    { name: 'QK-Norm', desc: 'Attention logit scaling', color: '#ffa726' },
                    { name: 'Per-Intersection Heads', desc: '11 independent traffic signal heads', color: '#ab47bc' },
                  ].map(f => (
                    <div key={f.name} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 8,
                      background: f.color + '06',
                      border: '1px solid ' + f.color + '10',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: f.color, flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0d1b3e' }}>{f.name}</div>
                        <div style={{ fontSize: 9, color: 'rgba(13,27,62,0.35)' }}>{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 14, padding: '8px 14px', borderRadius: 6,
              background: 'rgba(79,195,247,0.04)',
              border: '1px solid rgba(79,195,247,0.08)',
              fontSize: 11, color: 'rgba(13,27,62,0.4)',
            }}>
              ONNX interface unchanged: 384-dim city state → 13-dim hybrid control (compatible with v3 deployment pipelines)
            </div>
          </Card>
        </Col>
      </Row>

      {/* ========== AI Advice ========== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <AIAdvice mode="energy" />
        </Col>
      </Row>

    </div>
  );
}