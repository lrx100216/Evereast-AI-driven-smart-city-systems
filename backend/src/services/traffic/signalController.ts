/**
 * Signal controller ¡ª 4-phase controller with configurable timings
 * Extracted from trafficSimulation.ts
 */
import type { Direction } from './types';

type SignalColor = 'green' | 'yellow' | 'red';

export interface PhaseConfig {
  name: string;
  greenDirections: Direction[];
  greenTime: number;
  yellowTime: number;
  allRedTime: number;
}

function defaultPhases(isecId: string): PhaseConfig[] {
  return [
    { name: 'NS-through', greenDirections: ['N', 'S'], greenTime: 35, yellowTime: 3, allRedTime: 1.5 },
    { name: 'NS-left',    greenDirections: ['N', 'S'], greenTime: 18, yellowTime: 3, allRedTime: 1.5 },
    { name: 'EW-through', greenDirections: ['E', 'W'], greenTime: 30, yellowTime: 3, allRedTime: 1.5 },
    { name: 'EW-left',    greenDirections: ['E', 'W'], greenTime: 15, yellowTime: 3, allRedTime: 1.5 },
  ];
}

export class SignalController {
  phases: PhaseConfig[];
  currentPhaseIdx = 0;
  timeInPhase = 0;
  subPhase: 'green' | 'yellow' | 'allred' = 'green';
  subPhaseTime = 0;
  totalCycleTime: number;

  constructor(isecId: string) {
    this.phases = defaultPhases(isecId);
    this.totalCycleTime = this.phases.reduce((s, p) => s + p.greenTime + p.yellowTime + p.allRedTime, 0);
    this.currentPhaseIdx = Math.floor(Math.random() * 4);
    this.timeInPhase = Math.floor(Math.random() * this.phases[this.currentPhaseIdx].greenTime);
  }

  getColor(dir: Direction): SignalColor {
    const phase = this.phases[this.currentPhaseIdx];
    if (this.subPhase === 'allred') return 'red';
    if (this.subPhase === 'yellow') {
      return phase.greenDirections.includes(dir) ? 'yellow' : 'red';
    }
    return phase.greenDirections.includes(dir) ? 'green' : 'red';
  }

  getRemaining(dir: Direction): number {
    const phase = this.phases[this.currentPhaseIdx];
    if (this.subPhase === 'green') {
      if (phase.greenDirections.includes(dir)) {
        return phase.greenTime - this.subPhaseTime;
      }
      let accum = phase.greenTime - this.subPhaseTime + phase.yellowTime + phase.allRedTime;
      for (let i = 1; i <= this.phases.length; i++) {
        const next = this.phases[(this.currentPhaseIdx + i) % this.phases.length];
        if (next.greenDirections.includes(dir)) return accum;
        accum += next.greenTime + next.yellowTime + next.allRedTime;
      }
      return accum;
    }
    const remaining = phase.greenTime + phase.yellowTime + phase.allRedTime - this.timeInPhase;
    return Math.max(0, remaining);
  }

  advance(dt: number) {
    const phase = this.phases[this.currentPhaseIdx];
    this.timeInPhase += dt;
    this.subPhaseTime += dt;

    if (this.subPhase === 'green' && this.subPhaseTime >= phase.greenTime) {
      this.subPhase = 'yellow';
      this.subPhaseTime = 0;
    }
    if (this.subPhase === 'yellow' && this.subPhaseTime >= phase.yellowTime) {
      this.subPhase = 'allred';
      this.subPhaseTime = 0;
    }
    if (this.subPhase === 'allred' && this.subPhaseTime >= phase.allRedTime) {
      this.currentPhaseIdx = (this.currentPhaseIdx + 1) % this.phases.length;
      this.timeInPhase = 0;
      this.subPhase = 'green';
      this.subPhaseTime = 0;
    }
  }

  setGreenDuration(dir: Direction, duration: number) {
    for (const phase of this.phases) {
      if (phase.greenDirections.includes(dir)) {
        phase.greenTime = Math.max(10, Math.min(90, duration));
      }
    }
    this.totalCycleTime = this.phases.reduce((s, p) => s + p.greenTime + p.yellowTime + p.allRedTime, 0);
  }
}
