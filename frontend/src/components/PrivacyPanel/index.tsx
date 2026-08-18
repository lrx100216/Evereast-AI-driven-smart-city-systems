import { useState } from 'react';
import { Card, Button, Slider, Tag, Progress, message, Typography, Space, Tooltip, Alert } from 'antd';
import {
  SafetyOutlined, PlayCircleOutlined, PauseCircleOutlined, LoadingOutlined,
  EyeInvisibleOutlined, ExperimentOutlined, NodeIndexOutlined, LockOutlined,
} from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useFederated } from '../../hooks/useFederated';

const { Text } = Typography;
const T = 'rgba(13,27,62,';

// Laplace noise formula rendered as styled inline math
const LaplaceFormula = () => (
  <span style={{ fontFamily: 'serif, Times New Roman', fontSize: 15, fontWeight: 500, color: '#7c4dff', whiteSpace: 'nowrap' }}>
    <span style={{ fontSize: 13 }}>f</span>
    <span style={{ fontSize: 13, opacity: 0.6 }}>(x)</span>
    <span style={{ margin: '0 4px' }}>+</span>
    <span style={{ fontSize: 13 }}>Lap</span>
    <span style={{ fontSize: 11, verticalAlign: 'sub' }}>λ</span>
    <span style={{ fontSize: 13 }}>(</span>
    <span style={{ fontSize: 10, verticalAlign: 'sub' }}>
      <span>Δ</span>
    </span>
    <span style={{ fontSize: 13 }}>f</span>
    <span style={{ fontSize: 11, verticalAlign: 'sub' }}> / </span>
    <span style={{ fontSize: 13, fontStyle: 'italic' }}>ε</span>
    <span style={{ fontSize: 13 }}>)</span>
  </span>
);

const edgeNodes = [
  { icon: '🚁', name: 'DJI Tello Edge', desc: 'On-board video → YOLO detection → noise injection before transmission', color: '#4fc3f7', eps: 0.1 },
  { icon: '🔧', name: 'Arduino UNO (路口)', desc: 'DHT11/LDR raw sensor → Laplace(Δf/ε) → encrypted gradient', color: '#66bb6a', eps: 0.5 },
  { icon: '🏗️', name: 'Intersection Controller', desc: 'Traffic flow stats → local DP perturbation → federated aggregate', color: '#ffa726', eps: 0.2 },
  { icon: '🔄', name: 'FedAvg Server', desc: 'Aggregates only noisy gradients — zero raw data access', color: '#7c4dff', eps: 0 },
];

