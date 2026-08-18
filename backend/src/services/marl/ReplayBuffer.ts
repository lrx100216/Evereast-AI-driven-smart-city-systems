// ═══════════════════════════════════════════════════════════════
// ReplayBuffer — Fixed-size circular experience replay buffer
// ═══════════════════════════════════════════════════════════════

import type { Experience } from './types';

export class ReplayBuffer {
  private buffer: Experience[];
  private capacity: number;
  private position: number;
  private _size: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.position = 0;
    this._size = 0;
  }

  push(exp: Experience): void {
    this.buffer[this.position] = exp;
    this.position = (this.position + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  sample(batchSize: number): Experience[] {
    const effectiveSize = Math.min(batchSize, this._size);
    const batch: Experience[] = [];
    const indices = new Set<number>();

    while (indices.size < effectiveSize) {
      indices.add(Math.floor(Math.random() * this._size));
    }

    for (const idx of indices) {
      batch.push(this.buffer[idx]);
    }

    return batch;
  }

  get size(): number {
    return this._size;
  }

  clear(): void {
    this.position = 0;
    this._size = 0;
  }
}
