/**
 * SQLite persistence layer for the Smart City backend.
 *
 * Provides write-through caching for simulation snapshots, MARL models,
 * and a simple key-value store for simulation checkpointing.
 *
 * Uses better-sqlite3 (synchronous API, WAL mode for concurrent reads).
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'smartcity.db');

let db: Database.Database | null = null;

// ── Schema ──────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS traffic_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    sim_time TEXT NOT NULL,
    car_count INTEGER NOT NULL DEFAULT 0,
    congestion_level REAL NOT NULL DEFAULT 0,
    average_speed REAL NOT NULL DEFAULT 0,
    snapshot_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS energy_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    sim_time TEXT NOT NULL,
    battery_soc REAL NOT NULL DEFAULT 0,
    charge_power REAL NOT NULL DEFAULT 0,
    grid_price REAL NOT NULL DEFAULT 0,
    solar_output REAL NOT NULL DEFAULT 0,
    total_load REAL NOT NULL DEFAULT 0,
    snapshot_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weather_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    sim_time TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0,
    humidity REAL NOT NULL DEFAULT 0,
    weather_condition TEXT NOT NULL DEFAULT 'unknown',
    cloud_cover REAL NOT NULL DEFAULT 0,
    snapshot_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS marl_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    episode INTEGER NOT NULL DEFAULT 0,
    reward REAL NOT NULL DEFAULT 0,
    weights_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS simulation_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_traffic_sim_time ON traffic_snapshots(sim_time);
  CREATE INDEX IF NOT EXISTS idx_energy_sim_time ON energy_snapshots(sim_time);
  CREATE INDEX IF NOT EXISTS idx_weather_sim_time ON weather_snapshots(sim_time);
  CREATE INDEX IF NOT EXISTS idx_marl_models_name ON marl_models(name);
`;

// ── Public API ──────────────────────────────────────────────────

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    console.log('[Database] SQLite opened at', DB_PATH);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] SQLite closed');
  }
}

// ── Traffic ─────────────────────────────────────────────────────

/** Extract numeric stat from nested TrafficSimSnapshot structure. */
function extractTrafficStats(snapshot: Record<string, unknown>): { carCount: number; congestionLevel: number; averageSpeed: number } {
  const zones = snapshot.zones;
  if (!Array.isArray(zones)) return { carCount: 0, congestionLevel: 0, averageSpeed: 0 };
  let cars = 0, cong = 0, speed = 0, count = 0;
  for (const z of zones) {
    const isecs = (z as any)?.intersections;
    if (!Array.isArray(isecs)) continue;
    for (const isec of isecs) {
      const lanes = (isec as any)?.lanes;
      if (!Array.isArray(lanes)) continue;
      for (const lane of lanes) {
        cars += Number((lane as any)?.carCount ?? 0);
        cong += Number((lane as any)?.congestionLevel ?? 0);
        speed += Number((lane as any)?.avgSpeed ?? 0);
        count++;
      }
    }
  }
  return {
    carCount: cars,
    congestionLevel: count > 0 ? Math.round(cong / count) : 0,
    averageSpeed: count > 0 ? Math.round((speed / count) * 10) / 10 : 0,
  };
}

export function insertTrafficSnapshot(snapshot: Record<string, unknown>): void {
  const d = getDb();
  const stats = extractTrafficStats(snapshot);
  const stmt = d.prepare(`
    INSERT INTO traffic_snapshots (sim_time, car_count, congestion_level, average_speed, snapshot_json)
    VALUES (@simTime, @carCount, @congestionLevel, @averageSpeed, @json)
  `);
  stmt.run({
    simTime: String(snapshot.simTime ?? ''),
    carCount: stats.carCount,
    congestionLevel: stats.congestionLevel,
    averageSpeed: stats.averageSpeed,
    json: JSON.stringify(snapshot),
  });
}

export function getRecentTrafficSnapshots(limit = 200): unknown[] {
  const d = getDb();
  const rows = d.prepare(
    'SELECT snapshot_json FROM traffic_snapshots ORDER BY id DESC LIMIT ?'
  ).all(limit) as Array<{ snapshot_json: string }>;
  return rows.map(r => JSON.parse(r.snapshot_json)).reverse();
}

// ── Energy ──────────────────────────────────────────────────────

