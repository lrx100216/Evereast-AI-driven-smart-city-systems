import { useState, useEffect, useCallback } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';
import { SOCKET_URL } from '../config';
import axios from 'axios';

export interface FLRoundMetrics {
  round: number; avgLoss: number; epsilon: number; participatedZones: number;
}
export interface FLProgress {
  status: 'idle' | 'training' | 'completed' | 'error';
  currentRound: number; totalRounds: number;
  epsilon: number; noiseMultiplier: number;
  metrics: FLRoundMetrics[]; zoneCount: number;
  elapsedMs: number; error?: string;
}

export function useFederated() {
  const [progress, setProgress] = useState<FLProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${SOCKET_URL}/api/federated/status`).then(r => r.json()).then(d => {
      if (!cancelled && d.status) setProgress({
        status: d.status, epsilon: d.privacy?.epsilon ?? 0,
        noiseMultiplier: d.privacy?.noiseMultiplier ?? 1,
        metrics: [], currentRound: 0, totalRounds: d.config?.rounds || 50,
        zoneCount: 5, elapsedMs: 0,
      });
    }).catch(() => {});

    const socket = getSharedSocket();
    const onData = (p: FLProgress) => { if (!cancelled) setProgress(p); };
    socket.on('federated:progress', onData);

    return () => {
      cancelled = true;
      socket.off('federated:progress', onData);
      releaseSharedSocket();
    };
  }, []);

  const startTraining = useCallback(async (rounds?: number) => {
    await axios.post(`${SOCKET_URL}/api/federated/train/start`, rounds ? { rounds } : {});
  }, []);
  const stopTraining = useCallback(async () => {
    await axios.post(`${SOCKET_URL}/api/federated/train/stop`);
  }, []);
  const setNoise = useCallback(async (nm: number) => {
    await axios.post(`${SOCKET_URL}/api/federated/privacy`, { noiseMultiplier: nm });
  }, []);

  return { progress, startTraining, stopTraining, setNoise };
}
