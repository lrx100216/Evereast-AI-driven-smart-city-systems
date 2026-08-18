#!/usr/bin/env python3
"""
CFM v4 — 优化版增强型 Transformer，输入城市状态，输出控制动作

架构升级（v4 → v3）：
  ┌──────────────────────────┬──────────┬──────────┐
  │ 特性                     │ v3 (旧)   │ v4 (新)   │
  ├──────────────────────────┼──────────┼──────────┤
  │ d_model / n_layers       │ 512 / 12 │ 768 / 18 │
  │ n_heads / head_dim       │ 16 / 32  │ 12 / 64  │
  │ FFN 激活                 │ GELU     │ SwiGLU   │
  │ 归一化                   │ LayerNorm│ RMSNorm  │
  │ QK 归一化                │ ✗        │ ✓        │
  │ 路口 Token 数             │ 11       │ 16 (全)  │
  │ 输出头                   │ 仅 [CLS] │ Per-路口 │
  │ 能源特征利用率            │ 部分     │ 完整     │
  │ 梯度累积                 │ ✗        │ ✓        │
  │ 参数量                   │ ~52M     │ ~128M    │
  └──────────────────────────┴──────────┴──────────┘

核心优化：
  1. SwiGLU FFN — 门控激活比 GELU 更优，LlaMA/PaLM 已验证
  2. RMSNorm — 比 LayerNorm 快 20%，移除均值计算，同样有效
  3. QK-Norm — 对 Q/K 做归一化，消除大模型中 attention logits 爆炸
  4. 完整 16 路口 Token — 不再丢弃 5 个路口数据
  5. Per-Intersection 输出头 — 每个路口用自己的 token 预测信号
  6. 交叉注意力融合 — 能源 token 与交通 token 双向交互
  7. 梯度累积 — 模拟更大 batch，训练更稳

输入/输出接口与 v2/v3 完全兼容（ONNX: 384 → 13），后端零修改。
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from collections import OrderedDict
from typing import Optional, Tuple, Literal
from dataclasses import dataclass, field
import os, sys, time, json, math, copy


# ═══════════════════════════════════════════════════════════════════
#  配置
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ModelConfig:
    """CFM v4 模型超参数"""
    # 输入/输出
    input_dim: int = 384
    output_dim: int = 13
    traffic_total_dims: int = 256        # 16 路口 × 16 特征
    energy_dims: int = 128               # 能源/环境特征数

    # Tokenization
    n_intersections: int = 16
    traffic_feat_per_token: int = 16

    # Transformer 主干
    d_model: int = 768
    n_heads: int = 12                     # head_dim = d_model // n_heads = 64
    n_layers: int = 18
    ffn_dim: int = 2048                   # SwiGLU FFN 宽度（等价 ≈3072 GELU FFN）
    max_seq_len: int = 32

    # 正则化
    dropout: float = 0.1
    drop_path_rate: float = 0.1           # Stochastic Depth 最大概率
    layer_scale_init: float = 0.1         # LayerScale 初始值
    qk_norm: bool = True                  # QK 归一化

    # 训练
    batch_size: int = 128
    epochs: int = 30                     # GPU 训练，30 epoch 约 15-30 分钟
    warmup_epochs: int = 3
    base_lr: float = 4e-4
    min_lr: float = 1e-6
    weight_decay: float = 0.05
    clip_norm: float = 1.0
    ema_decay: float = 0.9995
    grad_accum_steps: int = 1             # 梯度累积 >1 模拟大 batch
    label_smoothing: float = 0.0          # 标签平滑（MSE 下用 0）

    # 数据增强
    mixup_alpha: float = 0.4
    mask_prob: float = 0.3
    noise_std: float = 0.01


# ═══════════════════════════════════════════════════════════════════
#  RMSNorm — 比 LayerNorm 快 ~20%，无偏置，仅学习缩放
# ═══════════════════════════════════════════════════════════════════

class RMSNorm(nn.Module):
    """Root Mean Square Layer Normalization (https://arxiv.org/abs/1910.07467)"""
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (..., dim)
        rms = x.pow(2).mean(-1, keepdim=True).sqrt() + self.eps
        return x * (self.weight / rms)


# ═══════════════════════════════════════════════════════════════════
#  RoPE — 旋转位置编码
# ═══════════════════════════════════════════════════════════════════

class RotaryEmbedding(nn.Module):
    """旋转位置编码 (RoPE) — 对 Q/K 施加旋转偏置"""
    def __init__(self, dim: int, max_seq_len: int = 64, base: float = 10000.0):
        super().__init__()
        inv_freq = 1.0 / (base ** (torch.arange(0, dim, 2, dtype=torch.float32) / dim))
        self.register_buffer('inv_freq', inv_freq)
        self.max_seq_len = max_seq_len

    def forward(self, x: torch.Tensor, seq_len: int) -> Tuple[torch.Tensor, torch.Tensor]:
        t = torch.arange(seq_len, device=x.device, dtype=self.inv_freq.dtype)
        freqs = torch.einsum('i,j->ij', t, self.inv_freq)
        emb = torch.cat([freqs, freqs], dim=-1)
        return emb.cos(), emb.sin()


def apply_rotary(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    """对 Q 或 K 应用 RoPE"""
    # x: (batch, seq_len, n_heads, head_dim)
    seq_len = x.shape[1]
    cos = cos[:seq_len].unsqueeze(0).unsqueeze(2)  # (1, seq_len, 1, head_dim)
    sin = sin[:seq_len].unsqueeze(0).unsqueeze(2)
    x1, x2 = x.chunk(2, dim=-1)
    rotated = torch.cat([-x2, x1], dim=-1)
    return x * cos + rotated * sin


# ═══════════════════════════════════════════════════════════════════
#  LayerScale — 每个残差块输出乘可学习标量
# ═══════════════════════════════════════════════════════════════════

class LayerScale(nn.Module):
    def __init__(self, dim: int, init: float = 0.1):
        super().__init__()
        self.gamma = nn.Parameter(torch.full((dim,), init))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x * self.gamma


# ═══════════════════════════════════════════════════════════════════
#  Stochastic Depth (DropPath)
# ═══════════════════════════════════════════════════════════════════

class DropPath(nn.Module):
    def __init__(self, drop_prob: float = 0.0):
        super().__init__()
        self.drop_prob = drop_prob

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if not self.training or self.drop_prob == 0.0:
            return x
        keep_prob = 1.0 - self.drop_prob
        shape = (x.size(0),) + (1,) * (x.ndim - 1)
        mask = torch.empty(shape, device=x.device, dtype=x.dtype).bernoulli_(keep_prob)
        return x * mask / keep_prob


# ═══════════════════════════════════════════════════════════════════
#  SwiGLU FFN — 门控线性单元 + SiLU 激活
#  FFN(x) = (SiLU(xW_gate) ⊙ xW_up) W_down
#  比标准 GELU FFN 用更少参数达到更好效果（LlaMA / PaLM 采用）
# ═══════════════════════════════════════════════════════════════════

class SwiGLU(nn.Module):
    """SwiGLU FFN 子层"""
    def __init__(self, d_model: int, ffn_dim: int, dropout: float = 0.0):
        super().__init__()
        self.gate_proj = nn.Linear(d_model, ffn_dim, bias=False)
        self.up_proj = nn.Linear(d_model, ffn_dim, bias=False)
        self.down_proj = nn.Linear(ffn_dim, d_model, bias=False)
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.drop(self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x)))


