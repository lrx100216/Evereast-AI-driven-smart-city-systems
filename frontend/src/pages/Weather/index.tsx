/**
 * 【模块说明】Weather 环境监测 — 实时天气与太阳能效率页面
 * Module: Weather — Real-time weather and solar efficiency monitoring
 *
 * 【功能】展示温度/湿度/光照强度统计、天气状况、未来气温预报折线图、
 *         基于光照强度的太阳能发电效率评估
 * Function: Displays temperature/humidity/light stats, weather condition,
 *           forecast temperature chart, and solar efficiency evaluation.
 *
 * 【关键配置】
 * - conditionIcons: 天气状况图标映射（sunny/cloudy/rainy/unknown）
 * - iconTheme: 统计卡片图标颜色主题
 *
 * 【主要组件/函数】
 * - tempVal / humVal / lightVal / effVal: useCountUp 数字动画值
 * - efficiency: 基于光照强度计算的太阳能效率百分比
 * - chartData: 从 forecast 数据提取未来气温与日期标签
 * - Loading 与 Error 状态处理（支持重试刷新）
 *
 * 【依赖 Hooks】
 * - useLang: 国际化多语言
 * - useCountUp: 数字递增动画
 * - useWeather: 实时天气数据（含加载/错误/重试状态）
 */
import { useState } from 'react';
import { Card, Row, Col, Spin, Button } from 'antd';
import { CloudOutlined, DashboardOutlined, BulbOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useCountUp } from '../../hooks/useCountUp';
import { useWeather } from '../../hooks/useWeather';
import Chart from '../../components/Charts';

const conditionIcons: Record<string, string> = {
  sunny: '☀️', cloudy: '⛅', rainy: '🌧️', unknown: '❓',
};

const iconTheme: Record<string, { bg: string; fg: string }> = {
  temperature:    { bg: 'rgba(239,83,80,0.12)', fg: '#ef5350' },
  humidity:       { bg: 'rgba(79,195,247,0.12)', fg: '#4fc3f7' },
  lightIntensity: { bg: 'rgba(255,167,38,0.12)', fg: '#ffa726' },
};

export default function Weather() {
  const { t } = useLang();
  const { data, loading, error, refetch } = useWeather();
  const [mounted] = useState(true);

  // All useCountUp calls MUST be before any early return (Rules of Hooks)
  const tempVal = useCountUp(Math.round((data?.temperature ?? 26) * 10), 1500, mounted);
  const humVal = useCountUp(data?.humidity ?? 60, 1500, mounted);
  const lightVal = useCountUp(data?.lightIntensity ?? 500, 1500, mounted);
  const efficiency = data
    ? Math.min(100, Math.round(((data.lightIntensity / 1000) * 100)))
    : 87;
  const effVal = useCountUp(efficiency, 1500, mounted);

  // Loading (first load)
  if (loading && !data) {
    return (
      <div>
        <h1 className="page-title anim-up">{t.weather.title}</h1>
        <Card className="glass-card" styles={{ body: { padding: 24, textAlign: 'center' } }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: 'rgba(13,27,62,0.35)', fontSize: 13 }}>
            {t.weather.title}
          </div>
        </Card>
      </div>
    );
  }

  // Error (no cached data)
  if (error && !data) {
    return (
      <div>
        <h1 className="page-title anim-up">{t.weather.title}</h1>
        <Card className="glass-card" styles={{ body: { padding: 24, textAlign: 'center' } }}>
          <WarningOutlined style={{ fontSize: 28, color: 'rgba(255,167,38,0.3)', marginBottom: 12, display: 'block' }} />
          <div style={{ fontSize: 13, color: 'rgba(13,27,62,0.35)', marginBottom: 12 }}>
            {(t.status as Record<string, string>).waitingForData}
          </div>
          <Button icon={<ReloadOutlined />} onClick={refetch}>Retry</Button>
        </Card>
      </div>
    );
  }

  const errorBanner = error && data ? (
    <div style={{
      marginBottom: 16, padding: '8px 16px', borderRadius: 8,
      background: 'rgba(255,167,38,0.08)',
      border: '1px solid rgba(255,167,38,0.15)',
      fontSize: 12, color: '#ffa726',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <WarningOutlined />
      <span>Weather data may be stale — API error: {error}</span>
      <Button size="small" icon={<ReloadOutlined />} onClick={refetch}
        loading={loading}
        style={{ marginLeft: 'auto', borderRadius: 6, fontSize: 11, height: 26 }} />
    </div>
  ) : null;

  const condition = data?.weatherCondition || 'unknown';
  const solarFactor = data?.solarFactor ?? 1;
  const isNight = solarFactor < 0.05;
  const chartData = data?.forecast?.length
    ? {
        values: data.forecast.map(d => d.max),
        labels: data.forecast.map((d) => {
          const date = new Date(d.date);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }),
      }
    : null;

  return (
    <div>
      <h1 className="page-title anim-up">{t.weather.title}</h1>

      {errorBanner}

      <Row gutter={[20, 20]} className="stagger">
        <Col xs={24} sm={8}>
          <Card className="glass-card" styles={{ body: { padding: 22 } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div className="stat-icon-box" style={{ background: iconTheme.temperature.bg, color: iconTheme.temperature.fg }}>
                <DashboardOutlined />
              </div>
              <span className="stat-label">{t.weather.temperature}</span>
            </div>
            <div className="stat-value">
              {(tempVal / 10).toFixed(1)}
              <span className="stat-unit">°C</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="glass-card" styles={{ body: { padding: 22 } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div className="stat-icon-box" style={{ background: iconTheme.humidity.bg, color: iconTheme.humidity.fg }}>
                <CloudOutlined />
              </div>
              <span className="stat-label">{t.weather.humidity}</span>
            </div>
            <div className="stat-value">
              {humVal}
              <span className="stat-unit">%</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="glass-card" styles={{ body: { padding: 22 } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div className="stat-icon-box" style={{ background: iconTheme.lightIntensity.bg, color: iconTheme.lightIntensity.fg }}>
                <BulbOutlined />
              </div>
              <span className="stat-label">{t.weather.lightIntensity}</span>
            </div>
            <div className="stat-value">
              {lightVal}
              <span className="stat-unit">lux</span>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col xs={24} lg={8}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.weather.condition}</span>}
          >
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div className="anim-float" style={{ fontSize: 68, marginBottom: 8 }}>
                {conditionIcons[condition]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#0d1b3e' }}>
                {(t.weather as Record<string, string>)[condition] || condition}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.weather.temperature}</span>}
          >
            {mounted && chartData && (
              <Chart type="line" data={chartData.values} categories={chartData.labels} color={['#ef5350']} />
            )}
            {!chartData && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(13,27,62,0.25)' }}>
                No forecast data available
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }} className="stagger">
        <Col span={24}>
          <Card
            className="glass-card"
            title={<span style={{ color: '#0d1b3e', fontWeight: 600, fontSize: 15 }}>{t.weather.solarEfficiency}</span>}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '20px 0' }}>
              <div className="anim-float" style={{ fontSize: 44 }}>{isNight ? '🌙' : '☀️'}</div>
              <div style={{ textAlign: 'center' }}>
                <div className="stat-value" style={{ fontSize: 36 }}>
                  {effVal}%
                </div>
                <div style={{ fontSize: 13, color: 'rgba(13,27,62,0.35)', marginTop: 2, maxWidth: 260 }}>
                  {isNight ? '🌙 夜间模式 — 电池放电中' : t.weather.prediction}
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
