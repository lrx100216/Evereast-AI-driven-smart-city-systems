import { useState, useEffect } from 'react'
import { Card, Tag, Typography, Tooltip, Progress, Space, Alert } from 'antd'
import {
  ExperimentOutlined, WarningOutlined, SyncOutlined,
  ApiOutlined, SafetyOutlined,
} from '@ant-design/icons'
import { useLang } from '../../i18n/LanguageContext'
import { getSharedSocket, releaseSharedSocket } from '../../socket'

const { Text } = Typography

interface SimToRealSnapshot {
  timestamp: string
  compositeIndex: number
  channels: { name: string; simValue: number; realValue: number; weight: number }[]
  maxDiscrepancy: number
  worstChannel: string
  riskLevel: 'low' | 'moderate' | 'high' | 'critical'
  recommendedNoiseBoost: number
  shouldBoostNoise: boolean
  history: number[]
}

const riskColors: Record<string, string> = {
  low: '#52c41a', moderate: '#faad14', high: '#fa541c', critical: '#ef5350',
}

export default function SimToRealPanel() {
  const { t } = useLang()
  const sT = (t.simToReal || {}) as Record<string, string>
  const [snapshot, setSnapshot] = useState<SimToRealSnapshot | null>(null)

  useEffect(() => {
    const socket = getSharedSocket()
    const handler = (data: SimToRealSnapshot) => setSnapshot(data)
    socket.on('simtoreal:snapshot', handler)
    socket.emit('simtoreal:get_state')
    return () => {
      socket.off('simtoreal:snapshot', handler)
      releaseSharedSocket()
    }
  }, [])

  const s = snapshot
  const risk = s?.riskLevel ?? 'low'
  const color = riskColors[risk]

  return (
    <Card
      className="glass-card"
      styles={{ body: { padding: '16px 20px' } }}
      title={
        <Space size={10}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(79,195,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4fc3f7', fontSize: 16 }}>
            <ExperimentOutlined />
          </div>
          <span style={{ color: '#0d1b3e', fontWeight: 700, fontSize: 15 }}>{sT.title}</span>
          <Tag style={{ borderRadius: 4, border: 'none', fontSize: 9, background: 'rgba(79,195,247,0.1)', color: '#4fc3f7', fontWeight: 600 }}>{sT.shadowSim}</Tag>
          {s && (
            <Tag color={risk} style={{ borderRadius: 4, border: 'none', fontSize: 10, fontWeight: 600 }}>
              {risk === 'low' ? '✅ ' + sT.aligned : risk === 'moderate' ? '⚡ ' + sT.diverging : risk === 'high' ? '⚠ ' + sT.boosting : '🚨 ' + sT.critical}
            </Tag>
          )}
        </Space>
      }
    >
      {/* Data loading or content */}
      {!s ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'rgba(13,27,62,0.25)' }}>
          <SyncOutlined spin style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
          <span>{sT.title}...</span>
        </div>
      ) : (
        <>
          {/* SRDI Gauge + Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Progress
                type="dashboard"
                percent={Math.min(100, s.compositeIndex * 200)}
                strokeColor={color}
                size={120}
                format={() => (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>{(s.compositeIndex * 100).toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: 'rgba(13,27,62,0.3)' }}>{sT.srdi}</div>
                  </div>
                )}
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Space size={8} style={{ flexWrap: 'wrap', marginBottom: 6 }}>
                <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: `${color}10`, color }}>
                  {sT.srdi}: {(s.compositeIndex * 100).toFixed(2)}%
                </Tag>
                <Tooltip title={sT.noiseBoost}>
                  <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: 'rgba(124,77,255,0.08)', color: '#7c4dff', cursor: 'pointer' }}>
                    <SafetyOutlined /> {sT.noiseBoost}: {s.recommendedNoiseBoost.toFixed(1)}×
                  </Tag>
                </Tooltip>
                <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: 'rgba(79,195,247,0.06)', color: '#4fc3f7' }}>{sT.shadowSim}</Tag>
              </Space>
              <div style={{ fontSize: 12, color: 'rgba(13,27,62,0.5)', lineHeight: 1.7, padding: '8px 12px', borderRadius: 8, background: 'rgba(79,195,247,0.03)', border: '1px solid rgba(79,195,247,0.08)' }}>
                <SyncOutlined style={{ color: '#4fc3f7', marginRight: 6 }} />
                {sT.subtitle}
              </div>
            </div>
          </div>

          {/* Per-channel breakdown */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
              <ApiOutlined style={{ marginRight: 6 }} />{sT.perChannel}
            </div>
            {s.channels.map(ch => {
              const gap = Math.abs(ch.simValue - ch.realValue)
              const gapPct = Math.min(100, gap / (Math.abs(ch.simValue) + 1e-8) * 100)
              const chColor = gapPct > 20 ? '#ef5350' : gapPct > 10 ? '#faad14' : '#52c41a'

              return (
                <div key={ch.name} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Space size={6}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0d1b3e' }}>{ch.name}</span>
                      <Tag style={{ borderRadius: 3, border: 'none', fontSize: 8, background: `${chColor}10`, color: chColor, lineHeight: '16px' }}>
                        {gapPct.toFixed(1)}%
                      </Tag>
                    </Space>
                    <Space size={8}>
                      <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.3)' }}>sim: <b style={{ color: '#4fc3f7' }}>{ch.simValue.toFixed(3)}</b></span>
                      <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.3)' }}>real: <b style={{ color: '#ffa726' }}>{ch.realValue.toFixed(3)}</b></span>
                    </Space>
                  </div>
                  <Progress percent={gapPct} showInfo={false} strokeColor={chColor} trailColor="rgba(13,27,62,0.04)" size="small" />
                </div>
              )
            })}
          </div>

          {/* History Sparkline */}
          {s.history.length > 2 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
                {sT.srdi} ({s.history.length})
              </div>
              <svg viewBox={`0 0 ${s.history.length * 4} 40`} style={{ width: '100%', height: 40 }}>
                <line x1={0} y1={35} x2={s.history.length * 4} y2={35} stroke="rgba(13,27,62,0.06)" strokeWidth={1} />
                {[
                  { y: 35 - 0.05 * 250, c: 'rgba(82,196,26,0.15)' },
                  { y: 35 - 0.12 * 250, c: 'rgba(250,173,20,0.15)' },
                  { y: 35 - 0.25 * 250, c: 'rgba(250,85,28,0.15)' },
                  { y: 35 - 0.40 * 250, c: 'rgba(239,83,80,0.15)' },
                ].map((th, i) => (
                  <line key={i} x1={0} y1={th.y} x2={s.history.length * 4} y2={th.y} stroke={th.c} strokeWidth={0.5} strokeDasharray="2,2" />
                ))}
                <polyline fill="none" stroke="#4fc3f7" strokeWidth={1.5} points={s.history.map((v, i) => `${i * 4},${35 - v * 250}`).join(' ')} />
                {s.history.map((v, i) => (
                  <circle key={i} cx={i * 4} cy={35 - v * 250} r={1.5} fill={v > 0.25 ? '#ef5350' : v > 0.12 ? '#faad14' : '#52c41a'} opacity={0.7} />
                ))}
              </svg>
            </div>
          )}

          {/* Auto noise boost */}
          {s.shouldBoostNoise && (
            <Alert
              message={
                <Space>
                  <SafetyOutlined style={{ color: '#7c4dff' }} />
                  <span style={{ fontWeight: 600, color: '#7c4dff' }}>{sT.noiseBoost}: {s.recommendedNoiseBoost.toFixed(1)}×</span>
                </Space>
              }
              type="warning"
              showIcon={false}
              style={{ borderRadius: 8, background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.12)' }}
              closable={false}
            />
          )}
        </>
      )}
    </Card>
  )
}