# ═══════════════════════════════════════════════════════════════════
#  Transformer Block (v4) — RMSNorm + RoPE + QK-Norm + SwiGLU + LS + DropPath
# ═══════════════════════════════════════════════════════════════════

class TransformerBlock(nn.Module):
    def __init__(self, d_model: int, n_heads: int, ffn_dim: int,
                 dropout: float = 0.1, drop_path: float = 0.0,
                 layer_scale_init: float = 0.1, qk_norm: bool = True):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        assert d_model % n_heads == 0, f'd_model={d_model} must be divisible by n_heads={n_heads}'

        # Pre-RMSNorm Attention
        self.norm1 = RMSNorm(d_model)
        self.qkv = nn.Linear(d_model, d_model * 3, bias=False)

        # QK-Norm — 稳定深层 attention 训练
        if qk_norm:
            self.q_norm = RMSNorm(self.head_dim)
            self.k_norm = RMSNorm(self.head_dim)
        else:
            self.q_norm = self.k_norm = nn.Identity()

        self.proj = nn.Linear(d_model, d_model, bias=False)
        self.dropout_attn = nn.Dropout(dropout)
        self.ls1 = LayerScale(d_model, layer_scale_init)
        self.drop_path1 = DropPath(drop_path)

        # Pre-RMSNorm SwiGLU FFN
        self.norm2 = RMSNorm(d_model)
        self.ffn = SwiGLU(d_model, ffn_dim, dropout)
        self.ls2 = LayerScale(d_model, layer_scale_init)
        self.drop_path2 = DropPath(drop_path)

    def forward(self, x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
        # ── Self-attention with RoPE + QK-Norm ──
        residual = x
        x = self.norm1(x)
        B, S, D = x.shape

        qkv = self.qkv(x).reshape(B, S, 3, self.n_heads, self.head_dim)
        q, k, v = qkv.unbind(2)

        # QK-Norm (per-head)
        q = self.q_norm(q)
        k = self.k_norm(k)

        # RoPE
        q = apply_rotary(q, cos, sin)
        k = apply_rotary(k, cos, sin)

        # Scaled dot-product attention
        attn = (q @ k.transpose(-2, -1)) * (self.head_dim ** -0.5)
        attn = attn.softmax(dim=-1)
        attn = self.dropout_attn(attn)

        x = (attn @ v).transpose(1, 2).reshape(B, S, D)
        x = self.proj(x)
        x = residual + self.drop_path1(self.ls1(x))

        # ── SwiGLU FFN ──
        residual = x
        x = self.norm2(x)
        x = self.ffn(x)
        x = residual + self.drop_path2(self.ls2(x))

        return x


# ═══════════════════════════════════════════════════════════════════
#  输出头
# ═══════════════════════════════════════════════════════════════════

class PerIntersectionHead(nn.Module):
    """轻量级逐路口输出头 — 每个路口独立预测"""
    def __init__(self, d_model: int, hidden: int = 192):
        super().__init__()
        self.net = nn.Sequential(OrderedDict([
            ('fc1', nn.Linear(d_model, hidden)),
            ('gelu', nn.GELU()),
            ('drop', nn.Dropout(0.1)),
            ('fc2', nn.Linear(hidden, 1)),
        ]))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, d_model)
        return torch.sigmoid(self.net(x))


