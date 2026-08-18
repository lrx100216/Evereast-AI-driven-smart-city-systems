/**
 * Barrel re-export �� delegates to the new modular traffic/ folder.
 * Kept as-is so existing imports continue to work without updating every file.
 * 
 * TODO (future): update all import paths to traffic/ directly and remove this file.
 */
export { TrafficSimulationEngine, trafficSim } from './engine';
export type * from './types';