export default function PrivacyPanel() {
  const { t } = useLang();
  const pT = t.privacy as Record<string, string>;
  const { progress, startTraining, stopTraining, setNoise } = useFederated();
  const [starting, setStarting] = useState(false);
  const [sliderVal, setSliderVal] = useState(1.0);
  const [showMath, setShowMath] = useState(false);

  const isTraining = progress?.status === 'training';
  const pct = progress ? Math.round((progress.currentRound / progress.totalRounds) * 100) : 0;

  const handleStart = async () => {
    setStarting(true);
    try { await startTraining(); message.success('Federated training started'); }
    catch { message.error('Failed'); }
    finally { setStarting(false); }
  };

  const handleSlider = (v: number) => { setSliderVal(v); };
  const handleSliderAfterChange = async (v: number) => {
    try { await setNoise(v); } catch { message.error('Failed'); }
  };

  const lastMetrics = progress?.metrics;
  const epsilon = progress?.epsilon ?? sliderVal;

  return (
    <Card
      className="glass-card"
      styles={{ body: { padding: '16px 20px' } }}
      title={
        <Space size={10}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(124,77,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#7c4dff', fontSize: 16,
          }}>
            <SafetyOutlined />
          </div>
          <span style={{ color: '#0d1b3e', fontWeight: 700, fontSize: 15 }}>
            {pT.title}
          </span>
          <Tag style={{ borderRadius: 4, border: 'none', fontSize: 9, background: 'rgba(124,77,255,0.1)', color: '#7c4dff', fontWeight: 600 }}>
            ε-Differential Privacy
          </Tag>
          {progress && (
            <Tag color={isTraining ? 'purple' : progress.status === 'completed' ? 'green' : 'default'} style={{ borderRadius: 4, border: 'none', fontSize: 10 }}>
              {pT[progress.status] || progress.status}
            </Tag>
          )}
        </Space>
      }
    >
      {/* Zero-Trust Narrative */}
      <div style={{
        padding: '12px 16px', marginBottom: 14, borderRadius: 10,
        background: 'rgba(124,77,255,0.03)',
        border: '1px solid rgba(124,77,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <EyeInvisibleOutlined style={{ color: '#7c4dff', fontSize: 22, marginTop: 2 }} />
          <div>
            <Text style={{ color: '#0d1b3e', fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 4 }}>
              {pT.narrativeQuote}
            </Text>
            <Text style={{ color: 'rgba(13,27,62,0.45)', fontSize: 12, lineHeight: 1.7, display: 'block' }}>
              {pT.narrative}
            </Text>
          </div>
        </div>
      </div>

      {/* Laplace Mechanism */}
      <div style={{
        padding: '12px 16px', marginBottom: 14, borderRadius: 10,
        background: 'rgba(124,77,255,0.03)',
        border: '1px solid rgba(124,77,255,0.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space size={6}>
            <ExperimentOutlined style={{ color: '#7c4dff', fontSize: 14 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,62,0.35)', letterSpacing: 1, textTransform: 'uppercase' }}>
              DP — Laplace Mechanism
            </span>
          </Space>
          <Button
            size="small"
            type="text"
            icon={<span style={{ fontSize: 12 }}>{showMath ? '⊟' : '⊞'}</span>}
            onClick={() => setShowMath(!showMath)}
          />
        </div>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <LaplaceFormula />
        </div>
        {showMath && (
          <div style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.5)',
            fontSize: 12, color: 'rgba(13,27,62,0.55)', lineHeight: 1.8, fontFamily: 'monospace',
          }}>
            <div><b style={{ color: '#7c4dff' }}>f(x)</b> = original sensor reading</div>
            <div><b style={{ color: '#7c4dff' }}>Lap(Δf/ε)</b> = Laplace-distributed noise with scale Δf/ε</div>
            <div><b style={{ color: '#7c4dff' }}>Δf</b> = L1 sensitivity (max single-vehicle impact)</div>
            <div><b style={{ color: '#7c4dff' }}>ε</b> = privacy budget — lower = stronger privacy</div>
            <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(124,77,255,0.05)', border: '1px solid rgba(124,77,255,0.1)', fontSize: 11 }}>
              {pT.guarantee}
            </div>
          </div>
        )}
      </div>

      {/* Edge Node Architecture */}
      <div style={{ marginBottom: 14 }}>
        <Space size={6} style={{ marginBottom: 10 }}>
          <NodeIndexOutlined style={{ color: '#4fc3f7', fontSize: 13 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,62,0.35)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {pT.edgeNodes}
          </span>
        </Space>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {edgeNodes.map(node => (
            <Tooltip key={node.name} title={node.desc}>
              <div style={{
                padding: '10px 12px', borderRadius: 10,
                background: `${node.color}04`,
                border: `1px solid ${node.color}12`,
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'default',
              }}>
                <span style={{ fontSize: 22 }}>{node.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0d1b3e', marginBottom: 1 }}>{node.name}</div>
                  <Space size={4}>
                    <Tag style={{ borderRadius: 3, border: 'none', fontSize: 8, background: `${node.color}10`, color: node.color, fontWeight: 600, lineHeight: '16px' }}>
                      ε={node.eps}
                    </Tag>
                    <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {node.desc.split('→')[0].trim()} → ⋯
                    </span>
                  </Space>
                </div>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Data Flow Diagram */}
      <div style={{
        padding: '10px 16px', marginBottom: 14, borderRadius: 10,
        background: 'rgba(255,255,255,0.4)',
        border: '1px solid rgba(79,195,247,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6,
      }}>
        {[
          { icon: '🔌', label: 'Raw Sensor', color: '#ef5350' },
          { icon: '➜', label: '', color: 'transparent' },
          { icon: '🧮', label: 'Lap(Δf/ε)', color: '#7c4dff' },
          { icon: '➜', label: '', color: 'transparent' },
          { icon: '🔐', label: 'Encrypted', color: '#4fc3f7' },
          { icon: '➜', label: '', color: 'transparent' },
          { icon: '☁️', label: 'Noisy Stats', color: '#66bb6a' },
          { icon: '➜', label: '', color: 'transparent' },
          { icon: '🧠', label: 'DQN Model', color: '#ffa726' },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              fontSize: s.icon === '➜' ? 16 : 18, opacity: s.icon === '➜' ? 0.2 : 1,
              color: s.color,
            }}>{s.icon}</div>
            {s.label && (
              <span style={{ fontSize: 10, fontWeight: 600, color: s.color }}>{s.label}</span>
            )}
          </div>
        ))}
      </div>

      {/* Privacy Budget Slider */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: `${T}0.45)` }}>{pT.noiseMultiplier}: ε = {epsilon.toFixed(2)}</span>
          <Space size={6}>
            <Tag style={{ borderRadius: 3, border: 'none', fontSize: 9, background: 'rgba(239,83,80,0.1)', color: '#ef5350', lineHeight: '16px' }}>🔒 {pT.privacyHigh}</Tag>
            <Tag style={{ borderRadius: 3, border: 'none', fontSize: 9, background: 'rgba(82,196,26,0.1)', color: '#52c41a', lineHeight: '16px' }}>🎯 {pT.accuracyHigh}</Tag>
          </Space>
        </div>
        <Slider
          min={0.1} max={10} step={0.1} value={sliderVal}
          onChange={handleSlider}
          onChangeComplete={handleSliderAfterChange}
          disabled={isTraining}
          trackStyle={{ background: 'linear-gradient(90deg, #ef5350, #faad14, #52c41a)' }}
          handleStyle={{ borderColor: '#7c4dff' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: `${T}0.3)` }}>
          <span>🔒 ε→0 (max privacy, high noise)</span>
          <span>🎯 ε大 (min noise, lower privacy)</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {isTraining ? (
          <Button danger icon={<PauseCircleOutlined />} onClick={stopTraining} style={{ flex: 1, borderRadius: 8 }}>{pT.stopFL}</Button>
        ) : (
          <Button type="primary" icon={starting ? <LoadingOutlined /> : <PlayCircleOutlined />}
            onClick={handleStart} loading={starting}
            style={{ flex: 1, borderRadius: 8, background: 'linear-gradient(135deg, #7c4dff, #4fc3f7)', border: 'none', boxShadow: '0 2px 8px rgba(124,77,255,0.3)' }}>
            {pT.startFL}
          </Button>
        )}
      </div>

      {/* Training Progress */}
      {isTraining && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: `${T}0.45)`, marginBottom: 4 }}>
            <span>{pT.rounds} {progress?.currentRound}/{progress?.totalRounds}</span>
            <span>{pct}%</span>
          </div>
          <Progress percent={pct} showInfo={false} strokeColor="linear-gradient(90deg, #7c4dff, #4fc3f7)" trailColor={`${T}0.06)`} size="small" />
          <div style={{
            marginTop: 6, fontSize: 12,
            background: 'rgba(124,77,255,0.06)', borderRadius: 6,
            padding: '4px 10px', textAlign: 'center',
            border: '1px solid rgba(124,77,255,0.1)',
          }}>
            <span style={{ color: '#7c4dff', fontWeight: 700, fontFamily: 'monospace' }}>
              ε = {progress?.epsilon?.toFixed(2) ?? '...'}
            </span>
            <span style={{ color: `${T}0.3)`, marginLeft: 12, fontSize: 11 }}>
              privacy budget consumed: {(progress?.epsilon ? (1 - Math.exp(-progress.epsilon)) * 100 : 0).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Tradeoff Chart */}
      {lastMetrics && lastMetrics.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: `${T}0.5)`, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {pT.tradeoffTitle}
          </div>
          <svg viewBox="0 0 300 130" style={{ width: '100%', maxWidth: 400 }}>
            <line x1={40} y1={110} x2={280} y2={110} stroke={`${T}0.1)`} strokeWidth={1} />
            <line x1={40} y1={10} x2={40} y2={110} stroke={`${T}0.1)`} strokeWidth={1} />
            <text x={10} y={65} fill={`${T}0.35)`} fontSize={9} transform="rotate(-90,10,65)">{pT.avgLoss} ↓</text>
            <text x={155} y={128} fill={`${T}0.35)`} fontSize={9} textAnchor="middle">{pT.epsilon} →</text>
            {lastMetrics.length > 1 && (
              <>
                <polyline fill="none" stroke="#7c4dff" strokeWidth={1.5} opacity={0.5}
                  points={lastMetrics.map(m => {
                    const x = 40 + (m.epsilon / Math.max(0.1, progress?.epsilon || 1)) * 230;
                    const maxLoss = Math.max(...lastMetrics.map(d => d.avgLoss), 0.01);
                    const y = 110 - (m.avgLoss / maxLoss) * 95;
                    return `${x},${y}`;
                  }).join(' ')} />
                {lastMetrics.map((m, i) => {
                  const x = 40 + (m.epsilon / Math.max(0.1, progress?.epsilon || 1)) * 230;
                  const maxLoss = Math.max(...lastMetrics.map(d => d.avgLoss), 0.01);
                  const y = 110 - (m.avgLoss / maxLoss) * 95;
                  return <circle key={i} cx={x} cy={y} r={3} fill="#7c4dff" opacity={0.8} />;
                })}
              </>
            )}
            {/* Shaded region — "forbidden zone" where privacy is too weak */}
            <rect x={230} y={10} width={50} height={100} fill="rgba(239,83,80,0.04)" rx={4} />
            <text x={245} y={20} fill="rgba(239,83,80,0.3)" fontSize={7} textAnchor="middle">ε large</text>
            <text x={245} y={30} fill="rgba(239,83,80,0.3)" fontSize={7} textAnchor="middle">weak privacy</text>
          </svg>
        </div>
      )}

      {/* Metrics Summary */}
      {lastMetrics && lastMetrics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          {[
            { label: pT.epsilon, value: progress?.epsilon?.toFixed(2) || '—', color: '#7c4dff', sub: `σ=${(sliderVal * 0.5).toFixed(2)}` },
            { label: pT.avgLoss, value: lastMetrics[lastMetrics.length - 1].avgLoss.toFixed(4), color: '#e65100', sub: 'latest round' },
            { label: pT.zones, value: `${progress?.zoneCount || 5}`, color: '#2e7d32', sub: '' },
            { label: pT.modelAgg, value: progress?.status === 'completed' ? '✓' : progress?.status === 'training' ? '...' : '—', color: '#4fc3f7', sub: 'FedAvg' },
          ].map((m, i) => (
            <div key={i} style={{
              background: `${T}0.03)`, borderRadius: 8, padding: '8px 6px', textAlign: 'center',
              border: `1px solid ${T}0.06)`,
            }}>
              <div style={{ fontSize: 9, color: `${T}0.4)` }}>{m.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: m.color, fontFamily: 'monospace' }}>{m.value}</div>
              <div style={{ fontSize: 8, color: `${T}0.25)` }}>{m.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Completion + Compliance Badges */}
      {progress?.status === 'completed' && (
        <div style={{ marginTop: 10 }}>
          <Alert
            message={
              <Space>
                <SafetyOutlined style={{ color: '#52c41a' }} />
                <span style={{ fontWeight: 600, color: '#52c41a' }}>{pT.globalModel}</span>
                <Tag color="green" style={{ borderRadius: 4, border: 'none', fontSize: 9 }}>{pT.compliance}</Tag>
              </Space>
            }
            type="success"
            showIcon={false}
            style={{ borderRadius: 8, background: 'rgba(82,196,26,0.05)', border: '1px solid rgba(82,196,26,0.12)' }}
          />
        </div>
      )}

      {/* Mathematical Guarantee Footer */}
      <div style={{
        marginTop: 10, padding: '8px 12px', borderRadius: 8,
        background: 'rgba(124,77,255,0.03)',
        border: '1px solid rgba(124,77,255,0.06)',
        fontSize: 10, color: 'rgba(13,27,62,0.3)', textAlign: 'center', lineHeight: 1.6,
      }}>
        <LockOutlined style={{ marginRight: 6, color: '#7c4dff' }} />
{pT.guarantee}
        <Tooltip title={pT.rdp}>
          <Tag style={{ marginLeft: 6, borderRadius: 3, border: 'none', fontSize: 8, cursor: 'pointer', background: 'rgba(124,77,255,0.08)', color: '#7c4dff' }}>
            RDP
          </Tag>
        </Tooltip>
      </div>
    </Card>
  );
}