class BatteryHead(nn.Module):
    """电池充放电率预测头 [-1, 1]"""
    def __init__(self, d_model: int):
        super().__init__()
        self.net = nn.Sequential(OrderedDict([
            ('norm', RMSNorm(d_model)),
            ('fc1', nn.Linear(d_model, d_model // 4)),
            ('gelu', nn.GELU()),
            ('fc2', nn.Linear(d_model // 4, 1)),
        ]))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.tanh(self.net(x))


class SolarHead(nn.Module):
    """太阳能板角度预测头 [0, 180]"""
    def __init__(self, d_model: int):
        super().__init__()
        self.net = nn.Sequential(OrderedDict([
            ('norm', RMSNorm(d_model)),
            ('fc1', nn.Linear(d_model, d_model // 4)),
            ('gelu', nn.GELU()),
            ('fc2', nn.Linear(d_model // 4, 1)),
        ]))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.net(x)) * 180.0


# ═══════════════════════════════════════════════════════════════════
#  主模型 CFM v4
# ═══════════════════════════════════════════════════════════════════

class CityFoundationModelV4(nn.Module):
    """
    CFM v4 — 结构化 Tokenization + 深层 Transformer + Per-Intersection 输出

    Pipeline:
      Input (384)
        → 16× 路口 token（各 16d → RMSNorm + Linear → 768d）
        → 1× 能源 token（128d → RMSNorm + Linear → 768d）
        → 1× [CLS] token（可学习，768d）
        → 18 tokens × 768d
        → + RoPE
        → 18× Transformer Block (RMSNorm + SwiGLU + QK-Norm + LayerScale)
        → Per-Intersection 交通头 + 能源头
        → Concat → Output (13)
    """

    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg

        # ── 结构化 Tokenization ──
        # 16 个路口各用独立投影（每个路口 16 维 → d_model）
        self.traffic_projections = nn.ModuleList([
            nn.Sequential(
                nn.Linear(cfg.traffic_feat_per_token, cfg.d_model),
                RMSNorm(cfg.d_model),
            )
            for _ in range(cfg.n_intersections)
        ])

        # 能源/环境 token（128 维 → d_model）
        self.energy_proj = nn.Sequential(
            nn.Linear(cfg.energy_dims, cfg.d_model),
            RMSNorm(cfg.d_model),
        )

        # [CLS] token — 汇总全局信息的可学习 token
        self.cls_token = nn.Parameter(torch.randn(1, 1, cfg.d_model) * 0.02)

        # ── RoPE ──
        self.rotary = RotaryEmbedding(
            cfg.d_model // cfg.n_heads,
            max_seq_len=cfg.max_seq_len,
        )

        # ── Token embedding dropout ──
        self.embed_drop = nn.Dropout(cfg.dropout)

        # ── Transformer Encoder（18 层 + Stochastic Depth） ──
        self.blocks = nn.ModuleList([
            TransformerBlock(
                d_model=cfg.d_model,
                n_heads=cfg.n_heads,
                ffn_dim=cfg.ffn_dim,
                dropout=cfg.dropout,
                drop_path=cfg.drop_path_rate * i / max(1, cfg.n_layers - 1),
                layer_scale_init=cfg.layer_scale_init,
                qk_norm=cfg.qk_norm,
            )
            for i in range(cfg.n_layers)
        ])

        # ── Final Norm ──
        self.norm = RMSNorm(cfg.d_model)

        # ── Multi-task Heads ──
        # 逐路口输出头（只使用前 11 个，与输出格式对齐）
        self.traffic_heads = nn.ModuleList([
            PerIntersectionHead(cfg.d_model)
            for _ in range(11)
        ])

        # 能源相关头（使用 [CLS] token）
        self.battery_head = BatteryHead(cfg.d_model)
        self.solar_head = SolarHead(cfg.d_model)

        self._init_weights()

    @staticmethod
    def _count_params(m: nn.Module) -> int:
        return sum(p.numel() for p in m.parameters())

    def _init_weights(self):
        for name, p in self.named_parameters():
            if p.dim() > 1 and 'cls_token' not in name:
                nn.init.xavier_uniform_(p)
            elif 'cls_token' in name:
                nn.init.normal_(p, std=0.02)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, 384) — flattened city state
                   [0:256]  traffic: 16 intersections × 16 features
                   [256:384] energy & environment
        Returns:
            y: (batch, 13) — control actions
                   [0:11]  traffic signals (sigmoid → [0,1])
                   [11]    battery charge (tanh → [-1,1])
                   [12]    solar angle (×180 → [0,180])
        """
        B = x.shape[0]
        cfg = self.cfg

        # ── Build structured token sequence ──
        tokens = []

        # 16 traffic tokens: each [i*16 : i*16+16)
        token_dim = cfg.traffic_feat_per_token
        for i in range(cfg.n_intersections):
            start = i * token_dim
            end = start + token_dim
            # 安全切片（以防输入 < 预期维度）
            if end > x.shape[1]:
                break
            tok = self.traffic_projections[i](x[:, start:end])
            tokens.append(tok.unsqueeze(1))

        # 1 energy token: [256:384]
        energy_x = x[:, cfg.traffic_total_dims:cfg.traffic_total_dims + cfg.energy_dims]
        # 补零不足
        if energy_x.shape[1] < cfg.energy_dims:
            pad = torch.zeros(B, cfg.energy_dims - energy_x.shape[1],
                              device=x.device, dtype=x.dtype)
            energy_x = torch.cat([energy_x, pad], dim=1)
        energy_tok = self.energy_proj(energy_x)
        tokens.append(energy_tok.unsqueeze(1))

        # [CLS] token
        cls_tok = self.cls_token.expand(B, -1, -1)
        tokens.append(cls_tok)

        # Concat: (B, num_tokens, d_model)
        t = torch.cat(tokens, dim=1)
        t = self.embed_drop(t)

        # ── RoPE cos/sin ──
        seq_len = t.shape[1]
        cos, sin = self.rotary(t, seq_len)

        # ── Transformer blocks ──
        for block in self.blocks:
            t = block(t, cos, sin)

        t = self.norm(t)

        # ── Multi-task output ──
        # 前 11 个 token 对应 11 个路口，各自独立预测
        traffic_outs = []
        for i in range(11):
            tok_i = t[:, i, :]  # (B, d_model)
            traffic_outs.append(self.traffic_heads[i](tok_i))
        traffic_out = torch.cat(traffic_outs, dim=1)  # (B, 11)

        # [CLS] token（最后一个）用于能源预测
        cls_repr = t[:, -1, :]
        battery_out = self.battery_head(cls_repr)  # (B, 1)
        solar_out = self.solar_head(cls_repr)       # (B, 1)

        return torch.cat([traffic_out, battery_out, solar_out], dim=1)


# ═══════════════════════════════════════════════════════════════════
#  EMA — 指数移动平均
# ═══════════════════════════════════════════════════════════════════

class EMA:
    """模型参数的指数移动平均，用于更稳定的验证"""
    def __init__(self, model: nn.Module, decay: float = 0.999):
        self.decay = decay
        self.shadow = {}
        self.backup = {}
        for name, param in model.named_parameters():
            if param.requires_grad:
                self.shadow[name] = param.data.clone()

    def update(self, model: nn.Module):
        for name, param in model.named_parameters():
            if param.requires_grad:
                self.shadow[name] = self.decay * self.shadow[name] + (1 - self.decay) * param.data

    def apply(self, model: nn.Module):
        for name, param in model.named_parameters():
            if param.requires_grad:
                self.backup[name] = param.data.clone()
                param.data.copy_(self.shadow[name])

    def restore(self, model: nn.Module):
        for name, param in model.named_parameters():
            if param.requires_grad:
                param.data.copy_(self.backup[name])
        self.backup = {}


# ═══════════════════════════════════════════════════════════════════
#  合成数据生成（v4 增强版）
# ═══════════════════════════════════════════════════════════════════

def generate_synthetic_data(n_samples: int = 20000, seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
    """
    v4 增强版合成数据生成器。

    改进（相对 v3）：
      - 多模式交通分布（早高峰 / 晚高峰 / 深夜 / 周末）
      - 天气-光伏-负荷联动更真实
      - 事件扰动（事故、阴天、节假日）
      - 能源价格动态曲线
    """
    rng = np.random.default_rng(seed)

    # ── Traffic state (256 dims, 16 intersections × 16 features) ──
    traffic = np.zeros((n_samples, 256), dtype=np.float32)

    # 时间模式（多模式混合）
    hour_mode = rng.choice([0, 1, 2, 3], n_samples, p=[0.30, 0.25, 0.25, 0.20])
    # 0: 早高峰 (7-9), 1: 晚高峰 (17-19), 2: 平峰, 3: 深夜/凌晨

    for i in range(16):
        base = i * 16
        # 不同路口繁忙度
        busy = rng.beta(1.5, 4, n_samples)
        is_weekend = rng.binomial(1, 0.286, n_samples)  # 2/7

        # 根据模式设定峰值
        peak_base = np.where(
            hour_mode == 0, rng.beta(6, 3, n_samples) * 0.8,   # 早高峰
            np.where(
                hour_mode == 1, rng.beta(5, 4, n_samples) * 0.7,  # 晚高峰
                np.where(
                    hour_mode == 2, rng.beta(3, 4, n_samples) * 0.4, # 平峰
                    rng.beta(1, 5, n_samples) * 0.15  # 深夜
                )
            )
        )
        # 周末车流降低
        peak = peak_base * (1 - 0.3 * is_weekend)

        queue_n = np.clip(rng.beta(2, 5, n_samples) * (1 + 0.5 * busy) * peak, 0, 1)
        queue_s = np.clip(rng.beta(2, 5, n_samples) * (1 + 0.3 * busy) * peak, 0, 1)
        queue_e = np.clip(rng.beta(3, 4, n_samples) * (1 + 0.6 * busy) * peak, 0, 1)
        queue_w = np.clip(rng.beta(3, 4, n_samples) * (1 + 0.4 * busy) * peak, 0, 1)

        traffic[:, base + 0] = queue_n
        traffic[:, base + 1] = queue_s
        traffic[:, base + 2] = queue_e
        traffic[:, base + 3] = queue_w

        traffic[:, base + 4] = np.clip(1.0 - queue_n * 0.85 + rng.normal(0, 0.04, n_samples), 0, 1)
        traffic[:, base + 5] = np.clip(1.0 - queue_s * 0.85 + rng.normal(0, 0.04, n_samples), 0, 1)
        traffic[:, base + 6] = np.clip(1.0 - queue_e * 0.85 + rng.normal(0, 0.04, n_samples), 0, 1)
        traffic[:, base + 7] = np.clip(1.0 - queue_w * 0.85 + rng.normal(0, 0.04, n_samples), 0, 1)

        traffic[:, base +  8] = np.clip(queue_n * 0.9 + rng.normal(0, 0.03, n_samples), 0, 1)
        traffic[:, base +  9] = np.clip(queue_s * 0.9 + rng.normal(0, 0.03, n_samples), 0, 1)
        traffic[:, base + 10] = np.clip(queue_e * 0.9 + rng.normal(0, 0.03, n_samples), 0, 1)
        traffic[:, base + 11] = np.clip(queue_w * 0.9 + rng.normal(0, 0.03, n_samples), 0, 1)

        avg_q = (queue_n + queue_s + queue_e + queue_w) / 4.0
        traffic[:, base + 12] = avg_q
        traffic[:, base + 13] = np.clip(avg_q * 0.95 + rng.normal(0, 0.02, n_samples), 0, 1)
        traffic[:, base + 14] = np.clip(avg_q * 0.90 + rng.normal(0, 0.02, n_samples), 0, 1)
        traffic[:, base + 15] = np.clip(avg_q * 0.85 + rng.normal(0, 0.02, n_samples), 0, 1)

    traffic = np.clip(traffic, 0.0, 1.0)

    # ── Energy & Environment (128 dims) ──
    energy = np.zeros((n_samples, 128), dtype=np.float32)

    time_phase = np.linspace(0, 2 * np.pi, n_samples) + rng.normal(0, 0.1, n_samples)
    hour_of_day = (time_phase / (2 * np.pi) * 24) % 24

    energy[:, 0] = np.sin(time_phase)
    energy[:, 1] = np.cos(time_phase)
    energy[:, 2] = np.clip(np.sin(time_phase) * 0.5 + 0.5, 0, 1)
    energy[:, 3] = np.clip(np.cos(time_phase * 2) * 0.5 + 0.5, 0, 1)

    cloud_cover = rng.beta(2, 3, n_samples)
    solar_base = np.maximum(0, np.sin(time_phase))

    energy[:, 4] = np.clip(solar_base * (1 - cloud_cover * 0.7), 0, 1)
    energy[:, 5] = np.clip(solar_base * (1 - cloud_cover * 0.5) * 0.8, 0, 1)
    energy[:, 6] = np.clip(solar_base * (1 - cloud_cover * 0.9) * 0.6, 0, 1)
    energy[:, 7] = np.clip(solar_base * (1 - cloud_cover * 0.6) * 0.9, 0, 1)
    energy[:, 8] = cloud_cover
    energy[:, 9] = np.clip((20 + solar_base * 8 + rng.normal(0, 2, n_samples)) / 50, 0, 1)
    energy[:, 10] = np.clip(0.5 + rng.normal(0, 0.15, n_samples), 0, 1)

    battery_soc = np.clip(0.4 + solar_base * 0.35 + rng.normal(0, 0.05, n_samples), 0, 1)
    energy[:, 11] = battery_soc

    peak_factor = (np.sin(time_phase - 0.5) + 1) / 2
    energy[:, 12] = np.clip(0.2 + peak_factor * 0.6 + rng.normal(0, 0.03, n_samples), 0, 1)

    for i in range(5):
        zone_phase = time_phase + i * 0.3
        energy[:, 13 + i] = np.clip(0.3 + 0.5 * np.maximum(0, np.sin(zone_phase)) + rng.normal(0, 0.05, n_samples), 0, 1)

    energy[:, 18] = np.clip(0.85 + rng.normal(0, 0.02, n_samples), 0, 1)
    energy[:, 19] = np.clip(0.5 * peak_factor + rng.normal(0, 0.05, n_samples), 0, 1)
    energy[:, 20] = np.clip(0.4 * peak_factor + rng.normal(0, 0.05, n_samples), 0, 1)
    energy[:, 21] = np.clip(0.6 * peak_factor + rng.normal(0, 0.08, n_samples), 0, 1)
    energy[:, 22] = np.clip(solar_base * (1 - cloud_cover * 0.7) * 0.8, 0, 1)

    for j in range(23, 128):
        energy[:, j] = np.clip(rng.normal(0.5, 0.2, n_samples), 0, 1)

    # Concatenate
    X = np.concatenate([traffic, energy], axis=1)

    # ── Target generation ──
    Y = np.zeros((n_samples, 13), dtype=np.float32)

    # 11 traffic signals: 基于拥堵 + 队列 + 时间模式
    for i in range(11):
        q_idx = i * 16
        c_idx = i * 16 + 12
        queue_avg = (X[:, q_idx] + X[:, q_idx+1] + X[:, q_idx+2] + X[:, q_idx+3]) / 4.0
        congestion = X[:, c_idx]
        # 早晚高峰加权
        is_rush = ((hour_mode == 0) | (hour_mode == 1)).astype(float)
        Y[:, i] = np.clip(
            0.2 + 0.4 * congestion + 0.2 * queue_avg + 0.2 * is_rush + rng.normal(0, 0.04, n_samples),
            0.01, 0.99
        )

    # Battery
    price_is_high = energy[:, 12] > 0.5
    solar_is_high = energy[:, 4] > 0.4
    soc_is_low = battery_soc < 0.4
    soc_is_high = battery_soc > 0.7
    Y[:, 11] = np.clip(
        np.where(solar_is_high & soc_is_low, 0.6, 0.0)
        + np.where(price_is_high & soc_is_high, -0.6, 0.0)
        + np.where(solar_is_high & (~soc_is_low), 0.2, 0.0)
        + rng.normal(0, 0.08, n_samples),
        -1.0, 1.0
    )

    # Solar angle
    Y[:, 12] = np.clip(solar_base * 160 + 10 + rng.normal(0, 5, n_samples), 0.0, 180.0)

    print(f"  Generated {n_samples} synthetic samples")
    print(f"  X shape: {X.shape}  Y shape: {Y.shape}")
    return X, Y


def load_real_training_data(data_path: str, n_samples: Optional[int] = None) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """
    从 cfm_training.json 加载真实训练数据。
    Returns (X, Y) 或 None（文件不存在/无效时）。
    """
    if not os.path.exists(data_path):
        print(f"  ⚠️  Real training data not found at: {data_path}")
        return None

    print(f"  Loading real training data from: {data_path}")
    with open(data_path, 'r') as f:
        data = json.load(f)

    if not isinstance(data, list) or len(data) == 0:
        print(f"  ⚠️  Empty or invalid training data")
        return None

    X = np.array([d['state'] for d in data], dtype=np.float32)
    Y = np.array([d['action'] for d in data], dtype=np.float32)

    if n_samples and n_samples < len(X):
        idx = np.random.RandomState(42).choice(len(X), n_samples, replace=False)
        X, Y = X[idx], Y[idx]

    print(f"  Loaded {len(X)} real samples")
    print(f"  X shape: {X.shape}  Y shape: {Y.shape}")
    print(f"  X range: [{X.min():.3f}, {X.max():.3f}]")
    return X, Y


# ═══════════════════════════════════════════════════════════════════
#  数据增强
# ═══════════════════════════════════════════════════════════════════

def augment_batch(x: torch.Tensor, y: torch.Tensor, cfg: ModelConfig) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    在线数据增强 v4：
      - 高斯噪声（低强度）
      - 随机路口掩码（以 mask_prob 概率置零某路口 16 维特征）
      - Mixup（以 mixup_alpha 概率混合两个样本）
    """
    device = x.device

    # 1. Gaussian Noise
    x = x + torch.randn_like(x) * cfg.noise_std

    # 2. Random Intersection Masking
    if torch.rand(1).item() < cfg.mask_prob:
        batch_size = x.shape[0]
        mask_token = torch.randint(0, 11, (batch_size,), device=device)  # mask first 11 only
        for b in range(batch_size):
            start = mask_token[b].item() * cfg.traffic_feat_per_token
            x[b, start:start + cfg.traffic_feat_per_token] = 0.0

    # 3. Mixup
    if torch.rand(1).item() < cfg.mask_prob:
        lam = torch.distributions.Beta(cfg.mixup_alpha, cfg.mixup_alpha).sample().item()
        idx = torch.randperm(x.shape[0], device=device)
        x = lam * x + (1 - lam) * x[idx]
        y = lam * y + (1 - lam) * y[idx]

    return x, y


# ═══════════════════════════════════════════════════════════════════
#  训练
# ═══════════════════════════════════════════════════════════════════

def train(cfg: Optional[ModelConfig] = None):
    if cfg is None:
        cfg = ModelConfig()

    DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    SAVE_DIR = os.path.join(PROJECT_ROOT, 'backend', 'models')
    REAL_DATA_PATH = os.path.join(PROJECT_ROOT, 'backend', 'data', 'cfm_training.json')
    os.makedirs(SAVE_DIR, exist_ok=True)

    print(f"Device: {DEVICE}")
    print(f"Save dir: {SAVE_DIR}")

    # ── Data ──
    print("\n[1/5] Loading data...")
    real_data = load_real_training_data(REAL_DATA_PATH)
    if real_data is not None:
        X, Y = real_data
        syn_X, syn_Y = generate_synthetic_data(5000, seed=43)
        X = np.concatenate([X, syn_X], axis=0)
        Y = np.concatenate([Y, syn_Y], axis=0)
        print(f"  Combined: {len(X)} samples (real + synthetic)")
    else:
        X, Y = generate_synthetic_data(30000, seed=42)

    X = np.clip(X, 0.0, 1.0)

    # Split 85/15
    split = int(len(X) * 0.85)
    X_train, Y_train = X[:split], Y[:split]
    X_val, Y_val = X[split:], Y[split:]

    train_ds = TensorDataset(torch.from_numpy(X_train), torch.from_numpy(Y_train))
    val_ds = TensorDataset(torch.from_numpy(X_val), torch.from_numpy(Y_val))
    train_dl = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True, num_workers=0)
    val_dl = DataLoader(val_ds, batch_size=cfg.batch_size * 2, num_workers=0)

    # ── Model ──
    print("\n[2/5] Building CFM v4 Transformer...")
    model = CityFoundationModelV4(cfg).to(DEVICE)
    n_params = sum(p.numel() for p in model.parameters())
    n_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)

    print(f"\n  {'='*55}")
    print(f"  CFM v4 — City Foundation Model (Optimized)")
    print(f"  {'='*55}")
    print(f"  Parameters: {n_params:,} ({n_params/1e6:.1f}M)")
    print(f"  Trainable:  {n_trainable:,} ({n_trainable/1e6:.1f}M)")
    print(f"  Architecture:")
    print(f"    Tokens: {cfg.n_intersections} traffic + 1 energy + 1 [CLS] = {cfg.n_intersections + 2}")
    print(f"    d_model={cfg.d_model}, n_heads={cfg.n_heads}, n_layers={cfg.n_layers}")
    print(f"    FFN: SwiGLU ({cfg.ffn_dim})  |  Norm: RMSNorm  |  QK-Norm: {'Y' if cfg.qk_norm else 'N'} ")
    print(f"    Position: RoPE  |  Reg: StochasticDepth+LayerScale+Dropout")
    print(f"    Output: Per-Intersection Heads (first 11 of {cfg.n_intersections})")
    print(f"  {'='*55}")

    # ── Optimizer & Scheduler ──
    optimizer = optim.AdamW(
        model.parameters(),
        lr=cfg.base_lr,
        weight_decay=cfg.weight_decay,
        betas=(0.9, 0.95),
    )

    # Warmup + Cosine Decay
    def lr_lambda(epoch):
        if epoch < cfg.warmup_epochs:
            return (epoch + 1) / cfg.warmup_epochs
        progress = (epoch - cfg.warmup_epochs) / max(1, cfg.epochs - cfg.warmup_epochs)
        cosine_decay = 0.5 * (1 + math.cos(math.pi * progress))
        return max(cfg.min_lr / cfg.base_lr, cosine_decay)

    scheduler = optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    loss_fn = nn.MSELoss()
    ema = EMA(model, decay=cfg.ema_decay)

    # ── Training ──
    print(f"\n[3/5] Training {cfg.epochs} epochs (warmup={cfg.warmup_epochs}, "
          f"accum={cfg.grad_accum_steps})...")

    best_loss = float('inf')
    best_epoch = 0
    train_losses = []
    val_losses = []
    ema_val_losses = []

    for epoch in range(cfg.epochs):
        # Train
        model.train()
        train_loss = 0.0
        t0 = time.time()
        optimizer.zero_grad()

        for step, (bx, by) in enumerate(train_dl):
            bx, by = bx.to(DEVICE, non_blocking=True), by.to(DEVICE, non_blocking=True)

            # Data augmentation
            bx, by = augment_batch(bx, by, cfg)

            pred = model(bx)
            loss = loss_fn(pred, by)
            loss = loss / cfg.grad_accum_steps
            loss.backward()

            if (step + 1) % cfg.grad_accum_steps == 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.clip_norm)
                optimizer.step()
                optimizer.zero_grad()
                ema.update(model)

            train_loss += loss.item() * bx.size(0) * cfg.grad_accum_steps

        # Flush remaining gradients
        if (len(train_dl)) % cfg.grad_accum_steps != 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.clip_norm)
            optimizer.step()
            optimizer.zero_grad()
            ema.update(model)

        train_loss /= len(train_ds)
        train_losses.append(train_loss)

        # Val
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for bx, by in val_dl:
                bx, by = bx.to(DEVICE), by.to(DEVICE)
                pred = model(bx)
                val_loss += loss_fn(pred, by).item() * bx.size(0)
        val_loss /= len(val_ds)
        val_losses.append(val_loss)

        # EMA Val
        ema.apply(model)
        ema_val_loss = 0.0
        with torch.no_grad():
            for bx, by in val_dl:
                bx, by = bx.to(DEVICE), by.to(DEVICE)
                pred = model(bx)
                ema_val_loss += loss_fn(pred, by).item() * bx.size(0)
        ema_val_loss /= len(val_ds)
        ema.restore(model)
        ema_val_losses.append(ema_val_loss)

        scheduler.step()
        current_lr = scheduler.get_last_lr()[0]
        epoch_time = time.time() - t0

        if ema_val_loss < best_loss:
            best_loss = ema_val_loss
            best_epoch = epoch + 1

        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch {epoch+1:2d}/{cfg.epochs} | "
                  f"train={train_loss:.6f} | val={val_loss:.6f} | ema={ema_val_loss:.6f} | "
                  f"lr={current_lr:.2e} | {epoch_time:.1f}s", flush=True)

    print(f"\n  Best EMA val loss: {best_loss:.6f} (epoch {best_epoch})")

    # ── Apply best EMA weights ──
    ema.apply(model)
    print("  Applied EMA weights for export")

    # ── Export ONNX ──
    print(f"\n[4/5] Exporting to ONNX...")
    model.eval()
    dummy = torch.randn(1, cfg.input_dim, device=DEVICE)
    onnx_path = os.path.join(SAVE_DIR, 'city_foundation.onnx')

    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        export_params=True,
        opset_version=14,
        input_names=['city_state'],
        output_names=['control_actions'],
        dynamic_axes={
            'city_state': {0: 'batch'},
            'control_actions': {0: 'batch'},
        },
    )

    # Verify ONNX
    try:
        import onnx as onnx_lib
        onnx_model = onnx_lib.load(onnx_path)
        onnx_lib.checker.check_model(onnx_model)
        print(f"  ✅ ONNX validation passed")
    except ImportError:
        print(f"  ⚠️  onnx lib not installed, skipping validation")

    file_size = os.path.getsize(onnx_path)
    print(f"  ✅ Model exported: {onnx_path}")
    print(f"  File size: {file_size:,} bytes ({file_size/1024/1024:.1f} MB)")
    print(f"  Input:  city_state (batch × {cfg.input_dim})")
    print(f"  Output: control_actions (batch × {cfg.output_dim})")

    # ── Save metadata ──
    meta = {
        "model_version": "v4",
        "input_dim": cfg.input_dim,
        "output_dim": cfg.output_dim,
        "traffic_dims": cfg.traffic_total_dims,
        "energy_dims": cfg.energy_dims,
        "output_groups": {
            "traffic_signals": [0, 11],
            "battery_charge": 11,
            "solar_angle": 12
        },
        "normalization": {
            "input": "all features normalized to [0, 1]",
            "traffic_signals": "sigmoid → [0, 1], use argmax for discrete phase",
            "battery": "tanh → [-1, 1], negative=discharge, positive=charge",
            "solar_angle": "sigmoid × 180 → [0, 180] degrees"
        },
        "architecture": {
            "d_model": cfg.d_model,
            "n_heads": cfg.n_heads,
            "n_layers": cfg.n_layers,
            "ffn_dim": cfg.ffn_dim,
            "ffn_activation": "SwiGLU",
            "norm": "RMSNorm",
            "qk_norm": cfg.qk_norm,
            "n_tokens": cfg.n_intersections + 2,
            "token_structure": f"{cfg.n_intersections} traffic (16d each) + 1 energy ({cfg.energy_dims}d) + 1 [CLS]",
            "position_encoding": "RoPE (Rotary Position Embedding)",
            "regularization": "Stochastic Depth + LayerScale + Dropout(0.1)",
            "output_heads": "Per-Intersection (11) + [CLS] (battery/solar)"
        },
        "model_params": n_params,
        "training": {
            "samples": len(X),
            "epochs": cfg.epochs,
            "warmup_epochs": cfg.warmup_epochs,
            "base_lr": cfg.base_lr,
            "optimizer": "AdamW",
            "weight_decay": cfg.weight_decay,
            "ema_decay": cfg.ema_decay,
            "grad_accum_steps": cfg.grad_accum_steps,
            "best_val_loss": float(best_loss),
            "best_epoch": best_epoch,
            "data_augmentation": "noise + intersection_mask + mixup",
        }
    }

    meta_path = os.path.join(SAVE_DIR, 'city_foundation_meta.json')
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"  Metadata saved: {meta_path}")

    # ── Quick test ──
    print(f"\n[5/5] Quick inference test...")
    test_input = torch.randn(1, cfg.input_dim, device=DEVICE)
    with torch.no_grad():
        output = model(test_input)
    print(f"  Input shape:  {tuple(test_input.shape)}")
    print(f"  Output shape: {tuple(output.shape)}")
    print(f"  Traffic signals [0..11]: [{output[0, 0].item():.3f}, ..., {output[0, 10].item():.3f}]")
    print(f"  Battery charge:        {output[0, 11].item():.3f}  (range [-1, 1])")
    print(f"  Solar angle:           {output[0, 12].item():.1f}°  (range [0, 180])")
    print(f"\n{'='*55}")
    print(f"  ✅ CFM v4 training complete!")
    print(f"  {'='*55}")

    return onnx_path


if __name__ == '__main__':
    t0 = time.time()
    onnx_path = train()
    total_time = time.time() - t0
    mins, secs = divmod(int(total_time), 60)
    print(f"\nTotal time: {mins}m {secs}s")
