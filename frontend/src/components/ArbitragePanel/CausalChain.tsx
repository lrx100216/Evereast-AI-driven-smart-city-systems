import React from 'react'
import type { GridStressSnapshot, LyapunovPricingSnapshot } from '../../../../shared/types/arbitrage'

interface CausalChainProps {
  stress: GridStressSnapshot | null
  pricing: LyapunovPricingSnapshot | null
}

function getStressColor(prob: number): string {
  if (prob > 0.7) return '#ef5350'
  if (prob > 0.4) return '#fa541c'
  if (prob > 0.2) return '#faad14'
  return '#52c41a'
}

export const CausalChain: React.FC<CausalChainProps> = ({ stress, pricing }) => {
  const cloudCover = stress?.weatherContext.cloudCover ?? 0
  const solarEff = stress?.weatherContext.solarEfficiency ?? 0
  const stressProb = stress?.sectorA.avgStress ?? 0
  const priceDelta = pricing?.sectorA.avgDelta ?? 0
  const diverted = 0 // placeholder

  const nodes = [
    { icon: cloudCover > 0.6 ? '☁️' : cloudCover > 0.3 ? '⛅' : '☀️', label: 'Weather', value: `${Math.round(cloudCover * 100)}%`, color: '#4fc3f7' },
    { icon: '☀️', label: 'Solar', value: `${Math.round(solarEff * 100)}% eff`, color: '#66bb6a' },
    { icon: '⚡', label: 'Grid Stress', value: `${Math.round(stressProb * 100)}%`, color: getStressColor(stressProb) },
    { icon: '💰', label: 'EV Pricing', value: priceDelta > 0 ? `↗${Math.round(priceDelta * 100)}%` : priceDelta < 0 ? `↘${Math.round(Math.abs(priceDelta) * 100)}%` : '→0%', color: priceDelta > 0 ? '#ef5350' : '#52c41a' },
    { icon: '🚗', label: 'Diversion', value: `~${diverted} veh`, color: '#4fc3f7' },
  ]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: '2px',
      padding: '8px 0',
    }}>
      {nodes.map((node, i) => (
        <React.Fragment key={node.label}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '8px 14px', borderRadius: '10px',
            background: `${node.color}06`,
            border: `1px solid ${node.color}15`,
            minWidth: '80px',
          }}>
            <div style={{ fontSize: '22px', marginBottom: '2px', lineHeight: 1.2 }}>{node.icon}</div>
            <div style={{ fontSize: '10px', color: 'rgba(13,27,62,0.3)', fontWeight: 500 }}>{node.label}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: node.color }}>{node.value}</div>
          </div>
          {i < nodes.length - 1 && (
            <div style={{ color: 'rgba(13,27,62,0.12)', fontSize: '16px', fontWeight: 300, padding: '0 4px' }}>→</div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
