import { useState, useEffect, useCallback } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';
import { SOCKET_URL } from '../config';
import axios from 'axios';

export interface EpisodeMetrics {
  episode: number;
  totalReward: number;
  avgTravelTime: number;
  avgQueueLength: number;
  avgSpeed: number;
  carbonEstimate: number;
  epsilon: number;
  loss?: number;
  durationMs: number;
}

export type TrainingStatus = 'idle' | 'training' | 'paused' | 'completed' | 'error';
export type SignalMode = 'fixed' | 'marl';

export interface TrainingState {
  status: TrainingStatus;
  mode: SignalMode;
  currentEpisode: number;
  totalEpisodes: number;
  metrics: EpisodeMetrics[];
  agentCount: number;
  elapsedMs: number;
  error?: string;
}

export function useMARL() {
  const [trainingState, setTrainingState] = useState<TrainingState | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Fetch initial state
    fetch(`${SOCKET_URL}/api/marl/train/status`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setTrainingState(d); })
      .catch(() => {});

    const socket = getSharedSocket();
    const onData = (state: TrainingState) => {
      if (!cancelled) setTrainingState(state);
    };

    socket.on('marl:progress', onData);

    return () => {
      cancelled = true;
      socket.off('marl:progress', onData);
      releaseSharedSocket();
    };
  }, []);

  const startTraining = useCallback(async (episodes?: number) => {
    await axios.post(`${SOCKET_URL}/api/marl/train/start`, episodes ? { episodes } : {});
  }, []);

  const stopTraining = useCallback(async () => {
    await axios.post(`${SOCKET_URL}/api/marl/train/stop`);
  }, []);

  const setMode = useCallback(async (mode: SignalMode) => {
    await axios.post(`${SOCKET_URL}/api/marl/mode`, { mode });
  }, []);

  const saveModel = useCallback(async (filename?: string) => {
    const res = await axios.post(`${SOCKET_URL}/api/marl/model/save`, filename ? { filename } : {});
    return res.data;
  }, []);

  const loadModel = useCallback(async (filename: string) => {
    const res = await axios.post(`${SOCKET_URL}/api/marl/model/load`, { filename });
    return res.data;
  }, []);

  return {
    trainingState,
    startTraining,
    stopTraining,
    setMode,
    saveModel,
    loadModel,
  };
}
