/**
 * 【模块说明】Layout — 全局布局框架（侧边栏 + 顶部栏 + 内容区）
 * Module: Layout — Global layout frame (sidebar + header + content)
 *
 * 【功能】提供全站统一的导航侧边栏、顶部状态栏、语言切换、深圳时钟。
 *         侧边栏采用浅色毛玻璃风格，菜单项支持路由跳转。
 * Function: Provides unified sidebar navigation, header status bar,
 *           language toggle, and Shenzhen real-time clock.
 *
 * 【关键配置】
 * - menuItems: 导航菜单项（如需增删页面，修改此数组）
 * - Sider width: 220px（固定宽度，折叠时为 72px）
 *
 * 【样式覆盖】侧边栏颜色在 index.css 的 .ant-layout-sider 中定义
 */
import { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  CarOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  InfoCircleOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';

const { Sider, Content, Header } = AntLayout;

const menuItems = [
  { key: '/about', icon: <InfoCircleOutlined />, label: 'about' },
  { key: '/', icon: <DashboardOutlined />, label: 'dashboard' },
  { key: '/traffic', icon: <CarOutlined />, label: 'traffic' },
  { key: '/energy', icon: <ThunderboltOutlined />, label: 'energy' },
  { key: '/weather', icon: <CloudOutlined />, label: 'weather' },
  { key: '/ai-insights', icon: <BulbOutlined />, label: 'aiInsights' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, toggleLang } = useLang();
  const [time, setTime] = useState(
    new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {/* ===== Glass Sidebar — light blue frosted glass ===== */}
      <Sider
        width={220}
        breakpoint="lg"
        collapsedWidth="72"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(227, 242, 253, 0.95)',
          backdropFilter: 'blur(32px) saturate(160%)',
          WebkitBackdropFilter: 'blur(32px) saturate(160%)',
          borderRight: '1px solid rgba(79, 195, 247, 0.25)',
          boxShadow: '4px 0 24px rgba(30, 60, 120, 0.08)',
        }}
      >
        {/* Logo */}
        <div className="anim-scale" style={{ padding: '32px 20px 24px', textAlign: 'center' }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #0d8bc7, #4fc3f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.3,
              letterSpacing: -0.5,
            }}
          >
            Smart City
          </div>
          <div
            className="anim-breathe"
            style={{ fontSize: 10, color: 'rgba(13,27,62,0.65)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 2 }}
          >
            {t.app.subtitle}
          </div>
        </div>

        {/* Nav — fully controlled inline styles to override Ant Design CSS-in-JS */}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems.map((item) => {
            const isSelected = location.pathname === item.key;
            return {
              key: item.key,
              icon: (
                <span style={{ color: isSelected ? '#0969a8' : 'rgba(13,27,62,0.55)', fontSize: 18 }}>
                  {item.icon}
                </span>
              ),
              label: (
                <span style={{
                  color: isSelected ? '#0969a8' : 'rgba(13,27,62,0.7)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 14,
                }}>
                  {(t.nav as Record<string, string>)[item.label]}
                </span>
              ),
              style: {
                borderRadius: 10,
                margin: '3px 12px',
                height: 44,
                lineHeight: '44px',
                background: isSelected ? 'rgba(79, 195, 247, 0.25)' : 'transparent',
                transition: 'all 0.3s ease',
              },
            };
          })}
          onClick={({ key }) => navigate(key)}
          style={{
            flex: 1,
            borderRight: 0,
            paddingTop: 8,
            background: 'transparent',
          }}
        />

        {/* Bottom */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(79,195,247,0.15)' }}>
          <div style={{ fontSize: 10, color: 'rgba(13,27,62,0.45)', textAlign: 'center', letterSpacing: 1.5 }}>
            Hack Harvard
          </div>
        </div>
      </Sider>

      {/* ===== Main ===== */}
      <AntLayout style={{ marginLeft: 220 }}>
        {/* ===== Liquid Glass Header ===== */}
        <Header
          className="anim-down"
          style={{
            height: 56,
            padding: '0 28px',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(245, 250, 255, 0.58) 100%)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.7)',
            boxShadow: '0 4px 24px rgba(30, 60, 120, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 9,
          }}
        >
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="status-dot online" />
            <span style={{ color: 'rgba(13,27,62,0.5)', fontSize: 13, fontWeight: 500 }}>
              {t.status.online}
            </span>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Hardware status indicators */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(79,195,247,0.5)', display: 'flex', alignItems: 'center', gap: 3 }}
                title="Arduino 传感器接口已就绪">
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(79,195,247,0.4)', display: 'inline-block' }} />
                Arduino
              </span>
              <span style={{ fontSize: 11, color: 'rgba(102,187,106,0.5)', display: 'flex', alignItems: 'center', gap: 3 }}
                title="无人机接口已就绪">
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(102,187,106,0.4)', display: 'inline-block' }} />
                Drone
              </span>
            </div>
            <span style={{ color: 'rgba(13,27,62,0.25)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              {time}
            </span>
            <button className="lang-btn" onClick={toggleLang}>
              {lang === 'zh' ? (
                <><span>🌐</span><span>English</span></>
              ) : (
                <><span>🌐</span><span>中文</span></>
              )}
            </button>
          </div>
        </Header>

        {/* ===== Content ===== */}
        <Content style={{ padding: 28, minHeight: 'calc(100vh - 56px)' }}>
          {children}
        </Content>

        {/* ===== Team Badge — fixed bottom-right ===== */}
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            right: 20,
            zIndex: 100,
            padding: '6px 14px',
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(230,245,255,0.6) 100%)',
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: '0 4px 16px rgba(30, 60, 120, 0.06), inset 1px 1px 0 rgba(255,255,255,0.8)',
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(13, 27, 62, 0.45)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            userSelect: 'none',
            pointerEvents: 'none',
            transition: 'opacity 0.3s ease',
          }}
        >
          HAJIMI PRO
        </div>
      </AntLayout>
    </AntLayout>
  );
}



