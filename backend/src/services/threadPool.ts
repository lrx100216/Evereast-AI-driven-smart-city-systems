/**
 * 【模块说明】threadPool.ts — CPU 自适应 Worker 线程池
 * Module: threadPool.ts — CPU-adaptive Worker Thread Pool
 *
 * 【功能】自动检测 CPU 核心数，创建持久化 Worker 线程池，
 *         通过 pool.map() 将独立任务分发到所有核心并行执行。
 * Function: Auto-detects CPU count, creates persistent Worker pool,
 *           distributes independent tasks across all cores via pool.map().
 *
 * 【关键配置】
 *   - SMART_CITY_CPU_COUNT 环境变量：覆盖自动检测的线程数
 *   - 默认：Math.max(1, os.cpus().length - 1) —— 预留一个核心给系统
 * Key Configs:
 *   - SMART_CITY_CPU_COUNT env var: overrides auto-detected thread count
 *   - Default: Math.max(1, os.cpus().length - 1) — leaves one core free
 *
 * 【主要导出】
 *   - getPool() / terminatePool()  获取/销毁全局单例线程池
 *   - ThreadPool.map()             分发任务并收集结果
 *   - ThreadPool.terminate()       优雅关闭所有 Worker
 * Exports:
 *   - getPool() / terminatePool()  Global singleton pool access / cleanup
 *   - ThreadPool.map()             Distributes tasks, collects results in order
 *   - ThreadPool.terminate()       Graceful worker shutdown
 */

import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';

export interface PoolOptions {
  cpuCount?: number;
  taskTimeout?: number;
}

export interface TaskSpec {
  modulePath: string;
  exportName: string;
  args: unknown[];
}

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

class ThreadPool {
  private workers: Worker[];
  private tasks = new Map<number, PendingTask>();
  private nextId = 0;
  private taskTimeout: number;

  constructor(workerCount: number, options: PoolOptions = {}) {
    this.taskTimeout = options.taskTimeout || 0;
    const workerPath = path.resolve(__dirname, 'threadPool.worker.js');

    this.workers = [];
    for (let i = 0; i < workerCount; i++) {
      this.spawnWorker(i, workerPath);
    }
  }

  private spawnWorker(index: number, workerPath: string): void {
    const worker = new Worker(workerPath);
    worker.on('message', (msg) => this.handleMessage(msg));
    worker.on('error', (err) => console.error(`[ThreadPool worker ${index}] error:`, err.message));
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[ThreadPool worker ${index}] exited with code ${code}, restarting...`);
        this.spawnWorker(index, workerPath);
      }
    });
    this.workers[index] = worker;
  }

  private handleMessage(msg: { taskId: number; result?: unknown; error?: string }): void {
    const pending = this.tasks.get(msg.taskId);
    if (!pending) return;
    this.tasks.delete(msg.taskId);
    if (pending.timer) clearTimeout(pending.timer);

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.result);
    }
  }

  async map<T, R>(items: T[], factory: (item: T) => TaskSpec): Promise<R[]> {
    if (items.length === 0) return [];
    const results: R[] = new Array(items.length);
    let errors = 0;
    const pending = new Set<Promise<void>>();

    for (let i = 0; i < items.length; i++) {
      const taskId = this.nextId++;
      const spec = factory(items[i]);
      const workerIndex = i % this.workers.length;

      const p = new Promise<void>((resolve, reject) => {
        const pendingTask: PendingTask = { resolve: (val) => { results[i] = val as R; resolve(); }, reject };
        if (this.taskTimeout > 0) {
          pendingTask.timer = setTimeout(() => {
            this.tasks.delete(taskId);
            reject(new Error(`Task ${taskId} timed out after ${this.taskTimeout}ms`));
          }, this.taskTimeout);
        }
        this.tasks.set(taskId, pendingTask);
      }).catch((err) => {
        errors++;
        results[i] = undefined as any;
        console.warn(`[ThreadPool] Task ${i} failed:`, err.message);
      });

      pending.add(p);
      this.workers[workerIndex].postMessage({ taskId, spec });
    }

    await Promise.all(pending);

    if (errors > 0) {
      console.warn(`[ThreadPool] ${errors}/${items.length} tasks failed`);
    }
    return results;
  }

  async terminate(): Promise<void> {
    // Clear all pending tasks
    for (const [, task] of this.tasks) {
      if (task.timer) clearTimeout(task.timer);
      task.reject(new Error('Pool terminated'));
    }
    this.tasks.clear();
    await Promise.all(this.workers.map((w) => w.terminate()));
  }

  getWorkerCount(): number {
    return this.workers.length;
  }
}

let poolInstance: ThreadPool | null = null;

export function getPool(options: PoolOptions = {}): ThreadPool {
  if (!poolInstance) {
    const raw = options.cpuCount
      || parseInt(process.env.SMART_CITY_CPU_COUNT || '0', 10)
      || Math.max(1, os.cpus().length - 1);

    const count = Math.max(1, Math.min(raw, os.cpus().length));
    console.log(`[ThreadPool] Creating pool with ${count} workers (detected ${os.cpus().length} CPUs)`);
    poolInstance = new ThreadPool(count, options);
  }
  return poolInstance;
}

export async function terminatePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.terminate();
    poolInstance = null;
  }
}

export { ThreadPool };
