# -*- coding: utf-8 -*-
"""
B1: 微调 embedding 模型 —— 学习"技能描述 <-> 代码特征"的语义映射
对比学习（MultipleNegativesRankingLoss），基座 bge-base-zh-v1.5
输出: models/tuned-bge-zh/ (safetensors + config) + ONNX 导出
"""
import json
import os
import sys
import torch
from sentence_transformers import SentenceTransformer, losses, models, InputExample
from torch.utils.data import DataLoader

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_SRC = os.path.join(BASE_DIR, "models", "bge-base-zh-v1.5")  # 已有本地模型（transformers.js 下载的结构）
MODEL_OUT = os.path.join(BASE_DIR, "models", "tuned-bge-zh")

# ---------- 加载数据集 ----------
with open(os.path.join(BASE_DIR, "train-dataset.json"), "r", encoding="utf-8") as f:
    ds = json.load(f)
samples = ds["samples"]
print(f"数据集: {len(samples)} 样本")

# ---------- 加载基座模型 ----------
# 使用本地 pytorch 权重（从 hf-mirror 下载的 BAAI/bge-base-zh-v1.5）
from transformers import AutoTokenizer, AutoModel

PT_MODEL_DIR = r"C:\Users\25040\AppData\Local\Temp\opencode\bge-pt"
print(f"加载本地基座 {PT_MODEL_DIR} ...")

# 直接构造 Transformer 模块（用本地路径，sentence-transformers 自行加载权重+tokenizer）
word_emb = models.Transformer(PT_MODEL_DIR, model_kwargs={})
pooling = models.Pooling(word_emb.get_word_embedding_dimension(), pooling_mode="mean")
model = SentenceTransformer(modules=[word_emb, pooling])
print(f"基座加载完成: {model.get_sentence_embedding_dimension()} 维")

# ---------- 构造训练样本（query=描述, doc=特征文本） ----------
train_samples = []
for s in samples:
    if not s.get("desc") or not s.get("feature"):
        continue
    train_samples.append(InputExample(texts=[s["desc"], s["feature"]]))

print(f"训练样本: {len(train_samples)}")

# ---------- 训练 ----------
batch_size = 16
loader = DataLoader(train_samples, batch_size=batch_size, shuffle=True)
loss = losses.MultipleNegativesRankingLoss(model)

# 设备
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"设备: {device}")
model.to(device)

EPOCHS = 1
WARMUP = int(len(loader) * EPOCHS * 0.05)
print(f"训练: {EPOCHS} epochs, warmup {WARMUP}, device={device}")

model.fit(
    train_objectives=[(loader, loss)],
    epochs=EPOCHS,
    warmup_steps=WARMUP,
    show_progress_bar=True,
    output_path=MODEL_OUT,
    save_best_model=False,
)

print(f"微调模型已保存: {MODEL_OUT}")
print("完成。接下来导出 ONNX 供 Node 加载。")