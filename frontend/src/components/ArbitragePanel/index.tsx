import React from 'react'
import { Card, Switch, Typography, Skeleton, Alert, Tag, Space, Badge } from 'antd'
import {
  ThunderboltOutlined,
  ApartmentOutlined,
  DollarOutlined,
  CarOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  NodeExpandOutlined,
} from '@ant-design/icons'
import { useArbitrage } from '../../hooks/useArbitrage'
import { StressGauge } from './StressGauge'
import { CausalChain } from './CausalChain'
import { PricingHeatmap } from './PricingHeatmap'
import { ComparisonView } from './ComparisonView'
import { useLang } from '../../i18n/LanguageContext'

const { Text } = Typography

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.5)',
  borderRadius: '12px',
  border: '1px solid rgba(79,195,247,0.08)',
  height: '100%',
}

const sectionHeader: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'rgba(13,27,62,0.35)',
  marginBottom: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
}

export const ArbitragePanel: React.FC = () => {
  const { t } = useLang()
  const { snapshot, isActive, toggleActive, isLoading } = useArbitrage()

  if (isLoading) {
    return (
      <Card style={glassCard}>
        <Skeleton active paragraph={{ rows: 6 }} />
        <div style={{ textAlign: 'center', color: 'rgba(13,27,62,0.25)', marginTop: '12px', fontSize: '13px' }}>
          {t.arbitrage.loading}
        </div>
      </Card>
    )
  }

  if (!snapshot) {
    return (
      <Card style={glassCard}>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(13,27,62,0.25)' }}>
          <ApartmentOutlined style={{ fontSize: '36px', marginBottom: '12px', display: 'block', opacity: 0.3 }} />
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: 'rgba(13,27,62,0.4)' }}>{t.arbitrage.noData}</div>
          <div style={{ fontSize: '12px', color: 'rgba(13,27,62,0.2)' }}>Waiting for simulation data...</div>
        </div>
      </Card>
    )
  }

  const {
    gridStress,
    pricing,
    diversion,
    mobileBattery,
    causalMetrics,
    comparison,
  } = snapshot

  const isStressHigh = gridStress.sectorA.avgStress > 0.7
  const isV2GActive = mobileBattery.isInjecting

  return (
    <Card
      className="glass-card"
      style={{ borderRadius: '12px' }}
      title={
        <Space size={10}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(79,195,247,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#4fc3f7', fontSize: 16,
          }}>
            <ThunderboltOutlined />
          </div>
          <span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: '15px' }}>
            {t.arbitrage.title}
          </span>
          <Tag style={{ borderRadius: 4, border: 'none', fontSize: 10, background: 'rgba(79,195,247,0.1)', color: '#4fc3f7', fontWeight: 600 }}>
            Cross-Domain Causal Arbitrage
          </Tag>
        </Space>
      }
      extra={
        <Space size={12}>
          {isV2GActive && (
            <Badge status="success" text={<span style={{ color: '#52c41a', fontSize: 12, fontWeight: 600 }}>V2G</span>} />
          )}
          <span style={{ color: 'rgba(13,27,62,0.3)', fontSize: 12 }}>{t.arbitrage.toggle}</span>
          <Switch
            checked={isActive}
            onChange={toggleActive}
            checkedChildren="ON"
            unCheckedChildren="OFF"
            style={{ background: isActive ? '#4fc3f7' : undefined }}
          />
        </Space>
      }
    >
      {/* Alerts */}
      {isStressHigh && (
        <Alert
          message={
            <Space>
              <AlertOutlined style={{ color: '#ef5350' }} />
              <span style={{ fontWeight: 600, color: '#ef5350' }}>{t.arbitrage.alerts.criticalStress}</span>
            </Space>
          }
          type="error"
          showIcon={false}
          style={{ marginBottom: '14px', borderRadius: '8px', background: 'rgba(239,83,80,0.06)', border: '1px solid rgba(239,83,80,0.12)' }}
          closable={false}
        />
      )}
      {isV2GActive && (
        <Alert
          message={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span style={{ fontWeight: 600, color: '#52c41a' }}>{t.arbitrage.alerts.v2gInjecting}</span>
              <Tag color="green" style={{ borderRadius: 4, fontSize: 10 }}>{mobileBattery.v2gDischargeKw.toFixed(0)} kW</Tag>
            </Space>
          }
          type="success"
          showIcon={false}
          style={{ marginBottom: '14px', borderRadius: '8px', background: 'rgba(82,196,26,0.05)', border: '1px solid rgba(82,196,26,0.1)' }}
          closable={false}
        />
      )}

      {/* Causal Chain */}
      <Card
        size="small"
        style={{ ...glassCard, marginBottom: '14px' }}
        title={<span style={sectionHeader}><NodeExpandOutlined /> {t.arbitrage.causalChain}</span>}
      >
        <CausalChain stress={gridStress} pricing={pricing} />
      </Card>

      {/* Grid Stress Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <Card size="small" style={{
          ...glassCard,
          border: `1px solid ${isStressHigh ? 'rgba(239,83,80,0.2)' : 'rgba(79,195,247,0.08)'}`,
        }}>
          <StressGauge
            value={gridStress.sectorA.avgStress}
            label={t.arbitrage.sectorA}
            riskLevel={gridStress.sectorA.riskLevel as 'low' | 'moderate' | 'high' | 'critical'}
          />
        </Card>
        <Card size="small" style={glassCard}>
          <StressGauge
            value={gridStress.sectorB.avgStress}
            label={t.arbitrage.sectorB}
            riskLevel={gridStress.sectorB.riskLevel as 'low' | 'moderate' | 'high' | 'critical'}
          />
        </Card>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {[
          { icon: <DollarOutlined />, label: t.arbitrage.stressReduction, value: `${(causalMetrics.stressReductionAte * 100).toFixed(0)}%`, color: '#52c41a', sub: 'ATE estimate' },
          { icon: <CarOutlined />, label: t.arbitrage.divertedVehicles, value: `${diversion.totalDiverted}`, color: '#4fc3f7', sub: `${diversion.divertedCount}/tick` },
          { icon: <ThunderboltOutlined />, label: isV2GActive ? 'V2G 馈电' : 'V2G 待机', value: `${mobileBattery.v2gDischargeKw.toFixed(0)} kW`, color: isV2GActive ? '#52c41a' : 'rgba(13,27,62,0.25)', sub: `${mobileBattery.totalCapacityKwh.toFixed(0)} kWh` },
          { icon: <ApartmentOutlined />, label: t.arbitrage.lyapunovQ, value: pricing.lyapunovQ.toFixed(2), color: '#ffa726', sub: `drift ${pricing.lyapunovDrift.toFixed(2)}` },
        ].map((m, i) => (
          <Card key={i} size="small" style={{ ...glassCard, textAlign: 'center' }}>
            <div style={{ color: m.color, fontSize: '18px', marginBottom: '4px' }}>{m.icon}</div>
            <div style={{ color: 'rgba(13,27,62,0.35)', fontSize: '11px', marginBottom: '2px', fontWeight: 500 }}>{m.label}</div>
            <div style={{ color: '#0d1b3e', fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
          </Card>
        ))}
      </div>

      {/* Pricing + Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <Card size="small" style={glassCard} title={<span style={sectionHeader}><DollarOutlined /> {t.arbitrage.pricing}</span>}>
          <PricingHeatmap pricing={pricing} />
        </Card>
        <Card size="small" style={glassCard} title={<span style={sectionHeader}><ApartmentOutlined /> {t.arbitrage.comparison}</span>}>
          <ComparisonView comparison={comparison} />
        </Card>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(79,195,247,0.06)' }}>
        <Text style={{ color: 'rgba(13,27,62,0.2)', fontSize: '11px', fontFamily: 'monospace' }}>
          {new Date(snapshot.timestamp).toLocaleTimeString()} · causal loop
        </Text>
        <Space size={6}>
          {diversion.activeActions.length > 0 && (
            <Tag color="blue" style={{ borderRadius: 4, fontSize: 10, border: 'none' }}>{diversion.activeActions.length} diversion actions</Tag>
          )}
          <Tag
            color={isStressHigh ? 'red' : gridStress.sectorA.avgStress > 0.4 ? 'orange' : 'green'}
            style={{ borderRadius: 4, fontSize: 10, border: 'none', fontWeight: 600 }}
          >
            {isStressHigh ? '⚠ HIGH STRESS' : gridStress.sectorA.avgStress > 0.4 ? '⚡ MODERATE' : '✅ STABLE'}
          </Tag>
          <Tag style={{ borderRadius: 4, fontSize: 10, border: 'none', background: 'rgba(79,195,247,0.06)', color: 'rgba(13,27,62,0.3)' }}>
            {isActive ? '◇ arbitrage ON' : '◇ OFF'}
          </Tag>
        </Space>
      </div>
    </Card>
  )
}
