import { useState } from 'react';
import { Card, Button, Select, InputNumber, Progress, Tag, Row, Col, message } from 'antd';
import {
  ExperimentOutlined, PlayCircleOutlined, PauseCircleOutlined,
  LoadingOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useWhatIf } from '../../hooks/useWhatIf';
import type { MetricEffect } from '../../hooks/useWhatIf';

const T = 'rgba(13,27,62,';

// ─── DAG ───────────────────────────────────────────────────

interface DAGNodePos { id: string; label: string; x: number; y: number; type: string }
interface DAGEdgePos { from: string; to: string }

const TRAFFIC_DAG: { nodes: DAGNodePos[]; edges: DAGEdgePos[] } = {
  nodes: [
    { id: 'closure', label: '封路', x: 200, y: 25, type: 'intervention' },
    { id: 'local_q', label: '本地排队', x: 100, y: 100, type: 'mediator' },
    { id: 'reroute', label: '绕行', x: 300, y: 100, type: 'mediator' },
    { id: 'neighbor_q', label: '邻路排队', x: 200, y: 175, type: 'mediator' },
    { id: 'avg_speed', label: '平均车速', x: 100, y: 250, type: 'outcome' },
    { id: 'carbon', label: '碳排放', x: 300, y: 250, type: 'outcome' },
  ],
  edges: [
    { from: 'closure', to: 'local_q' }, { from: 'closure', to: 'reroute' },
    { from: 'local_q', to: 'neighbor_q' }, { from: 'reroute', to: 'neighbor_q' },
    { from: 'neighbor_q', to: 'avg_speed' }, { from: 'neighbor_q', to: 'carbon' },
    { from: 'reroute', to: 'carbon' },
  ],
};
const ENERGY_DAG: { nodes: DAGNodePos[]; edges: DAGEdgePos[] } = {
  nodes: [
    { id: 'angle', label: '倾角', x: 200, y: 25, type: 'intervention' },
    { id: 'irradiance', label: '有效辐照', x: 200, y: 100, type: 'mediator' },
    { id: 'solar_out', label: '光伏出力', x: 100, y: 175, type: 'mediator' },
    { id: 'battery', label: '电池充放', x: 300, y: 175, type: 'mediator' },
    { id: 'grid_import', label: '电网购电', x: 100, y: 250, type: 'outcome' },
    { id: 'cost', label: '总费用', x: 300, y: 250, type: 'outcome' },
  ],
  edges: [
    { from: 'angle', to: 'irradiance' }, { from: 'irradiance', to: 'solar_out' },
    { from: 'solar_out', to: 'battery' }, { from: 'solar_out', to: 'grid_import' },
    { from: 'battery', to: 'grid_import' }, { from: 'grid_import', to: 'cost' },
    { from: 'battery', to: 'cost' },
  ],
};
const NODE_COLORS: Record<string, string> = { intervention: '#c62828', mediator: '#e65100', outcome: '#2e7d32' };

