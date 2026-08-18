import { trafficSim } from './trafficSimulation';
import { energySim } from './energySimulation';

// ─── Types ────────────────────────────────────────────────

export interface AIAdvice {
  timestamp: string;
  cached: boolean;
  /** 'api' = from DeepSeek, 'mock' = local heuristic fallback, 'cache' = served from 15s cache */
  source: 'api' | 'mock' | 'cache';
  traffic: TrafficAdvice | null;
  energy: EnergyAdvice | null;
  overall: string;
}

export interface TrafficAdvice {
  greenDuration: number;
  redDuration: number;
  reasoning: string;
}

export interface EnergyAdvice {
  strategy: 'store' | 'release' | 'idle';
  panelAngle: number;
  reasoning: string;
}

// ─── Mock mode (uses REAL simulation data) ──────────────────

function generateMockAdvice(): AIAdvice {
  // Read from the simulation engines, not the static store!
  const trafSnap = trafficSim.getCurrentSnapshot();
  const energySnap = energySim.getCurrentSnapshot();

  // Aggregate traffic data from all intersections (with safety fallback)
  let totalVehicles = 0;
  let totalCongestion = 0;
  let laneCount = 0;
  if (trafSnap?.zones) {
    for (const zone of trafSnap.zones) {
      if (!zone?.intersections) continue;
      for (const isec of zone.intersections) {
        if (!isec?.lanes) continue;
        for (const lane of isec.lanes) {
          totalVehicles += lane.carCount ?? 0;
          totalCongestion += lane.congestionRate ?? 0;
          laneCount++;
        }
      }
    }
  }
  const avgCongestion = laneCount > 0
    ? Math.round(totalCongestion / laneCount)
    : 45;

  const batterySoc = energySnap.battery.soc;
  const chargePower = energySnap.battery.chargePower;
  const gridPrice = energySnap.grid.price;
  const peakType = energySnap.grid.peakType;

  // Traffic advice based on real congestion
  const green = Math.max(10, Math.min(60, Math.round(25 + avgCongestion * 0.5)));
  const red = Math.max(10, Math.min(60, Math.round(35 - avgCongestion * 0.35)));

  // Energy advice based on real battery + pricing
  let strategy: 'store' | 'release' | 'idle' = 'idle';
  if (peakType === 'valley' && batterySoc < 80) {
    strategy = 'store';
  } else if (peakType === 'peak' && batterySoc > 25) {
    strategy = 'release';
  } else if (chargePower > 10) {
    strategy = 'store';
  } else if (chargePower < -10) {
    strategy = 'release';
  }

  // Optimal solar panel angle based on sim hour
  const hour = energySnap.simHour;
  const panelAngle = Math.round(30 + 60 * Math.sin(Math.PI * (hour - 6) / 12));

  return {
    timestamp: new Date().toISOString(),
    cached: false,
    source: 'mock',
    traffic: {
      greenDuration: green,
      redDuration: red,
      reasoning: avgCongestion > 65
        ? `拥堵指数 ${avgCongestion}%，全市 ${totalVehicles} 辆车在网，建议延长绿灯至 ${green}s。`
        : avgCongestion > 35
        ? `路网轻度拥堵 (${avgCongestion}%)，${totalVehicles} 辆车在线，信号优化中。`
        : `路网畅通 (${avgCongestion}%)，${totalVehicles} 辆车在线，保持当前配时。`,
    },
    energy: {
      strategy,
      panelAngle,
      reasoning: strategy === 'store'
        ? `电池 ${batterySoc.toFixed(0)}%，当前${peakType === 'valley' ? '谷电' : '平电'} ¥${gridPrice}/kWh，建议充电储能。`
        : strategy === 'release'
        ? `电池 ${batterySoc.toFixed(0)}%，当前${peakType === 'peak' ? '峰电' : '平电'} ¥${gridPrice}/kWh，建议放电获利。`
        : `电池 ${batterySoc.toFixed(0)}%，系统平衡，维持当前策略。`,
    },
    overall: avgCongestion > 70
      ? `⚠️ 城市拥堵指数 ${avgCongestion}%，${totalVehicles} 辆车在网，建议关注交通信号优化。`
      : batterySoc < 15
      ? `⚠️ 电池储量仅 ${batterySoc.toFixed(0)}%，峰电时段注意储备。`
      : batterySoc > 90
      ? `✅ 电池接近满充 (${batterySoc.toFixed(0)}%)，可考虑放电收益。`
      : `✅ 城市运行正常，拥堵 ${avgCongestion}%，电池 ${batterySoc.toFixed(0)}%，电网 ${peakType === 'peak' ? '峰电' : peakType === 'valley' ? '谷电' : '平电'} ¥${gridPrice}/kWh。`,
  };
}

