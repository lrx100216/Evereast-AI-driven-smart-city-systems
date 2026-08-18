import axios, { type AxiosRequestConfig } from 'axios';
import { API_URL } from '../config';

const TIMEOUT = 10_000;
const MAX_RETRIES = 2;

const api = axios.create({ baseURL: API_URL, timeout: TIMEOUT });

// ─── Retry interceptor ────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config as AxiosRequestConfig & { _retry?: number };
    const retries = config._retry ?? 0;
    if (retries < MAX_RETRIES && (!err.response || err.response.status >= 500)) {
      config._retry = retries + 1;
      await new Promise((r) => setTimeout(r, 1000 * (retries + 1)));
      return api(config);
    }
    return Promise.reject(err);
  },
);

// ─── Request dedup (in-flight tracking) ──────────────────

const inflight = new Map<string, Promise<any>>();

function dedupKey(url: string, params?: any): string {
  return `${url}::${JSON.stringify(params || '')}`;
}

async function dedupedGet<T>(url: string, params?: any): Promise<T> {
  const key = dedupKey(url, params);
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = api.get(url, { params }).then((r) => r.data).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ─── API endpoints ────────────────────────────────────────

export const trafficApi = {
  getStatus: () => dedupedGet('/traffic/status'),
  getHistory: () => dedupedGet('/traffic/history'),
  updateSignal: (intersectionId: string, greenDuration: number, redDuration: number) =>
    api.post('/traffic/signal/timing', { intersectionId, greenDuration, redDuration }),
};

export const energyApi = {
  getStatus: () => dedupedGet('/energy/status'),
  getHistory: () => dedupedGet('/energy/history'),
  setPanelAngle: (angle: number) => api.post('/energy/panel/angle', { angle }),
};

export const weatherApi = {
  getCurrent: () => dedupedGet('/weather/current'),
  getHistory: () => dedupedGet('/weather/history'),
};

export default api;
