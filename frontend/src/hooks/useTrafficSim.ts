/**
 * 【模块说明】useTrafficSim — 交通模拟数据 Hook
 * Module: useTrafficSim — Traffic simulation data hook
 *
 * 【功能】获取并实时订阅交通仿真数据，包括路口车道、信号灯、行人计数等信息
 * Function: Fetches and subscribes to real-time traffic simulation data, including intersection lanes, signals, and pedestrian counts.
 *
 * 【数据源】
 * Data Sources:
 *   1. REST API: GET /api/traffic-sim/snapshot 获取初始快照
 *   2. Socket.IO 事件: traffic:sim 接收实时推流更新
 *
 * 【导出的类型】
 * Exported Types:
 *   - LaneData      : 单条车道数据（方向、车辆数、平均速度、拥堵等级）
 *   - SignalState   : 信号灯状态（是否绿灯、剩余秒数）
 *   - IntersectionData : 单个路口完整数据
 *   - ZoneData      : 区域数据（包含多个路口）
 *   - TrafficSimData: 整个仿真系统顶层数据结构
 *
 * 【用法】
 * Usage:
 *   const { data, error } = useTrafficSim();
 *   // data.zones[0].intersections[0].lanes 访问车道信息
 *
 * 【注意】组件卸载时会自动清理 Socket 监听并释放连接引用
 * Note: Automatically cleans up Socket listeners and releases connection references on unmount.
 */

import { useState, useEffect, useMemo } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';

export interface LaneData {
  direction: 'N' | 'S' | 'E' | 'W';
  carCount: number;
  avgSpeed: number;
  congestionLevel: number;
}

export interface SignalState {
  green: boolean;
  remaining: number;
}

export interface IntersectionData {
  id: string;
  name: string;
  lanes: LaneData[];
  signals: {
    N: SignalState;
    S: SignalState;
    E: SignalState;
    W: SignalState;
  };
  pedestrianCount: number;
}

export interface ZoneData {
  id: string;
  name: string;
  nameZh: string;
  type: string;
  intersections: IntersectionData[];
}

export interface TrafficSimData {
  timestamp: string;
  simTime: string;
  simHour: number;
  simMinute: number;
  isRushHour: boolean;
  timeOfDay: string;
  zones: ZoneData[];
}

import { SOCKET_URL } from '../config';

export function useTrafficSim() {
  const [data, setData] = useState<TrafficSimData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${SOCKET_URL}/api/traffic-sim/snapshot`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) { setData(d); setError(null); }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });

    const socket = getSharedSocket();
    const onConnect = () => setError(null);
    const onData = (snapshot: TrafficSimData) => {
      if (!cancelled) { setData(snapshot); setError(null); }
    };
    const onError = () => {
      if (!cancelled) setError('connect_error');
    };

    socket.on('connect', onConnect);
    socket.on('traffic:sim', onData);
    socket.on('connect_error', onError);

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('traffic:sim', onData);
      socket.off('connect_error', onError);
      releaseSharedSocket();
    };
  }, []);

  return useMemo(() => ({ data, error }), [data, error]);
}
