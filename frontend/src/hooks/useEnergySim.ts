/**
 * useEnergySim — Energy simulation real-time data hook
 *
 * Fetches initial snapshot via REST, then subscribes to Socket.IO push updates.
 * Reconnects automatically and re-fetches on reconnect to prevent stale data.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';
import { API_URL } from '../config';

export interface EnergySimData {
  timestamp: string;
  simTime: string;
  simHour: number;
  simMinute: number;
  zones: {
    id: string; name: string; nameZh: string; type: string;
    load: number; baseLoad: number; hourlyFactor: number;
  }[];
  plants: {
    id: string; name: string; nameZh: string; type: string;
    capacity: number; output: number; online: boolean;
  }[];
  battery: {
    soc: number; capacity: number;
    chargePower: number; maxChargeRate: number; maxDischargeRate: number;
  };
  grid: {
    price: number; peakType: 'valley' | 'shoulder' | 'peak';
    totalLoad: number; totalSupply: number; gridImport: number; gridExport: number;
  };
  lyapunov: {
    Q: number; V: number; dynamicV: number; targetSOC: number;
    drift: number; penalty: number; driftPlusPenalty: number; actionCount: number;
  };
  fsm: { state: string; reason: string };
  buildingLights: number;
  history: { simTime: string; soc: number; price: number; gridImport: number; chargePower: number; totalLoad: number }[];
  carbon: { totalKg: number; intensity: number; avoidedKg: number };
}

interface UseEnergySimReturn {
  data: EnergySimData | null;
  loading: boolean;
  error: string | null;
}

export function useEnergySim(): UseEnergySimReturn {
  const [data, setData] = useState<EnergySimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<EnergySimData | null>(null);
  const retries = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const MAX_RETRIES = 3;

    // Initial fetch — only used as fallback before first Socket.IO event
    async function fetchInitial() {
      try {
        const r = await fetch(`${API_URL}/energy-sim/snapshot`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: EnergySimData = await r.json();
        // Guard: don't overwrite fresher Socket.IO data with stale REST data
        if (!cancelled && !dataRef.current) {
          setData(d);
          dataRef.current = d;
          setLoading(false);
          setError(null);
          retries.current = 0;
        }
      } catch {
        if (!cancelled && !dataRef.current && retries.current < MAX_RETRIES) {
          retries.current++;
          setTimeout(fetchInitial, 2000);
        } else if (!cancelled && !dataRef.current) {
          setLoading(false);
          setError('Unable to connect to backend');
        }
      }
    }

    fetchInitial();

    // Socket.IO real-time updates
    const socket = getSharedSocket();

    const onConnect = () => {
      // Re-fetch on reconnect to ensure fresh data
      if (!cancelled && retries.current > 0) {
        retries.current = 0;
        fetchInitial();
      }
    };

    const onData = (snapshot: EnergySimData) => {
      if (!cancelled) {
        setData(snapshot);
        dataRef.current = snapshot;
        setLoading(false);
        setError(null);
      }
    };

    const onConnectError = () => {
      if (!cancelled && !dataRef.current) {
        setError('Connection failed — retrying...');
      }
    };

    const onDisconnect = () => {
      if (!cancelled) {
        setError('Disconnected — reconnecting...');
      }
    };

    socket.on('energy:sim', onData);
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);

    return () => {
      cancelled = true;
      socket.off('energy:sim', onData);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      releaseSharedSocket();
    };
  }, []);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
