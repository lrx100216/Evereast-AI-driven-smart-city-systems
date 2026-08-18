import React from 'react'
import { Card, Tag, Tooltip } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons'
import type { LyapunovPricingSnapshot } from '../../../../shared/types/arbitrage'

interface PricingHeatmapProps {
  pricing: LyapunovPricingSnapshot | null
}

const sectorBorders: Record<string, string> = {
  A_stressed: '#ef5350',
  B_safe: '#52c41a',
  buffer: '#faad14',
}

const stationNames: Record<number, string> = {
  0: 'Tech Park SC', 1: 'AI Blvd', 2: 'CBD Plaza', 3: 'Mall Drive',
  4: 'Garden Rd', 5: 'Lake Ave', 6: 'Industrial FC', 7: 'Campus EV',
}

export const PricingHeatmap: React.FC<PricingHeatmapProps> = ({ pricing }) => {
  if (!pricing || pricing.stations.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>No pricing data</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
      {pricing.stations.map(s => (
        <Card
          key={s.stationId}
          size="small"
          styles={{ body: { padding: '10px 12px' } }}
          style={{
            background: 'rgba(255,255,255,0.5)',
            borderLeft: `3px solid ${sectorBorders[s.sector] ?? '#ddd'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: 12, color: '#0d1b3e', fontWeight: 600 }}>
              {stationNames[s.stationId] ?? `S${s.stationId}`}
            </span>
            <Tag
              color={s.sector === 'A_stressed' ? 'red' : s.sector === 'B_safe' ? 'green' : 'orange'}
              style={{ fontSize: 9, border: 'none', margin: 0 }}
            >
              {s.sector === 'A_stressed' ? 'A' : s.sector === 'B_safe' ? 'B' : 'Buf'}
            </Tag>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: 'rgba(13,27,62,0.3)', textDecoration: 'line-through' }}>
              ¥{s.basePrice.toFixed(2)}
            </span>
            <Tooltip title={s.reason}>
              <span style={{
                fontSize: 15, fontWeight: 700,
                color: s.direction === 'raise' ? '#ef5350' : s.direction === 'lower' ? '#52c41a' : 'rgba(13,27,62,0.4)',
              }}>
                {s.direction === 'raise' ? <ArrowUpOutlined /> : s.direction === 'lower' ? <ArrowDownOutlined /> : <MinusOutlined />}
                {' ¥'}{s.adjustedPrice.toFixed(2)}
              </span>
            </Tooltip>
          </div>
          {Math.abs(s.priceDelta) / s.basePrice > 0.2 && (
            <div style={{ marginTop: 4 }}>
              <Tag color={s.direction === 'raise' ? 'red' : 'green'} style={{ fontSize: 9, border: 'none' }}>
                {s.direction === 'raise' ? '+' : ''}{Math.round(s.priceDelta / s.basePrice * 100)}%
              </Tag>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
