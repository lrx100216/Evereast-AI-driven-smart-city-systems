// DQN Agent —— 每个路口一个，非常基础的实现
// NOTE: 没有 Prioritized Replay，没有 Dueling DQN，就是 vanilla DQN
// 如果训练效果不好，优先考虑把 hiddenLayers 加大，而不是换算法

import { NeuralNetwork } from './NeuralNetwork';
import { ReplayBuffer } from './ReplayBuffer';
import {
  MARL_ACTIONS, ACTION_INDEX,
  STATE_SIZE, DEFAULT_MARL_CONFIG,
  type MARLAction, type Experience, type MARLConfig, type AgentState,
} from './types';

export class DQNAgent {
  readonly intersectionId: string;
  private online: NeuralNetwork;
  private target: NeuralNetwork;
  private replay: ReplayBuffer;
  private epsilon: number;
  private config: MARLConfig;
  private stepCount: number;

  constructor(intersectionId: string, config: MARLConfig = DEFAULT_MARL_CONFIG) {
    this.intersectionId = intersectionId;
    this.config = config;

    const layerSizes = [STATE_SIZE, ...config.hiddenLayers, MARL_ACTIONS.length];
    this.online = new NeuralNetwork(layerSizes);
    this.target = new NeuralNetwork(layerSizes);
    this.target.copyFrom(this.online);

    this.replay = new ReplayBuffer(config.replayCapacity);
    this.epsilon = config.epsilonStart;
    this.stepCount = 0;
  }

  // action selection

  selectAction(state: AgentState): { action: MARLAction; actionIdx: number; qValues: number[] } {
    const flatState = this.flattenState(state);
    const qValues = this.online.predict(flatState);

    let actionIdx: number;
    if (Math.random() < this.epsilon) {
      // Explore: random action
      actionIdx = Math.floor(Math.random() * MARL_ACTIONS.length);
    } else {
      // Exploit: max Q
      actionIdx = this.argmax(qValues);
    }

    return { action: MARL_ACTIONS[actionIdx], actionIdx, qValues };
  }

  // greedy，推理时用，不探索
  selectGreedy(state: AgentState): { action: MARLAction; actionIdx: number; qValues: number[] } {
    const flatState = this.flattenState(state);
    const qValues = this.online.predict(flatState);
    const actionIdx = this.argmax(qValues);
    return { action: MARL_ACTIONS[actionIdx], actionIdx, qValues };
  }

  // 存经验

  store(state: AgentState, actionIdx: number, reward: number, nextState: AgentState, done: boolean): void {
    this.replay.push({
      state: this.flattenState(state),
      action: actionIdx,
      reward,
      nextState: this.flattenState(nextState),
      done,
    });
  }

  // 训练 —— 每次抽batch更新，非常标准，没啥花哨的

  train(): number | null {
    this.stepCount++;

    if (this.replay.size < this.config.trainStartSize) return null;

    const batch = this.replay.sample(this.config.batchSize);
    let totalLoss = 0;

    for (const exp of batch) {
      // Target = r + γ * max_a' Q_target(s') * (1 - done)
      const nextQ = this.target.predict(exp.nextState);
      const maxNextQ = Math.max(...nextQ);
      const targetValue = exp.reward + (exp.done ? 0 : this.config.gamma * maxNextQ);

      const loss = this.online.train(exp.state, exp.action, targetValue, this.config.learningRate);
      totalLoss += loss;
    }

    // Sync target network
    if (this.stepCount % this.config.targetUpdateFreq === 0) {
      this.target.copyFrom(this.online);
    }

    // Decay epsilon
    this.epsilon = Math.max(this.config.epsilonEnd, this.epsilon * this.config.epsilonDecay);

    return totalLoss / batch.length;
  }

  // 强制同步 target network
  syncTarget(): void {
    this.target.copyFrom(this.online);
  }

  // helpers

  private flattenState(state: AgentState): number[] {
    return [
      ...state.queueByDir,
      ...state.signalPhase,
      ...state.neighborQueues,
      ...state.timeFeatures,
      ...state.weatherFeatures,
    ];
  }

  private argmax(arr: number[]): number {
    let best = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > arr[best]) best = i;
    }
    return best;
  }

  // getters

  getEpsilon(): number { return this.epsilon; }

  // Worker Thread support: expose weights & state for serialisation to workers

  getLayerSizes(): number[] {
    return this.online.layerSizes;
  }

  getOnlineWeights(): { weights: number[][][]; biases: number[][] } {
    return this.online.serialize();
  }

  updateOnlineWeights(data: { weights: number[][][]; biases: number[][] }): void {
    this.online.deserialize(data);
  }

  getStepCount(): number { return this.stepCount; }

  isReadyToTrain(): boolean {
    return this.replay.size >= this.config.trainStartSize;
  }

  sampleBatch(size: number): Array<{ state: number[]; action: number; reward: number; nextState: number[]; done: boolean }> {
    return this.replay.sample(size);
  }

  // 存/读权重 —— JSON 格式，体积很大，后续考虑用 msgpack 或者二进制

  serialize(): { weights: number[][][]; biases: number[][] } {
    return this.online.serialize();
  }

  deserialize(data: { weights: number[][][]; biases: number[][] }): void {
    this.online.deserialize(data);
    this.target.copyFrom(this.online);
  }

  setEpsilon(eps: number): void {
    this.epsilon = eps;
  }

  reset(): void {
    this.replay.clear();
    this.epsilon = this.config.epsilonStart;
    this.stepCount = 0;
  }
}
