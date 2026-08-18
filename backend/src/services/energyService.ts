/**
 * 【模块说明】services/energyService.ts — 能源数据业务服务
 * Module: services/energyService.ts — Energy data business service
 *
 * 【功能】维护当前能源状态快照与滑动历史（最大 100 条），
 *         提供太阳能板角度调节，以及基于 SOC 的储能策略建议（充/放/闲置）。
 * Function: Maintains current energy snapshot and rolling history (max 100),
 *           supports solar panel angle adjustment and SOC-based storage
 *           strategy advice (store / release / idle).
 *
 * 【关键配置】
 *   - MAX_HISTORY = 100
 *   - 默认初始状态：batteryLevel=50, panelAngle=90, solarVoltage=0, powerOutput=0
 *   - 储能策略阈值：SOC<20% 且发电>用电 → 充电；SOC>80% 且用电>发电 → 放电
 * Key Configs:
 *   - MAX_HISTORY = 100
 *   - Default initial state: batteryLevel=50, panelAngle=90, solarVoltage=0, powerOutput=0
 *   - Storage thresholds: SOC<20% & generation>consumption → store;
 *                         SOC>80% & consumption>generation → release
 *
 * 【主要类】EnergyService
 *   - updateData(data)            合并部分更新并刷新时间戳
 *   - getStatus() / getHistory()  获取当前状态 / 历史
 *   - setPanelAngle(angle)        限制 0-180° 并更新角度
 *   - getStorageStrategy()        返回 { action, amount } 调度建议
 * Main Class: EnergyService
 *   - updateData(data)            Merge partial update with new timestamp
 *   - getStatus() / getHistory()  Get current state / history
 *   - setPanelAngle(angle)        Clamp to 0-180° and update
 *   - getStorageStrategy()        Return { action, amount } dispatch advice
 *
 * 【连接关系】
 *   ← 被 routes/energy.ts 等路由层调用
 *   → 依赖 shared/types.ts 中的 EnergyData 类型定义
 * Connections:
 *   ← Consumed by routes/energy.ts and other route handlers
 *   → Depends on EnergyData type from shared/types.ts
 */

import type { EnergyData } from '../../../shared/types';

export class EnergyService {
  private currentData: EnergyData = {
    solarVoltage: 0,
    batteryLevel: 50,
    panelAngle: 90,
    powerOutput: 0,
    consumption: 0,
    timestamp: new Date().toISOString(),
  };

  private history: EnergyData[] = [];
  private readonly MAX_HISTORY = 100;

  updateData(data: Partial<EnergyData>) {
    this.currentData = { ...this.currentData, ...data, timestamp: new Date().toISOString() };
    this.history.push(this.currentData);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();
  }

  getStatus(): EnergyData {
    return this.currentData;
  }

  getHistory(): EnergyData[] {
    return this.history;
  }

  setPanelAngle(angle: number) {
    this.currentData.panelAngle = Math.max(0, Math.min(180, angle));
  }

  getStorageStrategy(): { action: 'store' | 'release' | 'idle'; amount: number } {
    const { batteryLevel, powerOutput, consumption } = this.currentData;
    if (batteryLevel < 20 && powerOutput > consumption) {
      return { action: 'store', amount: powerOutput - consumption };
    }
    if (batteryLevel > 80 && consumption > powerOutput) {
      return { action: 'release', amount: Math.min(consumption - powerOutput, batteryLevel - 80) };
    }
    return { action: 'idle', amount: 0 };
  }
}
