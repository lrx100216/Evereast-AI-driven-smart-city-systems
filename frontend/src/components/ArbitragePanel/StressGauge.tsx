import React from 'react'
import { Progress, Tag } from 'antd'

interface StressGaugeProps {
  value: number
  label: string
  riskLevel?: 'low' | 'moderate' | 'high' | 'critical'
}

const riskColors: Record<string, string> = {
  low: '#52c41a',
  moderate: '#faad14',
  high: '#fa541c',
  critical: '#ef5350',
}

const riskLabels: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
}

export const StressGauge: React.FC<StressGaugeProps> = ({ value, label, riskLevel = 'low' }) => {
  const pct = Math.round(value * 100)
  const color = riskColors[riskLevel] ?? '#52c41a'

  return (
    <div style={{ textAlign: 'center', padding: '8px' }}>
      <div style={{ fontSize: '12px', color: 'rgba(13,27,62,0.35)', fontWeight: 600, marginBottom: '8px' }}>{label}</div>
      <Progress
        type="dashboard"
        percent={pct}
        strokeColor={color}
        size={100}
        format={() => (
          <span style={{ fontSize: '20px', fontWeight: 700, color }}>
            {pct}%
          </span>
        )}
      />
      <div style={{ marginTop: '6px' }}>
        <Tag color={color} style={{ borderRadius: 4, border: 'none', fontSize: 10, fontWeight: 600 }}>
          {riskLabels[riskLevel] ?? 'Unknown'}
        </Tag>
      </div>
    </div>
  )
}