// ─── AI Service ────────────────────────────────────────────

let cachedAdvice: AIAdvice | null = null;
let lastFetch = 0;
const CACHE_TTL = 15_000;

// Lazy singleton OpenAI client to avoid recreating on every call
let openaiClient: { chat: { completions: { create: (params: unknown) => Promise<unknown> } } } | null = null;

async function getOpenAIClient() {
  if (!openaiClient) {
    const { default: OpenAI } = await import('openai');
    openaiClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    });
  }
  return openaiClient;
}

export async function getAIAdvice(): Promise<AIAdvice> {
  const now = Date.now();

  if (cachedAdvice && now - lastFetch < CACHE_TTL) {
    return { ...cachedAdvice, cached: true, source: 'cache' };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    cachedAdvice = generateMockAdvice();
    lastFetch = now;
    return { ...cachedAdvice!, cached: false };
  }

  // ── DeepSeek API call (OpenAI-compatible) ──
  try {
    // Read real-time data from simulation engines
    const trafSnap = trafficSim.getCurrentSnapshot();
    const energySnap = energySim.getCurrentSnapshot();
    let totalVeh = 0; let totalCong = 0; let laneN = 0;
    if (trafSnap?.zones) {
      for (const z of trafSnap.zones) {
        if (!z?.intersections) continue;
        for (const i of z.intersections) {
          if (!i?.lanes) continue;
          for (const l of i.lanes) {
            totalVeh += l.carCount ?? 0;
            totalCong += l.congestionRate ?? 0;
            laneN++;
          }
        }
      }
    }
    const avgCong = laneN > 0 ? Math.round(totalCong / laneN) : 45;
    const soc = energySnap?.battery?.soc ?? 55;
    const price = energySnap?.grid?.price ?? 0.7;

    const client = await getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: '你是一个智慧城市AI调度专家。根据实时传感器数据给出可操作的优化建议，必须返回纯JSON，不要markdown代码块标记。',
        },
        {
          role: 'user',
          content: `当前城市运行数据：
交通 - 全网车辆: ${totalVeh}辆, 平均拥堵指数: ${avgCong}%, 监测车道数: ${laneN}
能源 - 电池SOC: ${soc.toFixed(1)}%, 充放电功率: ${energySnap.battery.chargePower}kW, 电网电价: ¥${price}/kWh, 峰谷类型: ${energySnap.grid.peakType}, 总负荷: ${energySnap.grid.totalLoad}kW, 太阳能出力: ${Math.round(Math.max(0, energySnap.grid.totalSupply - (energySnap.battery.chargePower < 0 ? Math.abs(energySnap.battery.chargePower) : 0)))}kW
天气 - 云量: ${(energySnap.simHour)}时, 温度约25°C

返回JSON:
{
  "traffic": {
    "greenDuration": 10-60之间的整数,
    "redDuration": 10-60之间的整数,
    "reasoning": "中文优化理由"
  },
  "energy": {
    "strategy": "store或release或idle",
    "panelAngle": 0-180之间的整数,
    "reasoning": "中文策略理由"
  },
  "overall": "一句话城市运行评价（中文）"
}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content || '';
    // Strip markdown code block markers if present
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    cachedAdvice = {
      timestamp: new Date().toISOString(),
      cached: false,
      source: 'api',
      traffic: parsed.traffic || null,
      energy: parsed.energy || null,
      overall: parsed.overall || '分析完成。',
    };
    lastFetch = now;
    return { ...cachedAdvice! };
  } catch (err) {
    console.error('[AI] DeepSeek API call failed, falling back to mock:', (err as Error).message);
    cachedAdvice = generateMockAdvice();
    lastFetch = now;
    return { ...cachedAdvice!, cached: false };
  }
}
