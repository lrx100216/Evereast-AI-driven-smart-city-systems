/**
 * 【模块说明】useWeather — 天气数据 Hook
 * Module: useWeather — Weather data hook
 *
 * 【功能】获取深圳地区的实时天气与 7 日预报；若 Open-Meteo API 不可用则自动降级为本地模拟数据
 * Function: Fetches real-time weather and 7-day forecast for Shenzhen; automatically falls back to mock data if the Open-Meteo API is unavailable.
 *
 * 【数据源】
 * Data Sources:
 *   - Open-Meteo API (https://api.open-meteo.com/v1/forecast)
 *   - 坐标固定为深圳：latitude=22.5431, longitude=114.0579
 *
 * 【关键配置】
 * Key Configurations:
 *   - OPEN_METEO_URL    : Open-Meteo 请求地址（含坐标与请求字段）
 *   - MAX_SUNSHINE_SECONDS : 43200 (12h)，用于计算光照强度基准
 *   - 自动刷新间隔      : 5 分钟 (5 minutes auto-refresh interval)
 *
 * 【辅助函数】
 * Helper Functions:
 *   - getSolarFactor()  : 根据深圳当前时间计算太阳因子 0~1（夜间为 0，正午为 1）
 *   - mapWeatherCode()  : 将 Open-Meteo 天气代码映射为 sunny/cloudy/rainy
 *   - generateMockWeather() : 生成模拟天气数据（按季节、昼夜、随机概率）
 *
 * 【返回值】
 * Returns:
 *   - data    : WeatherResult | null — 温度、湿度、天气状况、光照强度、太阳因子、7 日预报
 *   - loading : boolean — 是否正在请求
 *   - error   : string | null — 错误信息
 *   - refetch : () => void — 手动刷新函数
 *
 * 【用法】
 * Usage:
 *   const { data, loading, error, refetch } = useWeather();
 *   // data.temperature, data.humidity, data.forecast[0].max
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface DailyForecast {
  max: number;
  min: number;
  date: string;
}

export interface WeatherResult {
  temperature: number;
  humidity: number;
  weatherCondition: 'sunny' | 'cloudy' | 'rainy' | 'unknown';
  lightIntensity: number;
  solarFactor: number;
  forecast: DailyForecast[];
}

interface UseWeatherReturn {
  data: WeatherResult | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=22.5431&longitude=114.0579' +
  '&current=temperature_2m,relative_humidity_2m,weather_code' +
  '&daily=temperature_2m_max,temperature_2m_min,sunshine_duration' +
  '&timezone=Asia/Shanghai';

const MAX_SUNSHINE_SECONDS = 43200; // 12 hours

/** Solar factor based on Shenzhen current time: 0 (night) ~ 1 (noon) */
function getSolarFactor(): number {
  // Use UTC+8 arithmetic instead of toLocaleString for cross-platform reliability
  const now = new Date();
  const szHour = (now.getUTCHours() + 8) % 24;
  const szMinute = now.getUTCMinutes();
  const hour = szHour + szMinute / 60;
  if (hour >= 6 && hour <= 18) {
    return Math.sin(Math.PI * (hour - 6) / 12);
  }
  return 0;
}

function mapWeatherCode(code: number): WeatherResult['weatherCondition'] {
  if (code === 0) return 'sunny';
  if (code >= 1 && code <= 3) return 'cloudy';
  if (code >= 51 && code <= 99) return 'rainy';
  return 'unknown';
}

// ─── Mock fallback (when Open-Meteo is unreachable) ──────────

function generateMockWeather(): WeatherResult {
  const now = new Date();
  const solarFactor = getSolarFactor();

  // Base temperature by season + diurnal swing
  const month = now.getUTCMonth() + 1;
  const seasonalBase = month >= 5 && month <= 9 ? 29 : month >= 10 && month <= 12 ? 24 : 20;
  const diurnalSwing = solarFactor * 6 - 2; // -2°C at dawn, +4°C at noon
  const temperature = Math.round((seasonalBase + diurnalSwing) * 10) / 10;

  // Humidity: inverse to temperature roughly
  const humidity = Math.min(95, Math.max(40, Math.round(75 - diurnalSwing * 3)));

  // Condition: random but weighted by season
  const roll = Math.random();
  let weatherCondition: WeatherResult['weatherCondition'] = 'sunny';
  if (month >= 4 && month <= 9) {
    // Rainy season
    weatherCondition = roll < 0.45 ? 'sunny' : roll < 0.75 ? 'cloudy' : 'rainy';
  } else {
    weatherCondition = roll < 0.6 ? 'sunny' : roll < 0.85 ? 'cloudy' : 'rainy';
  }

  // Light intensity
  const dailyLightBase = Math.round(0.7 * 1000);
  const lightIntensity = Math.round(dailyLightBase * solarFactor);

  // 7-day forecast
  const forecast: DailyForecast[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    const fSwing = (Math.sin(i * 1.3) + 1) * 2;
    forecast.push({
      date: d.toISOString().split('T')[0],
      max: Math.round((seasonalBase + fSwing) * 10) / 10,
      min: Math.round((seasonalBase + fSwing - 6) * 10) / 10,
    });
  }

  return {
    temperature,
    humidity,
    weatherCondition,
    lightIntensity,
    solarFactor,
    forecast,
  };
}

export function useWeather(): UseWeatherReturn {
  const [data, setData] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchWeather = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      cancelledRef.current = false;

      const res = await fetch(OPEN_METEO_URL);
      if (!res.ok) throw new Error(`Weather API HTTP ${res.status}`);
      const json = await res.json();

      if (cancelledRef.current) return;

      const current = json.current;
      const daily = json.daily;

      const condition = mapWeatherCode(current.weather_code);
      const sunSec = daily.sunshine_duration?.[0] ?? 0;
      const dailyLightBase = Math.round((sunSec / MAX_SUNSHINE_SECONDS) * 1000);
      const solarFactor = getSolarFactor();
      const lightIntensity = Math.round(dailyLightBase * solarFactor);

      const forecast: DailyForecast[] = (daily.time || []).map(
        (date: string, i: number) => ({
          date,
          max: Math.round(daily.temperature_2m_max[i] * 10) / 10,
          min: Math.round(daily.temperature_2m_min[i] * 10) / 10,
        })
      );

      setData({
        temperature: Math.round(current.temperature_2m * 10) / 10,
        humidity: current.relative_humidity_2m,
        weatherCondition: condition,
        lightIntensity,
        solarFactor,
        forecast,
      });
    } catch (e: any) {
      if (!cancelledRef.current) {
        setError(e?.message || 'Failed to fetch weather');
        // Fallback to mock so UI never stays empty
        setData(generateMockWeather());
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 5 * 60 * 1000);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [fetchWeather]);

  return useMemo(() => ({ data, loading, error, refetch: fetchWeather }), [data, loading, error, fetchWeather]);
}
