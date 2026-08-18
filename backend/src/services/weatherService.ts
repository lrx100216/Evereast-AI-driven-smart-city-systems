/**
 * 【模块说明】services/weatherService.ts — 天气数据业务服务
 * Module: services/weatherService.ts — Weather data business service
 *
 * 【功能】维护当前天气状态快照与滑动历史（最大 100 条），
 *         提供基于天气状况和光照强度的太阳能发电效率预测。
 * Function: Maintains current weather snapshot and rolling history (max 100),
 *           provides solar-efficiency prediction based on weather condition
 *           and light intensity.
 *
 * 【关键配置】
 *   - MAX_HISTORY = 100
 *   - 默认天气：temperature=25, humidity=60, lightIntensity=500, weatherCondition='unknown'
 *   - 天气因子：sunny=1.0, cloudy=0.5, rainy=0.2, unknown=0.6
 * Key Configs:
 *   - MAX_HISTORY = 100
 *   - Default weather: temperature=25, humidity=60, lightIntensity=500, weatherCondition='unknown'
 *   - Weather factors: sunny=1.0, cloudy=0.5, rainy=0.2, unknown=0.6
 *
 * 【主要类】WeatherService
 *   - updateData(data)            合并部分更新并刷新时间戳
 *   - getCurrent() / getHistory() 获取当前天气 / 历史
 *   - predictSolarEfficiency()    返回 0-1 之间的发电效率估算值
 * Main Class: WeatherService
 *   - updateData(data)            Merge partial update with new timestamp
 *   - getCurrent() / getHistory() Get current weather / history
 *   - predictSolarEfficiency()    Return estimated generation efficiency (0-1)
 *
 * 【连接关系】
 *   ← 被 routes/weather.ts 等路由层调用
 *   → 依赖 shared/types.ts 中的 WeatherData 类型定义
 *   → 预测结果被能源模块用于估算光伏发电量
 * Connections:
 *   ← Consumed by routes/weather.ts and other route handlers
 *   → Depends on WeatherData type from shared/types.ts
 *   → Prediction results used by energy modules to estimate PV output
 */

import type { WeatherData } from '../../../shared/types';

export class WeatherService {
  private currentData: WeatherData = {
    temperature: 25,
    humidity: 60,
    lightIntensity: 500,
    weatherCondition: 'unknown',
    timestamp: new Date().toISOString(),
  };

  private history: WeatherData[] = [];
  private readonly MAX_HISTORY = 100;

  updateData(data: Partial<WeatherData>) {
    this.currentData = { ...this.currentData, ...data, timestamp: new Date().toISOString() };
    this.history.push(this.currentData);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();
  }

  getCurrent(): WeatherData {
    return this.currentData;
  }

  getHistory(): WeatherData[] {
    return this.history;
  }

  predictSolarEfficiency(): number {
    const { weatherCondition, lightIntensity } = this.currentData;
    const baseEfficiency = lightIntensity / 1000;
    const weatherFactor: Record<string, number> = {
      sunny: 1.0, cloudy: 0.5, rainy: 0.2, unknown: 0.6,
    };
    return baseEfficiency * (weatherFactor[weatherCondition] || 0.6);
  }
}
