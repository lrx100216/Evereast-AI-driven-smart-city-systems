import { useState, useEffect, useCallback } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';
import { SOCKET_URL } from '../config';
import axios from 'axios';

export interface MetricEffect {
  metric: string;
  label: string;
  labelZh: string;
  unit: string;
  controlMean: number;
  treatmentMean: number;
  ate: number;
  relativeChange: number;
  standardError: number;
  ci95Lower: number;
  ci95Upper: number;
  pValue: number;
  significant: boolean;
}

export interface WhatIfResult {
  id: string;
  scenario: any;
  timestamp: string;
  runs: number;
  durationMs: number;
  metrics: MetricEffect[];
}

export interface WhatIfProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  scenarioId: string;
  completedRuns: number;
  totalRuns: number;
  elapsedMs: number;
  result?: WhatIfResult;
  error?: string;
}

export interface ScenarioDef {
  id: string;
  type: string;
  label: string;
  labelZh: string;
  description: string;
  descriptionZh: string;
  target: 'traffic' | 'energy';
  durationMinutes: number;
}

export function useWhatIf() {
  const [progress, setProgress] = useState<WhatIfProgress | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioDef[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch(`${SOCKET_URL}/api/whatif/scenarios`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setScenarios(d.scenarios || []); })
      .catch(() => {});

    fetch(`${SOCKET_URL}/api/whatif/status`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.status) setProgress(d); })
      .catch(() => {});

    const socket = getSharedSocket();
    const onProgress = (p: WhatIfProgress) => {
      if (!cancelled) setProgress(p);
    };
    socket.on('whatif:progress', onProgress);

    return () => {
      cancelled = true;
      socket.off('whatif:progress', onProgress);
      releaseSharedSocket();
    };
  }, []);

  const startRun = useCallback(async (scenarioId: string, runs = 100) => {
    const res = await axios.post(`${SOCKET_URL}/api/whatif/run`, { scenarioId, runs });
    return res.data;
  }, []);

  const stopRun = useCallback(async () => {
    await axios.post(`${SOCKET_URL}/api/whatif/stop`);
  }, []);

  return { progress, scenarios, startRun, stopRun };
}
