import { useState, useRef, useEffect } from 'react';
import { Card, Button, Progress, Tag } from 'antd';
import { ThunderboltOutlined, PlayCircleOutlined, PauseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useGenerative, type GenEnvelope, type GenScenario } from '../../hooks/useGenerative';

const T = 'rgba(13,27,62,';

export default function GenerativePanel() {
  const { t: _t } = useLang();
  const { progress, result, start, stop } = useGenerative();
  const [starting, setStarting] = useState(false);
  const isRunning = progress?.status === 'running';
  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <Card
      className="glass-card"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThunderboltOutlined style={{ fontSize: 18, color: '#7c4dff' }} />
          <span style={{ color: '#0d1b3e', fontWeight: 600 }}>生成式城市模拟 · 100 种可能的未来</span>
          {progress && <Tag color={isRunning ? 'purple' : 'green'}>{isRunning ? '生成中' : '完成'}</Tag>}
        </div>
      }
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {isRunning ? (
          <Button danger icon={<PauseCircleOutlined />} onClick={stop}>停止</Button>
        ) : (
          <Button type="primary" icon={starting ? <LoadingOutlined /> : <PlayCircleOutlined />}
            onClick={async () => { setStarting(true); try { await start(100); } catch {} finally { setStarting(false); } }}
            loading={starting} style={{ background: '#7c4dff', borderColor: '#7c4dff' }}>
            生成 100 个未来情景
          </Button>
        )}
        {result && <Tag color="blue">{result.totalScenarios} scenarios · {result.durationMs}ms</Tag>}
      </div>

      {isRunning && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: `${T}0.45)`, marginBottom: 4 }}>{progress?.completed}/{progress?.total} scenarios</div>
          <Progress percent={pct} showInfo={false} strokeColor="#7c4dff" trailColor={`${T}0.06)`} size="small" />
        </div>
      )}

      {result && <EnvelopeChart envelope={result.envelope} top5={result.top5 || result.scenarios} />}
    </Card>
  );
}

// ─── Canvas envelope chart ────────────────────────────────────

function EnvelopeChart({ envelope, top5 }: { envelope: GenEnvelope[]; top5?: GenScenario[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const safeTop5 = top5 || [];

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    const W = c.parentElement!.clientWidth;
    const H = 260;
    c.width = W * devicePixelRatio; c.height = H * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const w = W, h = H, pad = { t: 20, r: 16, b: 30, l: 44 };

    ctx.clearRect(0, 0, w, h);

    const sx = (i: number) => pad.l + (i / (envelope.length - 1)) * (w - pad.l - pad.r);
    const sy = (v: number, max: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);

    const maxSpeed = Math.max(...envelope.map(e => e.p5_speed), 1);

    // 95% CI band
    ctx.fillStyle = 'rgba(124,77,255,0.08)';
    ctx.beginPath();
    for (let i = 0; i < envelope.length; i++) {
      const x = sx(i), yHi = sy(envelope[i].p95_speed, maxSpeed * 1.1);
      i === 0 ? ctx.moveTo(x, yHi) : ctx.lineTo(x, yHi);
    }
    for (let i = envelope.length - 1; i >= 0; i--) {
      const x = sx(i), yLo = sy(envelope[i].p5_speed, maxSpeed * 1.1);
      ctx.lineTo(x, yLo);
    }
    ctx.closePath(); ctx.fill();

    // P50 line
    ctx.strokeStyle = '#7c4dff'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < envelope.length; i++) {
      const x = sx(i), y = sy(envelope[i].p50_speed, maxSpeed * 1.1);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // P5/P95 dashed
    ctx.strokeStyle = 'rgba(124,77,255,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (const band of ['p5_speed', 'p95_speed'] as const) {
      ctx.beginPath();
      for (let i = 0; i < envelope.length; i++) {
        const x = sx(i), y = sy((envelope[i] as any)[band], maxSpeed * 1.1);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = `${T}0.15)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();

    // Labels
    ctx.fillStyle = `${T}0.4)`; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let v = 0; v <= maxSpeed * 1.1; v += Math.round(maxSpeed * 1.1 / 4)) {
      ctx.fillText(`${v.toFixed(0)}`, pad.l - 4, sy(v, maxSpeed * 1.1) + 3);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i < envelope.length; i += 6) {
      ctx.fillText(`${envelope[i].minute}m`, sx(i), h - pad.b + 14);
    }
    ctx.fillText('未来时间 →', w / 2, h - 4);
    ctx.fillStyle = '#7c4dff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('平均车速 (km/h)', pad.l + 4, pad.t - 4);

    // Legend
    ctx.fillStyle = '#7c4dff'; ctx.fillRect(w - 180, 24, 16, 3);
    ctx.fillStyle = `${T}0.6)`; ctx.textAlign = 'left'; ctx.fillText('中位数 P50', w - 160, 28);
    ctx.fillStyle = 'rgba(124,77,255,0.15)'; ctx.fillRect(w - 180, 36, 16, 10);
    ctx.fillText('95% 置信区间', w - 160, 44);
  }, [envelope]);

  return (
    <div>
      <canvas ref={ref} style={{ width: '100%', height: 260, display: 'block', marginBottom: 10 }} />
      {/* Top 5 scenarios summary */}
      <div style={{ fontSize: 12, color: `${T}0.5)`, marginBottom: 6 }}>最可能的 5 种情景（按终态车速排序）</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, fontSize: 11 }}>
        {safeTop5.map((s: GenScenario, i: number) => (
          <div key={i} style={{ background: `${T}0.03)`, borderRadius: 8, padding: 8, textAlign: 'center', border: `1px solid ${T}0.06)` }}>
            <div style={{ fontWeight: 700, color: i === 0 ? '#7c4dff' : '#0d1b3e' }}>#{i + 1}</div>
            <div style={{ color: `${T}0.5)` }}>{s.finalAvgSpeed.toFixed(1)} km/h</div>
            <div style={{ color: `${T}0.35)`, fontSize: 10 }}>排队 {s.finalQueue}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
