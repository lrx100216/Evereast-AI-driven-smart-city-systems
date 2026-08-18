import React from 'react'
import { Typography } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons'
import type { ArbitrageSnapshot } from '../../../../shared/types/arbitrage'

const { Text } = Typography

interface ComparisonViewProps {
  comparison: ArbitrageSnapshot['comparison'] | null
}

interface MetricRow {
  label: string
  unit: string
  without: number
  withArbitrage: number
  higherIsBetter: boolean
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ comparison }) => {
  if (!comparison) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>No comparison data</div>
  }

  const metrics: MetricRow[] = [
    { label: 'Grid Import', unit: 'kW', without: comparison.without.gridImport, withArbitrage: comparison.withArbitrage.gridImport, higherIsBetter: false },
    { label: 'Grid Cost', unit: '¥', without: comparison.without.gridCost, withArbitrage: comparison.withArbitrage.gridCost, higherIsBetter: false },
    { label: 'Avg Speed', unit: 'km/h', without: comparison.without.avgSpeed, withArbitrage: comparison.withArbitrage.avgSpeed, higherIsBetter: true },
    { label: 'Carbon', unit: 'kg', without: comparison.without.carbonKg, withArbitrage: comparison.withArbitrage.carbonKg, higherIsBetter: false },
  ]

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(13,27,62,0.06)' }}>
          <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(13,27,62,0.3)', fontSize: 10, fontWeight: 600 }}>Metric</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(13,27,62,0.3)', fontSize: 10, fontWeight: 600 }}>Without</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: '#4fc3f7', fontSize: 10, fontWeight: 700 }}>With Arbitrage</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(13,27,62,0.3)', fontSize: 10, fontWeight: 600 }}>Change</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map(m => {
          const change = m.without !== 0 ? ((m.withArbitrage - m.without) / Math.abs(m.without)) * 100 : 0
          const isImprovement = m.higherIsBetter ? change > 0 : change < 0
          const isNeutral = Math.abs(change) < 1

          return (
            <tr key={m.label} style={{ borderBottom: '1px solid rgba(13,27,62,0.04)' }}>
              <td style={{ padding: '8px' }}>
                <Text style={{ color: '#0d1b3e', fontSize: 12 }}>{m.label}</Text>
                <Text style={{ color: 'rgba(13,27,62,0.2)', fontSize: 10, marginLeft: 4 }}>({m.unit})</Text>
              </td>
              <td style={{ textAlign: 'right', padding: '8px' }}>
                <Text style={{ color: 'rgba(13,27,62,0.35)', fontSize: 12 }}>{m.without.toFixed(1)}</Text>
              </td>
              <td style={{ textAlign: 'right', padding: '8px' }}>
                <Text style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 12 }}>{m.withArbitrage.toFixed(1)}</Text>
              </td>
              <td style={{ textAlign: 'right', padding: '8px' }}>
                <span style={{
                  color: isNeutral ? 'rgba(13,27,62,0.25)' : isImprovement ? '#52c41a' : '#ef5350',
                  fontWeight: 600, fontSize: 12,
                }}>
                  {isNeutral ? <MinusOutlined /> : isImprovement ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                  {' '}{isNeutral ? '—' : `${Math.abs(change).toFixed(1)}%`}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