export function insertEnergySnapshot(snapshot: Record<string, unknown>): void {
  const d = getDb();
  // EnergySimSnapshot nests battery & grid: battery.soc, battery.chargePower, grid.price, etc.
  const battery = (snapshot.battery ?? {}) as Record<string, unknown>;
  const grid = (snapshot.grid ?? {}) as Record<string, unknown>;
  const stmt = d.prepare(`
    INSERT INTO energy_snapshots (sim_time, battery_soc, charge_power, grid_price, solar_output, total_load, snapshot_json)
    VALUES (@simTime, @soc, @chargePower, @gridPrice, @solarOutput, @totalLoad, @json)
  `);
  stmt.run({
    simTime: String(snapshot.simTime ?? ''),
    soc: Number(battery.soc ?? 0),
    chargePower: Number(battery.chargePower ?? 0),
    gridPrice: Number(grid.price ?? 0),
    solarOutput: Number(grid.totalSupply ?? 0),
    totalLoad: Number(grid.totalLoad ?? 0),
    json: JSON.stringify(snapshot),
  });
}

export function getRecentEnergySnapshots(limit = 200): unknown[] {
  const d = getDb();
  const rows = d.prepare(
    'SELECT snapshot_json FROM energy_snapshots ORDER BY id DESC LIMIT ?'
  ).all(limit) as Array<{ snapshot_json: string }>;
  return rows.map(r => JSON.parse(r.snapshot_json)).reverse();
}

// ── Weather ─────────────────────────────────────────────────────

export function insertWeatherSnapshot(snapshot: Record<string, unknown>): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO weather_snapshots (sim_time, temperature, humidity, weather_condition, cloud_cover, snapshot_json)
    VALUES (@simTime, @temperature, @humidity, @weatherCondition, @cloudCover, @json)
  `);
  stmt.run({
    simTime: String(snapshot.simTime ?? ''),
    temperature: Number(snapshot.temperature ?? 0),
    humidity: Number(snapshot.humidity ?? 0),
    weatherCondition: String(snapshot.weatherCondition ?? 'unknown'),
    cloudCover: Number(snapshot.cloudCover ?? 0),
    json: JSON.stringify(snapshot),
  });
}

export function getRecentWeatherSnapshots(limit = 200): unknown[] {
  const d = getDb();
  const rows = d.prepare(
    'SELECT snapshot_json FROM weather_snapshots ORDER BY id DESC LIMIT ?'
  ).all(limit) as Array<{ snapshot_json: string }>;
  return rows.map(r => JSON.parse(r.snapshot_json)).reverse();
}

// ── MARL Models ─────────────────────────────────────────────────

export function saveMarlModel(name: string, episode: number, reward: number, weights: unknown): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO marl_models (name, episode, reward, weights_json)
    VALUES (@name, @episode, @reward, @weights)
  `);
  stmt.run({ name, episode, reward, weights: JSON.stringify(weights) });
}

export function loadLatestMarlModel(name: string): { episode: number; reward: number; weights: unknown } | null {
  const d = getDb();
  const row = d.prepare(
    'SELECT episode, reward, weights_json FROM marl_models WHERE name = ? ORDER BY id DESC LIMIT 1'
  ).get(name) as { episode: number; reward: number; weights_json: string } | undefined;
  if (!row) return null;
  return { episode: row.episode, reward: row.reward, weights: JSON.parse(row.weights_json) };
}

export function listMarlModels(): Array<{ name: string; episode: number; reward: number; created_at: string }> {
  const d = getDb();
  return d.prepare(
    'SELECT name, episode, reward, created_at FROM marl_models ORDER BY id DESC LIMIT 50'
  ).all() as Array<{ name: string; episode: number; reward: number; created_at: string }>;
}

// ── Key-Value State (checkpointing) ─────────────────────────────

export function setState(key: string, value: unknown): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO simulation_state (key, value_json, updated_at)
    VALUES (@key, @json, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = @json, updated_at = datetime('now')
  `);
  stmt.run({ key, json: JSON.stringify(value) });
}

export function getState<T = unknown>(key: string): T | null {
  const d = getDb();
  const row = d.prepare(
    'SELECT value_json FROM simulation_state WHERE key = ?'
  ).get(key) as { value_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.value_json) as T;
}

// ── Maintenance ─────────────────────────────────────────────────

/** Prune old snapshots, keeping at most `keep` most recent entries per table */
export function pruneSnapshots(keep = 1000): void {
  const d = getDb();
  for (const table of ['traffic_snapshots', 'energy_snapshots', 'weather_snapshots']) {
    const row = d.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
    if (row.cnt > keep) {
      const deleteBefore = d.prepare(
        `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1 OFFSET ?`
      ).get(keep) as { id: number } | undefined;
      if (deleteBefore) {
        d.prepare(`DELETE FROM ${table} WHERE id <= ?`).run(deleteBefore.id);
      }
    }
  }
}

/** Total database size in bytes */
export function dbSize(): number {
  try {
    const fs = require('fs');
    return fs.statSync(DB_PATH).size;
  } catch {
    return 0;
  }
}
