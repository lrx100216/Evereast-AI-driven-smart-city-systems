// 从零实现的前馈神经网络 —— 不用 TensorFlow.js，就是为了减少依赖
// 但说实话，自己写的肯定没 TF.js 快，11个agent推理的时候主线程有点卡
// TODO: 考虑用 WASM 或者 GPU 加速，或者干脆换成 tfjs-node

// 注意：He init 用的 Box-Muller 变换，在浏览器里 Math.random() 质量一般，
// 训练初期如果 loss 爆炸，大概率是初始化的问题，多 reset 几次就好

export class NeuralNetwork {
  readonly layerSizes: number[];
  private weights: number[][][];   // [layer][output][input]
  private biases: number[][];      // [layer][output]
  private numLayers: number;

  constructor(layerSizes: number[]) {
    if (layerSizes.length < 2) {
      throw new Error('NeuralNetwork requires at least 2 layers (input + output)');
    }
    this.layerSizes = [...layerSizes];
    this.numLayers = layerSizes.length - 1;
    this.weights = [];
    this.biases = [];

    for (let l = 0; l < this.numLayers; l++) {
      const fanIn = layerSizes[l];
      const fanOut = layerSizes[l + 1];
      const std = Math.sqrt(2 / fanIn); // He init

      const w: number[][] = [];
      const b: number[] = [];
      for (let o = 0; o < fanOut; o++) {
        const row: number[] = [];
        for (let i = 0; i < fanIn; i++) {
          // Box-Muller for normal distribution
          const u1 = Math.random();
          const u2 = Math.random();
          const n = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
          row.push(n * std);
        }
        w.push(row);
        b.push(0);
      }
      this.weights.push(w);
      this.biases.push(b);
    }
  }

  /** Forward pass: input → output. Returns activations for all layers (needed for backprop). */
  forward(input: number[]): { output: number[]; cache: { z: number[][]; a: number[][] } } {
    const z: number[][] = []; // pre-activation per layer
    const a: number[][] = [input]; // activation per layer (a[0] = input)

    for (let l = 0; l < this.numLayers; l++) {
      const W = this.weights[l];
      const b = this.biases[l];
      const prev = a[l];
      const zl: number[] = [];

      for (let o = 0; o < W.length; o++) {
        let sum = b[o];
        const row = W[o];
        for (let i = 0; i < prev.length; i++) {
          sum += row[i] * prev[i];
        }
        zl.push(sum);
      }

      z.push(zl);

      // ReLU for hidden layers, linear for output
      const isOutput = l === this.numLayers - 1;
      const al = isOutput ? zl : zl.map(v => Math.max(0, v));
      a.push(al);
    }

    return { output: a[a.length - 1], cache: { z, a } };
  }

  /** Inference-only forward pass (no cache overhead) */
  predict(input: number[]): number[] {
    let current = input;
    for (let l = 0; l < this.numLayers; l++) {
      const W = this.weights[l];
      const b = this.biases[l];
      const next: number[] = [];
      for (let o = 0; o < W.length; o++) {
        let sum = b[o];
        const row = W[o];
        for (let i = 0; i < current.length; i++) {
          sum += row[i] * current[i];
        }
        next.push(sum);
      }
      const isOutput = l === this.numLayers - 1;
      current = isOutput ? next : next.map(v => Math.max(0, v));
    }
    return current;
  }

  /**
   * Train on a single DQN transition.
   *
   * Only the Q-value for the taken action gets a gradient;
   * other outputs' gradients are zero.
   */
  train(
    state: number[],
    actionIdx: number,
    target: number,
    learningRate: number,
  ): number {
    const { output, cache } = this.forward(state);
    const outputSize = output.length;

    // dL/dQ for each output neuron (only action taken is non-zero)
    const outputGrad: number[] = new Array(outputSize).fill(0);
    const error = output[actionIdx] - target;
    outputGrad[actionIdx] = error;

    // Backpropagate
    const deltas: number[][] = [];
    for (let l = this.numLayers - 1; l >= 0; l--) {
      const zl = cache.z[l];
      const isOutput = l === this.numLayers - 1;
      const prevA = cache.a[l];

      let delta: number[];
      if (isOutput) {
        // Linear output: activation'(z) = 1
        delta = [...outputGrad];
      } else {
        // ReLU derivative: 1 if z > 0 else 0
        const prevDelta = deltas[0]; // most recently computed (layer l+1)
        const Wnext = this.weights[l + 1];
        delta = new Array(zl.length).fill(0);
        for (let j = 0; j < zl.length; j++) {
          if (zl[j] <= 0) continue; // ReLU grad = 0
          let grad = 0;
          for (let k = 0; k < prevDelta.length; k++) {
            grad += Wnext[k][j] * prevDelta[k];
          }
          delta[j] = grad;
        }
      }

      deltas.unshift(delta);

      // Gradient clipping
      const clipped = delta.map(d => Math.max(-1, Math.min(1, d)));

      // Update weights and biases
      const W = this.weights[l];
      const b = this.biases[l];
      for (let o = 0; o < W.length; o++) {
        const gradO = clipped[o];
        if (isNaN(gradO)) continue;
        const row = W[o];
        for (let i = 0; i < prevA.length; i++) {
          const dw = gradO * prevA[i];
          if (!isNaN(dw)) row[i] -= learningRate * dw;
        }
        b[o] -= learningRate * gradO;
        // NaN detected — training has diverged. Surface the error instead of hiding it.
        if (isNaN(b[o])) {
          throw new Error(`NeuralNetwork training diverged: NaN detected in bias at layer ${l}, neuron ${o}. Try reducing learning rate or increasing replay buffer size.`);
        }
      }
    }

    return 0.5 * error * error; // return loss
  }

  /** Copy weights from another network (for target network sync) */
  copyFrom(source: NeuralNetwork): void {
    for (let l = 0; l < this.numLayers; l++) {
      const srcW = source.weights[l];
      const srcB = source.biases[l];
      const dstW = this.weights[l];
      const dstB = this.biases[l];
      for (let o = 0; o < dstW.length; o++) {
        for (let i = 0; i < dstW[o].length; i++) {
          dstW[o][i] = srcW[o][i];
        }
        dstB[o] = srcB[o];
      }
    }
  }

  /** Serialize weights for persistence */
  serialize(): { weights: number[][][]; biases: number[][] } {
    return {
      weights: this.weights.map(w => w.map(row => [...row])),
      biases: this.biases.map(b => [...b]),
    };
  }

  /** Deserialize weights from persistence */
  deserialize(data: { weights: number[][][]; biases: number[][] }): void {
    for (let l = 0; l < this.numLayers; l++) {
      for (let o = 0; o < this.weights[l].length; o++) {
        for (let i = 0; i < this.weights[l][o].length; i++) {
          this.weights[l][o][i] = data.weights[l][o][i];
        }
        this.biases[l][o] = data.biases[l][o];
      }
    }
  }
}
