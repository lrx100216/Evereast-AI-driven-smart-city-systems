// 全局状态存储 —— 简单的内存 map，存最新数据和历史记录
// 各个模块都能读写，有点全局变量的味道，但项目不大先凑合
// MAX_HISTORY 设了 200，多了就 slice，防内存泄漏
//
// 如需增加新字段，修改 shared/types.ts 中的 TrafficData/EnergyData/WeatherData 类型，
// 并同步更新本文件默认值。

import type { TrafficData, EnergyData, WeatherData } from '../../shared/types';

// ─── Store ─────────────────────────────────────────────────

const trafficHistory: TrafficData[] = [];
const energyHistory: EnergyData[] = [];
const weatherHistory: WeatherData[] = [];
const MAX_HISTORY = 200;

const store = {
  traffic: {
    carCount: 12,
    pedestrianCount: 5,
    congestionLevel: 45,
    averageSpeed: 32,
    timestamp: new Date().toISOString(),
  } as TrafficData,

  energy: {
    solarVoltage: 4.2,
    batteryLevel: 67,
    panelAngle: 90,
    powerOutput: 3.4,
    consumption: 1.2,
    timestamp: new Date().toISOString(),
  } as EnergyData,

  weather: {
    temperature: 26.5,
    humidity: 62,
    lightIntensity: 750,
    weatherCondition: 'sunny',
    timestamp: new Date().toISOString(),
  } as WeatherData,
};

// ─── Mutators ──────────────────────────────────────────────

export function updateTraffic(data: Partial<TrafficData>) {
  store.traffic = { ...store.traffic, ...data, timestamp: new Date().toISOString() };
  trafficHistory.push(store.traffic);
  if (trafficHistory.length > MAX_HISTORY) trafficHistory.shift();
}

export function updateEnergy(data: Partial<EnergyData>) {
  store.energy = { ...store.energy, ...data, timestamp: new Date().toISOString() };
  energyHistory.push(store.energy);
  if (energyHistory.length > MAX_HISTORY) energyHistory.shift();
}

export function updateWeather(data: Partial<WeatherData>) {
  store.weather = { ...store.weather, ...data, timestamp: new Date().toISOString() };
  weatherHistory.push(store.weather);
  if (weatherHistory.length > MAX_HISTORY) weatherHistory.shift();
}

// ─── Getters ───────────────────────────────────────────────

export function getStore() {
  return { ...store };
}

export function getTrafficHistory() {
  return [...trafficHistory];
}

export function getEnergyHistory() {
  return [...energyHistory];
}

export function getWeatherHistory() {
  return [...weatherHistory];
}
