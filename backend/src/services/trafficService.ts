/**
 * 【模块说明】services/trafficService.ts — 交通数据业务服务
 * Module: services/trafficService.ts — Traffic data business service
 *
 * 【功能】维护当前交通状态快照与滑动历史（最大 100 条），
 *         提供信号配时更新与基于车流量的最优绿灯时长计算。
 * Function: Maintains current traffic snapshot and rolling history (max 100),
 *           supports signal timing updates and optimal green-duration calculation
 *           based on vehicle count.
 *
 * 【关键配置】
 *   - history 上限：100 条
 *   - getOptimalTiming 公式：总流量 25 为平衡点，green/red 各 30s，随流量线性偏移
 * Key Configs:
 *   - history limit: 100 items
 *   - getOptimalTiming formula: balance point at flow=25, base 30s each, linear shift
 *
 * 【主要类】TrafficService
 *   - updateData(data)            合并部分更新并刷新时间戳
 *   - getStatus() / getHistory()  获取当前状态 / 历史
 *   - updateSignalTiming(...)     按路口 ID 存储配时方案
 *   - getOptimalTiming(carCount)  返回建议 green/red 秒数
 * Main Class: TrafficService
 *   - updateData(data)            Merge partial update with new timestamp
 *   - getStatus() / getHistory()  Get current state / history
 *   - updateSignalTiming(...)     Store timing plan per intersection ID
 *   - getOptimalTiming(carCount)  Return suggested green/red seconds
 *
 * 【连接关系】
 *   ← 被 routes/traffic.ts 等路由层调用
 *   → 依赖 shared/types.ts 中的 TrafficData 类型定义
 * Connections:
 *   ← Consumed by routes/traffic.ts and other route handlers
 *   → Depends on TrafficData type from shared/types.ts
 */

import type { TrafficData } from '../../../shared/types';

export interface SignalTiming {
  intersectionId: string;
  greenDuration: number;
  redDuration: number;
}

export class TrafficService {
  private currentData: TrafficData = {
    carCount: 0,
    pedestrianCount: 0,
    congestionLevel: 0,
    averageSpeed: 0,
    timestamp: new Date().toISOString(),
  };

  private history: TrafficData[] = [];
  private signalTimings: Map<string, SignalTiming> = new Map();

  updateData(data: Partial<TrafficData>) {
    this.currentData = { ...this.currentData, ...data, timestamp: new Date().toISOString() };
    this.history.push(this.currentData);
    if (this.history.length > 100) this.history.shift();
  }

  getStatus(): TrafficData {
    return this.currentData;
  }

  getHistory(): TrafficData[] {
    return this.history;
  }

  updateSignalTiming(intersectionId: string, greenDuration: number, redDuration: number) {
    this.signalTimings.set(intersectionId, { intersectionId, greenDuration, redDuration });
  }

  getOptimalTiming(carCount: number): { green: number; red: number } {
    const totalFlow = Math.min(carCount, 50);
    const green = Math.max(10, Math.round(30 - (totalFlow - 25) * 0.4));
    const red = Math.max(10, Math.round(30 + (totalFlow - 25) * 0.4));
    return { green, red };
  }
}
