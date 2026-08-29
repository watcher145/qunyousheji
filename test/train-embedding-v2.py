# -*- coding: utf-8 -*-
"""
B1v2: 同类技能对比学习 —— (描述A, 特征B) 同类靠近、异类远离
用 CosineSimilarityLoss：正对目标1.0，负对目标0.0
"""
import json
import os
import torch
from sentence_transformers import SentenceTransformer, losses, models, InputExample
from torch.utils.data import DataLoader

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PT_MODEL_DIR = r"C:\Users\25040\AppData\Local\Temp\opencode\bge-pt"
MODEL_OUT = os.path.join(BASE_DIR, "models", "tuned-bge-zh-v2")

with open(os.path.join(BASE_DIR, "train-pairs-v2.json"), "r", encoding="utf-8") as f:
    pairs = json.load(f)
positives, negatives = pairs["positives"], pairs["negatives"]
print(f"正对 {len(positives)}, 负对 {len(negatives)}")

# 支持 SAMPLE 环境变量限制样本量（CPU 快速验证）；为空或0则全量
import os
_sample = os.environ.get("SAMPLE", "")
MAX_SAMPLES = int(_sample) if _sample.isdigit() and int(_sample) > 0 else None
pos_train = positives if MAX_SAMPLES is None else positives[:MAX_SAMPLES]
neg_train = negatives if MAX_SAMPLES is None else negatives[:MAX_SAMPLES]
train_samples = []
for p in pos_train:
    train_samples.append(InputExample(texts=[p["query"], p["doc"]], label=1.0))
for n in neg_train:
    train_samples.append(InputExample(texts=[n["query"], n["doc"]], label=0.0))
print(f"训练样本: {len(train_samples)} (正{len(pos_train)}负{len(neg_train)})")

# 加载基座
word_emb = models.Transformer(PT_MODEL_DIR, model_kwargs={})
pooling = models.Pooling(word_emb.get_word_embedding_dimension(), pooling_mode="mean")
model = SentenceTransformer(modules=[word_emb, pooling])
print(f"基座加载完成: {model.get_sentence_embedding_dimension()} 维")

batch_size = 8
loader = DataLoader(train_samples, batch_size=batch_size, shuffle=True)
loss = losses.CosineSimilarityLoss(model)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"设备: {device}")
model.to(device)

EPOCHS = 1
WARMUP = int(len(loader) * EPOCHS * 0.05)
print(f"训练: {EPOCHS} epochs, warmup {WARMUP}")

model.fit(
    train_objectives=[(loader, loss)],
    epochs=EPOCHS,
    warmup_steps=WARMUP,
    show_progress_bar=True,
    output_path=MODEL_OUT,
    save_best_model=False,
    optimizer_params={"lr": 2e-5},
)
print(f"微调模型已保存: {MODEL_OUT}")