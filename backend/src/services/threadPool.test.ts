import { describe, it, expect, afterAll } from 'vitest';
import { ThreadPool, terminatePool, getPool } from './threadPool';
import path from 'path';
import fs from 'fs';

describe('ThreadPool', () => {
  afterAll(async () => {
    await terminatePool();
  });

  it('getPool returns a singleton pool', () => {
    const pool = getPool();
    expect(pool).toBeInstanceOf(ThreadPool);
    expect(pool.getWorkerCount()).toBeGreaterThanOrEqual(1);
  });

  it('ThreadPool constructor creates correct number of workers', async () => {
    const pool = new ThreadPool(2);
    expect(pool.getWorkerCount()).toBe(2);
    await pool.terminate();
  });

  it('worker bootstrap file exists', () => {
    const workerPath = path.resolve(__dirname, 'threadPool.worker.js');
    expect(fs.existsSync(workerPath)).toBe(true);
  });

  it('worker entry TS file exists', () => {
    const workerPath = path.resolve(__dirname, 'threadPool.worker.ts');
    expect(fs.existsSync(workerPath)).toBe(true);
  });

  it('map with empty array returns empty', async () => {
    const pool = new ThreadPool(1);
    const results = await pool.map([], () => ({
      modulePath: __filename,
      exportName: 'any',
      args: [],
    }));
    expect(results).toEqual([]);
    await pool.terminate();
  });

  it('terminate cleans up workers without error', async () => {
    const pool = new ThreadPool(1);
    await pool.terminate();
  });
});
