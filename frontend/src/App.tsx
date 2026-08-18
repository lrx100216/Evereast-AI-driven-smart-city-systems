// App root —— routing + layout + language + premium light theme

import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { LangProvider } from './i18n/LanguageContext';
import ParticleBackground from './components/ParticleBackground';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import About from './pages/About';
import Traffic from './pages/Traffic';
import Energy from './pages/Energy';
import Weather from './pages/Weather';
import Cesium3D from './pages/Cesium3D';
import AIInsights from './pages/AIInsights';

const theme = {
  token: {
    colorPrimary: '#4fc3f7',
    colorSuccess: '#66bb6a',
    borderRadius: 12,
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
  },
};

function App() {
  const followerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = followerRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      el.style.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`);
      el.style.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <ConfigProvider theme={theme}>
      <LangProvider>
        <BrowserRouter>
          {/* Particle canvas */}
          <ParticleBackground />

          {/* Floating colored blobs for glass depth */}
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <div className="blob blob-4" />

          {/* Mouse follower — ref-driven, no re-render */}
          <div ref={followerRef} className="mouse-follower" />

          {/* Main content layer */}
          <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            {/* Base background — textured for backdrop-filter depth */}
            <div style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              background: `
                radial-gradient(ellipse 600px 400px at 15% 20%, rgba(79,195,247,0.18) 0%, transparent 60%),
                radial-gradient(ellipse 500px 350px at 85% 80%, rgba(102,187,106,0.12) 0%, transparent 60%),
                radial-gradient(ellipse 400px 300px at 50% 50%, rgba(255,167,38,0.08) 0%, transparent 50%),
                radial-gradient(ellipse 300px 250px at 75% 15%, rgba(206,147,216,0.10) 0%, transparent 50%),
                linear-gradient(145deg, #e3f0ff 0%, #e8f5fe 50%, #f0f4ff 100%)
              `,
              zIndex: -2,
            }} />
            <Layout>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/traffic" element={<Traffic />} />
                  <Route path="/energy" element={<Energy />} />
                  <Route path="/weather" element={<Weather />} />
                  <Route path="/cesium" element={<Cesium3D />} />
                  <Route path="/ai-insights" element={<AIInsights />} />
                </Routes>
              </ErrorBoundary>
            </Layout>
          </div>
        </BrowserRouter>
      </LangProvider>
    </ConfigProvider>
  );
}

export default App;
