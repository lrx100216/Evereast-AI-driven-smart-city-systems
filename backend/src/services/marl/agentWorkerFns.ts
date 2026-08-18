/**
 * MARL Agent Worker Functions
 *
 * Pure functions designed to run inside Worker Threads via the ThreadPool.
 * Each function takes fully serialisable arguments (plain objects/arrays),
 * constructs a temporary NeuralNetwork, and returns serialisable results.
 *
 * Used by MarlManager when parallelMode is enabled — offloads agent
 * inference and training to separate CPU cores.
 */

import { NeuralNetwork } from './NeuralNetwork';
import type { MARLConfig, AgentState, Experience } from './types';
import { MARL_ACTIONS, STATE_SIZE } from './types';

// ── Serialisable data shapes ────────────────────────────────────

export interface SerializedAgent {
  layerSizes: number[];
  weights: number[][][];
  biases: number[][];
  epsilon: number;
  config: MARLConfig;
}

export interface SelectActionInput {
  agent: SerializedAgent;
  state: AgentState;
}

export interface SelectActionOutput {
  actionIdx: number;
  qValues: number[];
}

export interface TrainInput {
  agent: SerializedAgent;
  batch: Experience[];
  stepCount: number;
}

export interface TrainOutput {
  weights: number[][][];
  biases: number[][];
  loss: number;
  epsilon: number;
  shouldSyncTarget: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

function flattenState(state: AgentState): number[] {
  return [
    ...state.queueByDir,
    ...state.signalPhase,
    ...state.neighborQueues,
    ...state.timeFeatures,
    ...state.weatherFeatures,
  ];
}

function argmax(arr: number[]): number {
  let best = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[best]) best = i;
  }
  return best;
}

function createNetwork(layerSizes: number[], weights: number[][][], biases: number[][]): NeuralNetwork {
  const nn = new NeuralNetwork(layerSizes);
  nn.deserialize({ weights, biases });
  return nn;
}

// ── Worker-callable functions ───────────────────────────────────

/**
 * Run agent.selectAction() in a worker thread.
 * Constructs a fresh NN, deserialises weights, and returns the action.
 */
export function agentSelectAction(input: SelectActionInput): SelectActionOutput {
  const { agent, state } = input;

  if (!agent?.layerSizes || !agent?.weights || !agent?.biases) {
    throw new Error('agentSelectAction: invalid agent data');
  }

  const nn = createNetwork(agent.layerSizes, agent.weights, agent.biases);
  const flatState = flattenState(state);
  const qValues = nn.predict(flatState);

  let actionIdx: number;
  if (Math.random() < agent.epsilon) {
    actionIdx = Math.floor(Math.random() * MARL_ACTIONS.length);
  } else {
    actionIdx = argmax(qValues);
  }

  return { actionIdx, qValues };
}

/**
 * Run agent.train() in a worker thread.
 * Constructs a fresh NN, runs one training step on the batch, and returns
 * the updated weights + loss (weights must be sent back to main thread).
 */
export function agentTrain(input: TrainInput): TrainOutput {
  const { agent, batch, stepCount } = input;

  if (!agent?.layerSizes || !agent?.weights || !agent?.biases) {
    throw new Error('agentTrain: invalid agent data');
  }

  const nn = createNetwork(agent.layerSizes, agent.weights, agent.biases);
  const config = agent.config;
  let totalLoss = 0;

  // Create a temporary target network
  const targetNN = createNetwork(agent.layerSizes, agent.weights, agent.biases);

  for (const exp of batch) {
    const nextQ = targetNN.predict(exp.nextState);
    const maxNextQ = Math.max(...nextQ);
    const targetValue = exp.reward + (exp.done ? 0 : config.gamma * maxNextQ);
    const loss = nn.train(exp.state, exp.action, targetValue, config.learningRate);
    totalLoss += loss;
  }

  const loss = batch.length > 0 ? totalLoss / batch.length : 0;

  // Decay epsilon
  const newEpsilon = Math.max(config.epsilonEnd, agent.epsilon * config.epsilonDecay);

  // Sync target network
  const newStepCount = stepCount + batch.length;
  const shouldSyncTarget = newStepCount % config.targetUpdateFreq === 0;

  // If syncing, update the target weights to match online
  if (shouldSyncTarget) {
    targetNN.copyFrom(nn);
  }

  const serialized = nn.serialize();

  return {
    weights: serialized.weights,
    biases: serialized.biases,
    loss,
    epsilon: newEpsilon,
    shouldSyncTarget,
  };
}

/**
 * Quick check: can this module be loaded in a worker context?
 * The worker threadPool.worker.js uses createRequire(), so we export
 * a simple ping function for testing.
 */
export function agentPing(): string {
  return 'marl-worker-ok';
}
