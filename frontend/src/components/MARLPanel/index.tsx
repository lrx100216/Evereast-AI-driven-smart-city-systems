import { useState } from 'react';
import { Card, Button, Tag, Switch, Popconfirm, message } from 'antd';
import {
  RobotOutlined, PlayCircleOutlined, PauseCircleOutlined,
  SaveOutlined, FolderOpenOutlined, ThunderboltOutlined,
  ClockCircleOutlined, DashboardOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { useLang } from '../../i18n/LanguageContext';
import { useMARL } from '../../hooks/useMARL';

const T = 'rgba(13,27,62,';

const STATUS_COLORS: Record<string, string> = {
  idle: '#8c8c8c', training: '#1890ff', paused: '#faad14', completed: '#52c41a', error: '#ff4d4f',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  const secs = Math.floor((ms % 60000) / 1000);
  return `${Math.floor(ms / 60000)}m ${secs}s`;
}

function MetricRow({ label, value, suffix = '' }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: `${T}0.45)` }}>{label}</span>
      <span style={{ color: '#0d1b3e', fontWeight: 600, fontFamily: 'monospace' }}>
        {typeof value === 'number' ? value.toFixed(2) : value}{suffix}
      </span>
    </div>
  );
}

export default function MARLPanel() {
  const { t } = useLang();
  const marlT = t.marl as Record<string, string>;
  const { trainingState, startTraining, stopTraining, setMode, saveModel, loadModel } = useMARL();
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelList, setModelList] = useState<{ filename: string; size: number; modified: string }[]>([]);
  const [showLoad, setShowLoad] = useState(false);

  const isTraining = trainingState?.status === 'training';
  const isMARL = trainingState?.mode === 'marl';
  const lastMetrics = trainingState?.metrics?.[trainingState.metrics.length - 1];
  const progress = trainingState ? Math.round((trainingState.currentEpisode / trainingState.totalEpisodes) * 100) : 0;
  const completedMetrics = trainingState?.metrics?.filter(m => m.durationMs > 0) || [];
  const avgMsPerEpisode = completedMetrics.length > 0
    ? completedMetrics.reduce((s, m) => s + m.durationMs, 0) / completedMetrics.length : 0;
  const remainingEpisodes = trainingState ? trainingState.totalEpisodes - trainingState.currentEpisode : 0;
  const estimatedRemainingMs = avgMsPerEpisode > 0 ? avgMsPerEpisode * remainingEpisodes : 0;
  const elapsedMs = trainingState?.elapsedMs || 0;

  const handleStart = async () => {
    setStarting(true);
    try { await startTraining(); message.success('Training started'); }
    catch (err: any) { message.error(err?.response?.data?.error || err?.message || 'Failed'); }
    finally { setStarting(false); }
  };
  const handleStop = async () => { try { await stopTraining(); message.info('Training stopped'); } catch { message.error('Failed'); } };
  const handleSave = async () => {
    setSaving(true);
    try { const r = await saveModel(); message.success(`Saved: ${r?.filename || 'OK'}`); }
    catch { message.error('Failed to save'); }
    finally { setSaving(false); }
  };
  const handleLoadList = async () => {
    try { const r = await fetch('http://localhost:3001/api/marl/model/list'); const d = await r.json(); setModelList(d.models || []); setShowLoad(!showLoad); }
    catch { message.error('Failed'); }
  };
  const handleLoad = async (filename: string) => {
    try { await loadModel(filename); setShowLoad(false); message.success(`Loaded: ${filename}`); }
    catch { message.error('Failed'); }
  };

  return (
    <Card
      className="glass-card"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RobotOutlined style={{ fontSize: 18, color: '#66bb6a' }} />
          <span style={{ color: '#0d1b3e', fontWeight: 600 }}>{marlT.title}</span>
          {trainingState && (
            <Tag color={STATUS_COLORS[trainingState.status]}>
              {marlT[trainingState.status] || trainingState.status}
            </Tag>
          )}
        </div>
      }
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* Mode Switch */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: `${T}0.5)`, fontSize: 13 }}>
          {isMARL ? marlT.modeMARL : marlT.modeFixed}
        </span>
        <Switch checked={isMARL} checkedChildren={<ThunderboltOutlined />} unCheckedChildren={<ClockCircleOutlined />}
          onChange={(c) => setMode(c ? 'marl' : 'fixed')} disabled={isTraining} />
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {isTraining ? (
          <Popconfirm title={marlT.confirmStop} onConfirm={handleStop} okText="Yes" cancelText="No">
            <Button danger icon={<PauseCircleOutlined />} style={{ flex: 1 }}>{marlT.stopTraining}</Button>
          </Popconfirm>
        ) : (
          <Button type="primary" icon={starting ? <LoadingOutlined /> : <PlayCircleOutlined />}
            onClick={handleStart} loading={starting}
            style={{ flex: 1, background: '#66bb6a', borderColor: '#66bb6a' }}>
            {starting ? 'Starting...' : marlT.startTraining}
          </Button>
        )}
        <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}
          disabled={isTraining || !trainingState?.metrics?.length}>{marlT.saveModel}</Button>
        <Button icon={<FolderOpenOutlined />} onClick={handleLoadList}>{marlT.loadModel}</Button>
      </div>

      {/* Model List */}
      {showLoad && (
        <div style={{ marginBottom: 16, maxHeight: 120, overflowY: 'auto' }}>
          {modelList.length === 0 ? (
            <div style={{ color: `${T}0.25)`, fontSize: 12, textAlign: 'center', padding: 8 }}>{marlT.noModel}</div>
          ) : modelList.map(m => (
            <div key={m.filename} onClick={() => handleLoad(m.filename)}
              style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 12,
                color: `${T}0.6)`, background: `${T}0.03)`, marginBottom: 4,
                display: 'flex', justifyContent: 'space-between' }}>
              <span>{m.filename}</span>
              <span style={{ color: `${T}0.3)` }}>{new Date(m.modified).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Training Progress */}
      {isTraining && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 13, color: `${T}0.5)` }}>{marlT.episode}</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#0d1b3e', fontFamily: 'monospace', lineHeight: 1 }}>
                {trainingState?.currentEpisode}
              </span>
              <span style={{ fontSize: 15, color: `${T}0.3)`, fontFamily: 'monospace' }}>
                / {trainingState?.totalEpisodes}
              </span>
            </div>
            {/* Circular percentage */}
            <div style={{
              width: 62, height: 62, borderRadius: '50%',
              background: `conic-gradient(#66bb6a ${progress * 3.6}deg, ${T}0.06) 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 18px rgba(102,187,106,${0.1 + progress / 300})`,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#2e7d32', fontFamily: 'monospace' }}>
                  {progress}%
                </span>
              </div>
            </div>
          </div>

          {/* Gradient progress bar */}
          <div style={{
            height: 6, borderRadius: 3, background: `${T}0.06)`, overflow: 'hidden', marginBottom: 12,
          }}>
            <div style={{
              height: '100%', width: `${progress}%`, borderRadius: 3,
              background: 'linear-gradient(90deg, #43a047, #66bb6a, #81c784)',
              transition: 'width 0.5s ease',
            }} />
          </div>

          {/* Time cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { icon: '⏱', label: '已用时间', color: '#0277bd', value: formatDuration(elapsedMs) },
              { icon: '⚡', label: '单轮平均', color: '#e65100', value: avgMsPerEpisode > 0 ? formatDuration(avgMsPerEpisode) : '—' },
              { icon: '🏁', label: '预计剩余', color: '#2e7d32', value: estimatedRemainingMs > 0 ? formatDuration(estimatedRemainingMs) : '—' },
            ].map(c => (
              <div key={c.label} style={{
                background: `${T}0.03)`, borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                border: `1px solid ${T}0.06)`,
              }}>
                <div style={{ fontSize: 16, marginBottom: 3 }}>{c.icon}</div>
                <div style={{ fontSize: 10, color: `${T}0.35)`, marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.color, fontFamily: 'monospace' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {lastMetrics && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 22, fontSize: 11, color: `${T}0.3)` }}>
              <span>ε={lastMetrics.epsilon.toFixed(3)}</span>
              {lastMetrics.loss !== undefined && <span>loss={lastMetrics.loss.toFixed(4)}</span>}
              <span>{lastMetrics.avgSpeed.toFixed(1)} km/h</span>
            </div>
          )}
        </div>
      )}

      {/* Completed summary */}
      {!isTraining && trainingState && completedMetrics.length > 0 && (
        <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: `${T}0.03)`, borderRadius: 10, padding: 12, textAlign: 'center', border: `1px solid ${T}0.06)` }}>
            <div style={{ fontSize: 10, color: `${T}0.35)`, marginBottom: 4 }}>总用时</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2e7d32', fontFamily: 'monospace' }}>{formatDuration(elapsedMs)}</div>
          </div>
          <div style={{ background: `${T}0.03)`, borderRadius: 10, padding: 12, textAlign: 'center', border: `1px solid ${T}0.06)` }}>
            <div style={{ fontSize: 10, color: `${T}0.35)`, marginBottom: 4 }}>完成回合</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0277bd', fontFamily: 'monospace' }}>
              {completedMetrics.length}<span style={{ fontSize: 12, fontWeight: 400, color: `${T}0.3)` }}> / {trainingState.totalEpisodes}</span>
            </div>
          </div>
        </div>
      )}

      {/* Latest Metrics */}
      {lastMetrics && (
        <div style={{
          background: `${T}0.03)`, borderRadius: 12, padding: '14px 16px',
          border: `1px solid ${T}0.06)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1b3e' }}>
              {marlT.episode} <span style={{ color: '#2e7d32', fontFamily: 'monospace' }}>#{lastMetrics.episode}</span>
            </div>
            <Tag color="green" style={{ margin: 0, fontSize: 11 }}>⏱ {formatDuration(lastMetrics.durationMs)}</Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px' }}>
            <MetricRow label={marlT.totalReward} value={lastMetrics.totalReward} />
            <MetricRow label={marlT.avgTravelTime} value={lastMetrics.avgTravelTime} suffix="s" />
            <MetricRow label={marlT.avgQueue} value={lastMetrics.avgQueueLength} suffix=" veh" />
            <MetricRow label={marlT.avgSpeed} value={lastMetrics.avgSpeed} suffix="km/h" />
            <MetricRow label={marlT.carbon} value={lastMetrics.carbonEstimate} suffix="kg" />
            <MetricRow label={marlT.epsilon} value={lastMetrics.epsilon} />
          </div>
          {lastMetrics.loss !== undefined && (
            <div style={{ fontSize: 11, color: `${T}0.3)`, textAlign: 'right', marginTop: 4 }}>
              loss: {lastMetrics.loss.toFixed(4)}
            </div>
          )}
        </div>
      )}

      {trainingState && trainingState.agentCount > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: `${T}0.3)`, textAlign: 'center' }}>
          <DashboardOutlined style={{ marginRight: 4 }} />
          {marlT.agents}: {trainingState.agentCount}
        </div>
      )}
    </Card>
  );
}