function DAGView({ target }: { target: 'traffic' | 'energy' }) {
  const dag = target === 'traffic' ? TRAFFIC_DAG : ENERGY_DAG;
  return (
    <svg viewBox="0 0 400 300" style={{ width: '100%', maxWidth: 400 }}>
      {dag.edges.map((e, i) => {
        const from = dag.nodes.find(n => n.id === e.from)!;
        const to = dag.nodes.find(n => n.id === e.to)!;
        return <line key={i} x1={from.x} y1={from.y + 12} x2={to.x} y2={to.y - 12}
          stroke={`${T}0.15)`} strokeWidth={1.5} markerEnd="url(#arrow)" />;
      })}
      <defs><marker id="arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill={`${T}0.2)`} /></marker></defs>
      {dag.nodes.map(n => (
        <g key={n.id}>
          <rect x={n.x - 42} y={n.y - 10} width={84} height={24} rx={12}
            fill={`${NODE_COLORS[n.type]}15`} stroke={NODE_COLORS[n.type]} strokeWidth={1.5} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fill="#0d1b3e" fontSize={10}>{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

function EffectRow({ m }: { m: MetricEffect }) {
  const pos = m.ate > 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 10px', marginBottom: 3, borderRadius: 8,
      background: `${T}0.03)`, fontSize: 13,
    }}>
      <span style={{ color: '#0d1b3e', fontWeight: 500, minWidth: 75 }}>{m.labelZh}</span>
      <span style={{ color: `${T}0.35)`, fontFamily: 'monospace', minWidth: 48, textAlign: 'center' }}>{m.controlMean}{m.unit}</span>
      <span style={{ color: pos ? '#c62828' : '#2e7d32', fontFamily: 'monospace', minWidth: 48, textAlign: 'center' }}>{m.treatmentMean}{m.unit}</span>
      <span style={{
        color: pos ? '#c62828' : '#2e7d32', fontWeight: 600, fontFamily: 'monospace', minWidth: 65, textAlign: 'right',
      }}>
        {pos ? '+' : ''}{m.ate}{m.unit}
        {pos ? <ArrowUpOutlined style={{ fontSize: 10, marginLeft: 2 }} /> : <ArrowDownOutlined style={{ fontSize: 10, marginLeft: 2 }} />}
      </span>
      <Tag color={m.significant ? 'green' : 'default'} style={{ fontSize: 10, margin: 0, minWidth: 40, textAlign: 'center' }}>
        {m.significant ? `p=${m.pValue}` : 'n.s.'}
      </Tag>
    </div>
  );
}

export default function WhatIfPanel() {
  const { t } = useLang();
  const wiT = t.whatIf as Record<string, string>;
  const { progress, scenarios, startRun, stopRun } = useWhatIf();
  const [scenarioId, setScenarioId] = useState<string>('');
  const [runs, setRuns] = useState(100);
  const [starting, setStarting] = useState(false);

  const isRunning = progress?.status === 'running';
  const result = progress?.result;
  const target = scenarios.find(s => s.id === scenarioId)?.target;
  const pct = progress ? Math.round((progress.completedRuns / progress.totalRuns) * 100) : 0;

  const handleStart = async () => {
    if (!scenarioId) { message.warning('Please select a scenario'); return; }
    setStarting(true);
    try { await startRun(scenarioId, runs); message.success('Analysis started'); }
    catch (err: any) { message.error(err?.response?.data?.error || err?.message || 'Failed'); }
    finally { setStarting(false); }
  };

  return (
    <Card
      className="glass-card"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ExperimentOutlined style={{ fontSize: 18, color: '#66bb6a' }} />
          <span style={{ color: '#0d1b3e', fontWeight: 600 }}>{wiT.title}</span>
          {progress && (
            <Tag color={isRunning ? 'blue' : progress.status === 'completed' ? 'green' : 'default'}>
              {wiT[progress.status] || progress.status}
            </Tag>
          )}
        </div>
      }
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <Select value={scenarioId || undefined} onChange={setScenarioId} placeholder={wiT.selectScenario}
          disabled={isRunning} style={{ flex: 2 }}
          options={scenarios.map(s => ({ value: s.id, label: `${s.labelZh} — ${s.label}` }))} />
        <span style={{ color: `${T}0.4)`, fontSize: 12 }}>{wiT.runs}</span>
        <InputNumber min={10} max={200} value={runs} onChange={v => setRuns(v || 100)}
          disabled={isRunning} style={{ width: 72 }} />
        {isRunning ? (
          <Button danger icon={<PauseCircleOutlined />} onClick={stopRun}>{wiT.stop}</Button>
        ) : (
          <Button type="primary" icon={starting ? <LoadingOutlined /> : <PlayCircleOutlined />}
            onClick={handleStart} loading={starting}
            style={{ background: '#66bb6a', borderColor: '#66bb6a' }}>{wiT.start}</Button>
        )}
      </div>

      {isRunning && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: `${T}0.45)` }}>
            <span>{wiT.runningLabel} {progress?.completedRuns}/{progress?.totalRuns}</span>
            <span>{pct}%</span>
          </div>
          <Progress percent={pct} showInfo={false} strokeColor="#66bb6a" trailColor={`${T}0.06)`} size="small" />
        </div>
      )}

      {result && (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: `${T}0.4)`, marginBottom: 6 }}>
              {wiT.ate} · {result.runs} {wiT.runs.toLowerCase()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: `${T}0.3)`, padding: '0 10px', marginBottom: 2 }}>
              <span style={{ minWidth: 75 }}>指标</span>
              <span style={{ minWidth: 48, textAlign: 'center' }}>{wiT.control}</span>
              <span style={{ minWidth: 48, textAlign: 'center' }}>{wiT.treatment}</span>
              <span style={{ minWidth: 65, textAlign: 'right' }}>Δ</span>
              <span style={{ minWidth: 40, textAlign: 'center' }}>P</span>
            </div>
            {result.metrics.map(m => <EffectRow key={m.metric} m={m} />)}
          </div>

          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div style={{ fontSize: 12, color: `${T}0.4)`, marginBottom: 8 }}>{wiT.causalGraph}</div>
              <DAGView target={target || 'traffic'} />
            </Col>
            <Col span={12}>
              <div style={{ fontSize: 12, color: `${T}0.4)`, marginBottom: 8 }}>{wiT.beforeAfter}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.metrics.slice(0, 4).map(m => {
                  const maxV = Math.max(Math.abs(m.controlMean), Math.abs(m.treatmentMean), 1);
                  return (
                    <div key={m.metric} style={{ fontSize: 11 }}>
                      <div style={{ color: `${T}0.45)`, marginBottom: 2 }}>{m.labelZh}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#4fc3f7', minWidth: 34, fontSize: 10 }}>{wiT.control}</span>
                        <div style={{ flex: 1, height: 8, background: 'rgba(79,195,247,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(2, (Math.abs(m.controlMean) / maxV) * 100)}%`, height: '100%', background: '#4fc3f7', borderRadius: 4 }} />
                        </div>
                        <span style={{ color: '#0277bd', fontFamily: 'monospace', minWidth: 44, textAlign: 'right', fontSize: 10 }}>{m.controlMean}{m.unit}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span style={{ color: '#ffa726', minWidth: 34, fontSize: 10 }}>{wiT.treatment}</span>
                        <div style={{ flex: 1, height: 8, background: 'rgba(255,167,38,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(2, (Math.abs(m.treatmentMean) / maxV) * 100)}%`, height: '100%', background: '#ffa726', borderRadius: 4 }} />
                        </div>
                        <span style={{ color: '#e65100', fontFamily: 'monospace', minWidth: 44, textAlign: 'right', fontSize: 10 }}>{m.treatmentMean}{m.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Col>
          </Row>
        </>
      )}

      {!isRunning && !result && (
        <div style={{ textAlign: 'center', padding: 20, color: `${T}0.25)`, fontSize: 13 }}>
          选择场景并点击「开始分析」<br />系统将运行成对仿真实验，输出因果效应
        </div>
      )}
    </Card>
  );
}
