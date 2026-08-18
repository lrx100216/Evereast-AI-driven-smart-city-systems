/**
 * 【模块说明】About 项目介绍 — 智慧城市系统的关于/落地页
 * Module: About — Landing and project introduction page
 *
 * 【功能】展示深圳主题 Hero 大图、项目使命卡片、城市介绍、
 *         硬件/无人机/AI 集成能力说明、技术架构与快速导航
 * Function: Displays Shenzhen hero banner, mission cards, city intro,
 *           integration capabilities, tech stack, and quick navigation.
 *
 * 【关键配置】
 * - SZ_HERO: Hero 区域背景图片路径（默认 /images/shenzhen-hero.jpg）
 * - getMissions: 使命卡片配置（交通/能源/环境三个模块的跳转路由）
 *
 * 【主要组件/函数】
 * - getMissions: 根据语言包生成交通/能源/天气三个使命卡片数据
 * - MissionCard 渲染: 点击卡片可路由跳转到对应功能页面
 * - 深圳地标网格: 前海/深圳湾大桥/科技园/莲花山公园四宫格展示
 * - Quick Nav Bar: 底部快速导航栏（交通/能源/天气）
 *
 * 【依赖 Hooks】
 * - useLang: 国际化多语言
 * - useNavigate: React Router 页面跳转
 */
