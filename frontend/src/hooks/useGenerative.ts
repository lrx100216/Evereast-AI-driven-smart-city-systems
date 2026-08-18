import { useState, useEffect, useCallback } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';
import { SOCKET_URL } from '../config';
import axios from 'axios';

export interface GenEnvelope {
  minute: number;
  p5_speed: number; p50_speed: number; p95_speed: number;
  p5_queue: number; p50_queue: number; p95_queue: number;
  p5_solar: number; p50_solar: number; p95_solar: number;
}
export interface GenScenario { id: number; seed: number; finalAvgSpeed: number; finalQueue: number; finalSolar: number; finalSoc: number; }
export interface GenResult { timestamp: string; totalScenarios: number; durationMs: number; envelope: GenEnvelope[]; top5: GenScenario[]; scenarios?: GenScenario[]; }

export function useGenerative() {
  const [progress, setProgress] = useState<any>(null);
  const [result, setResult] = useState<GenResult | null>(null);

  useEffect(() => {
    let c = false;
    fetch(`${SOCKET_URL}/api/generative/status`).then(r=>r.json()).then(d=>{if(!c)setProgress(d);}).catch(()=>{});

    const socket = getSharedSocket();
    const onData = (p:any)=>{if(!c){setProgress(p);if(p.result)setResult(p.result);}};
    socket.on('generative:progress', onData);

    return ()=>{c=true; socket.off('generative:progress', onData); releaseSharedSocket();};
  },[]);

  const start = useCallback(async (n=100)=>{await axios.post(`${SOCKET_URL}/api/generative/run`,{scenarios:n});},[]);
  const stop = useCallback(async ()=>{await axios.post(`${SOCKET_URL}/api/generative/stop`);},[]);

  return {progress,result,start,stop};
}
