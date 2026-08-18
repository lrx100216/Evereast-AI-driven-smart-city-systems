import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Tag, Spin, message } from 'antd';
import {
  BulbOutlined,
  ReloadOutlined,
  CheckOutlined,
  ThunderboltOutlined,
  CarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { API_URL } from '../../config';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────

interface TrafficAdvice {
  greenDuration: number;
  redDuration: number;
  reasoning: string;
}

interface EnergyAdvice {
  strategy: 'store' | 'release' | 'idle';
  panelAngle: number;
  reasoning: string;
}

interface AIAdviceData {
  timestamp: string;
  cached: boolean;
  source: 'api' | 'mock' | 'cache';
  traffic: TrafficAdvice | null;
  energy: EnergyAdvice | null;
  overall: string;
}

interface AIAdviceProps {
  mode?: 'traffic' | 'energy' | 'full';
}

// ─── Helpers ──────────────────────────────────────────────

const strategyKeyMap: Record<string, string> = {
  store: 'storing', release: 'releasing', idle: 'idle',
};

const strategyStyle: Record<string, { color: string; icon: string }> = {
  store: { color: '#4fc3f7', icon: '🔋' },
  release: { color: '#ffa726', icon: '⚡' },
  idle: { color: '#66bb6a', icon: '⚖️' },
};

// ─── Component ────────────────────────────────────────────

export default function AIAdvice({ mode = 'full' }: AIAdviceProps) {
  const { t } = useLang();
  const [data, setData] = useState<AIAdviceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const fetchAdvice = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_URL}/ai/advice`);
      setData(res.data);
    } catch (e: any) {
      setError(e?.message || 'Connection failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdvice();
    const id = setInterval(fetchAdvice, 15_000);
    return () => clearInterval(id);
  }, [fetchAdvice]);

  // ── Apply handlers ──

  const applySignal = async () => {
    if (!data?.traffic) return;
    setApplying('signal');
    try {
      await axios.post(`${API_URL}/traffic-sim/signal/cycle`, {
        intersectionId: 'main',
        greenDuration: data.traffic.greenDuration,
      });
      message.success(t.ai.adviceApplied || '建议已应用');
    } catch {
      message.error(t.ai.applyFailed || '应用失败');
    } finally {
      setApplying(null);
    }
  };

  const applyPanel = async () => {
    if (!data?.energy) return;
    setApplying('panel');
    try {
      await axios.post(`${API_URL}/energy/panel/angle`, {
        angle: data.energy.panelAngle,
      });
      message.success(t.ai.adviceApplied || '建议已应用');
    } catch {
      message.error(t.ai.applyFailed || '应用失败');
    } finally {
      setApplying(null);
    }
  };

  // ── Render states ──

  // Loading (first load only)
  if (loading && !data) {
    return (
      <Card className="glass-card" styles={{ body: { padding: 24, textAlign: 'center' } }}>
        <Spin />
        <div style={{ marginTop: 8, color: 'rgba(13,27,62,0.35)', fontSize: 13 }}>
          {t.ai.analyzing || 'AI 分析中...'}
        </div>
      </Card>
    );
  }

  // Error state (backend offline)
  if (error && !data) {
    return (
      <Card className="glass-card" styles={{ body: { padding: 20 } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BulbOutlined style={{ color: '#ffa726', fontSize: 18 }} />
            <span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>
              {t.ai.title || 'AI 优化建议'}
            </span>
          </div>
        }
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchAdvice} loading={loading}
            style={{ borderRadius: 8, border: '1px solid rgba(79,195,247,0.15)', color: 'rgba(13,27,62,0.4)', fontSize: 12 }} />
        }
      >
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <WarningOutlined style={{ fontSize: 24, color: 'rgba(255,167,38,0.3)', marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: 'rgba(13,27,62,0.35)', marginBottom: 8 }}>
            {t.ai.offline || '后端未连接，请先启动服务'}
          </div>
          <Button size="small" onClick={fetchAdvice} loading={loading}
            style={{ borderRadius: 8, fontSize: 12 }}>
            {t.ai.retry || '重试'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="glass-card"
      styles={{ body: { padding: 20 } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BulbOutlined style={{ color: '#ffa726', fontSize: 18 }} />
          <span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>
            {t.ai.title || 'AI Optimization'}
          </span>
          {data?.source === 'cache' && (
            <Tag style={{ marginLeft: 8, fontSize: 10, borderRadius: 4, border: 'none', background: 'rgba(255,167,38,0.1)', color: '#ffa726' }}>
              CACHED
            </Tag>
          )}
          {data?.source === 'api' && (
            <Tag style={{ marginLeft: 4, fontSize: 10, borderRadius: 4, border: 'none', background: 'rgba(102,187,106,0.1)', color: '#66bb6a' }}>
              AI
            </Tag>
          )}
          {data?.source === 'mock' && (
            <Tag style={{ marginLeft: 4, fontSize: 10, borderRadius: 4, border: 'none', background: 'rgba(255,167,38,0.1)', color: '#ffa726' }}>
              {t.ai.mock || 'Local'}
            </Tag>
          )}
        </div>
      }
      extra={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={fetchAdvice}
          loading={loading}
          style={{ borderRadius: 8, border: '1px solid rgba(79,195,247,0.15)', color: 'rgba(13,27,62,0.4)', fontSize: 12 }}
        />
      }
    >
      {/* Overall status */}
      {data?.overall && (
        <div
          style={{
            padding: '10px 14px', borderRadius: 10,
            background: data.overall.includes('⚠️') ? 'rgba(239,83,80,0.06)' : 'rgba(102,187,106,0.06)',
            border: `1px solid ${data.overall.includes('⚠️') ? 'rgba(239,83,80,0.12)' : 'rgba(102,187,106,0.12)'}`,
            marginBottom: 16, fontSize: 13,
            color: data.overall.includes('⚠️') ? '#ef5350' : '#66bb6a',
            fontWeight: 500, lineHeight: 1.5,
          }}
        >
          {data.overall}
        </div>
      )}

      {/* Traffic advice */}
      {data?.traffic && mode !== 'energy' && (
        <div style={{ marginBottom: mode === 'full' ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <CarOutlined style={{ color: '#4fc3f7' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: '#0d1b3e' }}>
              {t.ai.trafficAdvice || 'Traffic Signal Advice'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'rgba(79,195,247,0.06)', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', marginBottom: 2 }}>
                {t.ai.greenDuration || '绿灯'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#66bb6a' }}>
                {data.traffic.greenDuration}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(13,27,62,0.25)' }}>s</span>
              </div>
            </div>
            <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,83,80,0.06)', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', marginBottom: 2 }}>
                {t.ai.redDuration || '红灯'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#ef5350' }}>
                {data.traffic.redDuration}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(13,27,62,0.25)' }}>s</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(13,27,62,0.5)', lineHeight: 1.6, marginBottom: 10 }}>
            {data.traffic.reasoning}
          </div>
          <Button type="primary" size="small" icon={<CheckOutlined />}
            loading={applying === 'signal'} onClick={applySignal}
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #4fc3f7, #66bb6a)', border: 'none', boxShadow: '0 4px 12px rgba(79,195,247,0.25)', height: 32, fontSize: 12 }}>
            {t.ai.applySignal || '应用信号配时'}
          </Button>
        </div>
      )}

      {/* Energy advice */}
      {data?.energy && mode !== 'traffic' && (
        <div>
          {mode === 'full' && <hr style={{ border: 'none', borderTop: '1px solid rgba(79,195,247,0.08)', margin: '16px 0' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <ThunderboltOutlined style={{ color: '#ffa726' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: '#0d1b3e' }}>
              {t.ai.energyAdvice || 'Energy Strategy'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(255,167,38,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{strategyStyle[data.energy.strategy]?.icon || '⚖️'}</span>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', marginBottom: 1 }}>
                  {t.ai.strategy || '策略'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: strategyStyle[data.energy.strategy]?.color || '#66bb6a' }}>
                  {(t.energy as Record<string, string>)[strategyKeyMap[data.energy.strategy]] || data.energy.strategy}
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(79,195,247,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', marginBottom: 1 }}>
                  {t.ai.panelAngle || '面板角度'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4fc3f7' }}>
                  {data.energy.panelAngle}°
                </div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(13,27,62,0.5)', lineHeight: 1.6, marginBottom: 10 }}>
            {data.energy.reasoning}
          </div>
          <Button type="primary" size="small" icon={<CheckOutlined />}
            loading={applying === 'panel'} onClick={applyPanel}
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #ffa726, #ff7043)', border: 'none', boxShadow: '0 4px 12px rgba(255,167,38,0.25)', height: 32, fontSize: 12 }}>
            {t.ai.applyEnergy || '应用能源策略'}
          </Button>
        </div>
      )}

      {/* Fallback */}
      {!data?.traffic && !data?.energy && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>
          {t.ai.noAdvice || '等待 AI 分析...'}
        </div>
      )}
    </Card>
  );
}