import { Card, Row, Col, Tag } from 'antd';
import {
  CarOutlined, ThunderboltOutlined, CloudOutlined,
  ApiOutlined, RobotOutlined, RocketOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../i18n/LanguageContext';

// ─── Shenzhen hero image ──────────────────────────────────
const SZ_HERO = '/images/shenzhen-hero.jpg';

// ─── Mission card config ──────────────────────────────────

interface MissionCard {
  key: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  bgColor: string;
  route: string;
}

function getMissions(t: any): MissionCard[] {
  return [
    {
      key: 'traffic',
      icon: <CarOutlined />,
      title: t.traffic?.title || '交通监控',
      desc: t.about.missionTraffic,
      color: '#4fc3f7',
      bgColor: 'rgba(79,195,247,0.06)',
      route: '/traffic',
    },
    {
      key: 'energy',
      icon: <ThunderboltOutlined />,
      title: t.energy?.title || '能源管理',
      desc: t.about.missionEnergy,
      color: '#66bb6a',
      bgColor: 'rgba(102,187,106,0.06)',
      route: '/energy',
    },
    {
      key: 'weather',
      icon: <CloudOutlined />,
      title: t.weather?.title || '环境监测',
      desc: t.about.missionWeather,
      color: '#ffa726',
      bgColor: 'rgba(255,167,38,0.06)',
      route: '/weather',
    },
  ];
}

// ─── Component ────────────────────────────────────────────

export default function About() {
  const { t } = useLang();
  const navigate = useNavigate();
  const missions = getMissions(t);

  return (
    <div>
      {/* ========== Hero Section ========== */}
      <div className="anim-up">
        <Card
          className="glass-card"
          styles={{ body: { padding: 0 } }}
          style={{
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.5) !important',
          }}
        >
          <div style={{
            position: 'relative', height: 460, overflow: 'hidden', borderRadius: 'inherit',
            backgroundImage: `url(${SZ_HERO})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 92%',
            backgroundRepeat: 'no-repeat',
          }}>
            {/* Gradient overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(10,22,40,0.7) 0%, rgba(10,22,40,0.15) 50%, transparent 100%)',
            }} />
            {/* Content at bottom */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '20px 28px 18px',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 16,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <h1 style={{
                    fontSize: 28, fontWeight: 800, color: '#fff',
                    letterSpacing: -0.5, margin: 0,
                    textShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}>
                    {t.about.title}
                  </h1>
                  <Tag
                    style={{
                      borderRadius: 6, border: 'none', fontSize: 11,
                      background: 'rgba(79,195,247,0.25)', color: '#4fc3f7',
                      fontWeight: 600, padding: '2px 10px', margin: 0,
                    }}
                  >
                    <RocketOutlined style={{ marginRight: 4 }} />
                    Hack Harvard 2026
                  </Tag>
                </div>
                <p style={{
                  fontSize: 14, color: '#fff',
                  lineHeight: 1.7, maxWidth: 640, margin: 0,
                  textShadow: '0 1px 8px rgba(0,0,0,0.5)',
                }}>
                  {t.about.projectSubtitle}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: t.about.shenzhenFact1, color: '#4fc3f7' },
                  { label: t.about.shenzhenFact2, color: '#66bb6a' },
                  { label: t.about.shenzhenFact3, color: '#66bb6a' },
                ].map((f, i) => (
                  <div key={i}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: 12, fontWeight: 600, color: f.color,
                    }}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ========== Mission Section ========== */}
      <div style={{ marginTop: 28 }}>
        <h2 className="page-title anim-up" style={{ fontSize: 18, marginBottom: 16 }}>
          {t.about.missionTitle}
        </h2>
        <Row gutter={[20, 20]} className="stagger">
          {missions.map((m) => (
            <Col xs={24} md={8} key={m.key}>
              <Card
                className="glass-card"
                style={{
                  cursor: 'pointer',
                  background: `${m.bgColor} !important`,
                }}
                onClick={() => navigate(m.route)}
                styles={{ body: { padding: 24 } }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: `${m.color}12`,
                  color: m.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, marginBottom: 14,
                }}>
                  {m.icon}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0d1b3e', marginBottom: 8 }}>
                  {m.title}
                </h3>
                <p style={{ fontSize: 13, color: 'rgba(13,27,62,0.5)', lineHeight: 1.7, margin: 0 }}>
                  {m.desc}
                </p>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* ========== Shenzhen Intro Section ========== */}
      <div style={{ marginTop: 28 }} className="anim-up">
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={14}>
            <Card
              className="glass-card"
              styles={{ body: { padding: 24 } }}
              style={{ height: '100%' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 24 }}>🌏</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0d1b3e' }}>
                  {t.about.shenzhenTitle}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(13,27,62,0.55)', lineHeight: 1.9, marginBottom: 12 }}>
                {t.about.shenzhenDesc1}
              </p>
              <p style={{ fontSize: 13, color: 'rgba(13,27,62,0.55)', lineHeight: 1.9, margin: 0 }}>
                {t.about.shenzhenDesc2}
              </p>
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card
              className="glass-card"
              styles={{ body: { padding: 0, overflow: 'hidden' } }}
              style={{ height: '100%' }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                height: '100%', minHeight: 220,
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #0d1b3e 0%, #1a355a 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 4, padding: 12,
                }}>
                  <span style={{ fontSize: 28, opacity: 0.6 }}>🏙️</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                    前海自贸区
                  </span>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, #1a355a 0%, #2d5a8e 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 4, padding: 12,
                }}>
                  <span style={{ fontSize: 28, opacity: 0.6 }}>🌉</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                    深圳湾大桥
                  </span>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, #2d5a8e 0%, #4fc3f720 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 4, padding: 12,
                }}>
                  <span style={{ fontSize: 28, opacity: 0.6 }}>🏢</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                    科技园
                  </span>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, #4fc3f720 0%, #66bb6a15 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 4, padding: 12,
                }}>
                  <span style={{ fontSize: 28, opacity: 0.6 }}>🌳</span>
                  <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.4)', fontWeight: 500 }}>
                    莲花山公园
                  </span>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* ========== Integration + Tech Stack ========== */}
      <div style={{ marginTop: 28 }} className="anim-up">
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={12}>
            <Card
              className="glass-card"
              styles={{ body: { padding: 24 } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <ApiOutlined style={{ fontSize: 20, color: '#4fc3f7' }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0d1b3e' }}>
                  {t.about.integrationTitle}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(13,27,62,0.55)', lineHeight: 1.9, marginBottom: 16 }}>
                {t.about.integrationDesc}
              </p>
              <Row gutter={[12, 12]}>
                {[
                  { icon: '🔧', label: t.about.hardwareReady, desc: 'Arduino UNO / 传感器', color: '#4fc3f7' },
                  { icon: '🚁', label: t.about.droneReady, desc: 'DJI Tello / 自定义飞控', color: '#66bb6a' },
                  { icon: '🧠', label: t.about.aiReady, desc: 'DeepSeek / 实时决策', color: '#ffa726' },
                ].map((item, i) => (
                  <Col xs={8} key={i}>
                    <div style={{
                      textAlign: 'center', padding: '14px 8px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.4)',
                      border: '1px solid rgba(79,195,247,0.06)',
                    }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0d1b3e', marginBottom: 2 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(13,27,62,0.35)' }}>
                        {item.desc}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card
              className="glass-card"
              styles={{ body: { padding: 24 } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <RobotOutlined style={{ fontSize: 20, color: '#66bb6a' }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0d1b3e' }}>
                  {t.energy?.energyFlow || '技术架构'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', flexWrap: 'wrap' }}>
                {[
                  { icon: '☀️', label: '太阳能' },
                  { icon: '→', label: '' },
                  { icon: '🔋', label: '储能' },
                  { icon: '→', label: '' },
                  { icon: '🚁', label: '无人机' },
                  { icon: '→', label: '' },
                  { icon: '🏙️', label: '城市' },
                ].map((item, i) => (
                  <div key={i} className="anim-float" style={{ textAlign: 'center', animationDelay: `${i * 0.15}s` }}>
                    <div style={{ fontSize: item.icon === '→' ? 20 : 30, opacity: item.icon === '→' ? 0.2 : 0.5 }}>{item.icon}</div>
                    {item.label && <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.35)', marginTop: 2, fontWeight: 500 }}>{item.label}</div>}
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 12, padding: '10px 16px', borderRadius: 10,
                background: 'rgba(79,195,247,0.04)',
                border: '1px solid rgba(79,195,247,0.06)',
                fontSize: 12, color: 'rgba(13,27,62,0.4)', lineHeight: 1.8,
              }}>
                <span style={{ fontWeight: 600, color: '#0d1b3e' }}>技术栈：</span>
                React 19 + TypeScript + Vite · Node.js + Express · Socket.IO · Ant Design · ECharts · DeepSeek AI · Arduino
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* ========== CFM v4 — City Foundation Model ========== */}
      <div style={{ marginTop: 28 }} className="anim-up">
        <Card
          className="glass-card"
          styles={{ body: { padding: 0, overflow: 'hidden' } }}
          style={{ background: 'linear-gradient(135deg, rgba(30,10,60,0.03) 0%, rgba(124,77,255,0.06) 50%, rgba(79,195,247,0.04) 100%)' }}
        >
          <div style={{ padding: '28px 32px' }}>
            {/* Header with v4 badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #7c4dff, #b388ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, boxShadow: '0 4px 12px rgba(124,77,255,0.3)',
              }}>
                🧠
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0d1b3e', margin: 0 }}>
                    CFM v4 — {t.about.cfmTitle}
                  </h3>
                  <Tag style={{
                    borderRadius: 4, border: 'none', fontSize: 10,
                    background: 'linear-gradient(135deg, #7c4dff, #b388ff)',
                    color: '#fff', fontWeight: 700, padding: '2px 10px',
                  }}>
                    v3 → v4
                  </Tag>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <Tag style={{ borderRadius: 4, border: 'none', fontSize: 9, background: 'rgba(124,77,255,0.1)', color: '#7c4dff' }}>129.7M params</Tag>
                  <Tag style={{ borderRadius: 4, border: 'none', fontSize: 9, background: 'rgba(79,195,247,0.1)', color: '#4fc3f7' }}>ONNX 384→13</Tag>
                  <Tag style={{ borderRadius: 4, border: 'none', fontSize: 9, background: 'rgba(102,187,106,0.1)', color: '#66bb6a' }}>SwiGLU + RMSNorm</Tag>
                </div>
              </div>
            </div>

            {/* Description + Stats row */}
            <p style={{ fontSize: 13, color: 'rgba(13,27,62,0.55)', lineHeight: 1.9, marginBottom: 20 }}>
              {t.about.cfmDesc}
            </p>

            {/* v3 → v4 upgrade stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 10, marginBottom: 20,
            }}>
              {[
                { label: 'Parameters', v3: '52M', v4: '129.7M', boost: '+149%', color: '#7c4dff' },
                { label: 'Layers', v3: '12', v4: '18', boost: '+50%', color: '#4fc3f7' },
                { label: 'Hidden Dim', v3: '512', v4: '768', boost: '+50%', color: '#66bb6a' },
                { label: 'FFN Activation', v3: 'GELU', v4: 'SwiGLU', boost: 'Llama级', color: '#ffa726' },
                { label: 'Normalization', v3: 'LayerNorm', v4: 'RMSNorm', boost: '快20%', color: '#ab47bc' },
                { label: 'Intersections', v3: '11/16', v4: '16/16', boost: '全利用', color: '#ef5350' },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.5)',
                  border: `1px solid ${s.color}15`,
                }}>
                  <div style={{ fontSize: 9, color: 'rgba(13,27,62,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {s.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.v4}</span>
                    <span style={{ fontSize: 10, color: 'rgba(13,27,62,0.25)', textDecoration: 'line-through' }}>{s.v3}</span>
                    <Tag style={{ marginLeft: 'auto', borderRadius: 4, border: 'none', fontSize: 9, background: `${s.color}12`, color: s.color, fontWeight: 700 }}>
                      {s.boost}
                    </Tag>
                  </div>
                </div>
              ))}
            </div>

            {/* Architecture pipeline */}
            <div style={{
              background: 'rgba(255,255,255,0.5)',
              borderRadius: 12, border: '1px solid rgba(124,77,255,0.12)',
              padding: '20px 24px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,62,0.35)', marginBottom: 14, letterSpacing: 2, textTransform: 'uppercase' }}>
                Inference Pipeline
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, flexWrap: 'wrap', fontSize: 10,
              }}>
                {[
                  { label: '384-d\nCity State', color: '#7c4dff' },
                  { label: '→', color: 'transparent' },
                  { label: '16 Traffic\nTokens', color: '#4fc3f7' },
                  { label: '+', color: 'transparent' },
                  { label: '1 Energy\nToken', color: '#66bb6a' },
                  { label: '+', color: 'transparent' },
                  { label: '[CLS]', color: '#ffa726' },
                  { label: '→', color: 'transparent' },
                  { label: 'RoPE\nPosition', color: '#ab47bc' },
                  { label: '→', color: 'transparent' },
                  { label: '18×\nSwiGLU Block', color: '#ef5350' },
                  { label: '→', color: 'transparent' },
                  { label: '11 Per-ISec\nHeads', color: '#26c6da' },
                  { label: '→', color: 'transparent' },
                  { label: '13-d\nActions', color: '#7c4dff' },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: ['→', '+'].includes(item.label) ? '4px' : '6px 10px',
                    borderRadius: 6,
                    background: ['→', '+'].includes(item.label) ? 'transparent' : `${item.color}10`,
                    border: ['→', '+'].includes(item.label) ? 'none' : `1px solid ${item.color}20`,
                    color: ['→', '+'].includes(item.label) ? 'rgba(13,27,62,0.15)' : item.color,
                    fontWeight: 700,
                    textAlign: 'center',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.3,
                    fontSize: 10,
                    minWidth: ['→', '+'].includes(item.label) ? 12 : 40,
                  }}>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture upgrades detail */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10,
            }}>
              {[
                { icon: '⚡', title: 'SwiGLU FFN', desc: t.about.cfmSwiGLU, color: '#4fc3f7' },
                { icon: '📐', title: 'RMSNorm', desc: t.about.cfmRMSNorm, color: '#66bb6a' },
                { icon: '🛡️', title: 'QK-Norm', desc: t.about.cfmQKNorm, color: '#ffa726' },
                { icon: '🎯', title: 'Per-Intersection Heads', desc: t.about.cfmPerIsec, color: '#ab47bc' },
                { icon: '🔄', title: 'Rotary Position (RoPE)', desc: t.about.cfmRoPE, color: '#26c6da' },
                { icon: '🏗️', title: 'Stochastic Depth', desc: t.about.cfmStochDepth, color: '#ef5350' },
              ].map((u, i) => (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.4)',
                  border: `1px solid ${u.color}12`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 18 }}>{u.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0d1b3e', marginBottom: 2 }}>{u.title}</div>
                    <div style={{ fontSize: 11, color: 'rgba(13,27,62,0.45)', lineHeight: 1.6 }}>{u.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ========== Quick Nav Bar ========== */}
      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <Card
          className="glass-card"
          styles={{ body: { padding: '16px 24px' } }}
          style={{ display: 'inline-block' }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'rgba(13,27,62,0.4)', fontWeight: 500 }}>
              {t.about.startExploring} →
            </span>
            {[
              { path: '/traffic', label: (t.nav as any).traffic, color: '#4fc3f7' },
              { path: '/energy', label: (t.nav as any).energy, color: '#66bb6a' },
              { path: '/weather', label: (t.nav as any).weather, color: '#ffa726' },
            ].map((item) => (
              <span
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  padding: '6px 16px', borderRadius: 8,
                  background: `${item.color}08`,
                  border: `1px solid ${item.color}15`,
                  color: item.color,
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${item.color}15`;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${item.color}08`;
                  e.currentTarget.style.transform = 'none';
                }}
              >
                {item.label}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
