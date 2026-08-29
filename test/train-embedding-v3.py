# -*- coding: utf-8 -*-
"""
B1v3: 描述 <-> 完整技能文档 对齐（检索 doc 完全一致）+ 负例判别
正: (描述A, A完整文档)
负: (描述A, B完整文档)  B 随机异技能
"""
import json
import os
import torch
from sentence_transformers import SentenceTransformer, losses, models, InputExample
from torch.utils.data import DataLoader

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PT_MODEL_DIR = r"C:\Users\25040\AppData\Local\Temp\opencode\bge-pt"
MODEL_OUT = os.path.join(BASE_DIR, "models", "tuned-bge-zh-v3")

# 加载语料（含完整特征）
corpus = json.load(open(os.path.join(BASE_DIR, "skills-corpus.json"), encoding="utf-8"))
usable = [s for s in corpus if s.get("info") and len(s["info"]) >= 10]
print(f"技能: {len(usable)}")

# 与检索端 buildDocText 完全一致的文档文本
def buildDocText(s):
    parts = []
    if s.get("name"): parts.append(f"技能名：{s['name']}")
    if s.get("info"): parts.append(f"描述：{s['info']}")
    if s.get("tags") and len(s["tags"]): parts.append("标签：" + "、".join(str(x) for x in s["tags"]))
    if s.get("enable") and len(s["enable"]): parts.append("类型：" + "、".join(str(x) for x in s["enable"]))
    if s.get("trigger"):
        evts = []
        for k, v in s["trigger"].items():
            for e in v: evts.append(f"{k}:{e}")
        if evts: parts.append("时机：" + "、".join(evts))
    if s.get("apis") and len(s["apis"]): parts.append("API：" + "、".join(str(x) for x in s["apis"]))
    return "\n".join(parts)

# 正对: 描述A <-> A文档；负对: 描述A <-> 随机B文档
import random
random.seed(42)
train_samples = []
ids = list(range(len(usable)))
for i, s in enumerate(usable):
    doc = buildDocText(s)
    train_samples.append(InputExample(texts=[s["info"], doc], label=1.0))
    # 负例: 随机异技能（不同组）
    for _ in range(1):
        j = random.choice(ids)
        while j == i or not usable[j].get("info"):
            j = random.choice(ids)
        train_samples.append(InputExample(texts=[s["info"], buildDocText(usable[j])], label=0.0))
print(f"训练样本: {len(train_samples)} (正{len(usable)} 负{len(usable)})")

# 加载基座
word_emb = models.Transformer(PT_MODEL_DIR, model_args={})
pooling = models.Pooling(word_emb.get_word_embedding_dimension(), pooling_mode="mean")
model = SentenceTransformer(modules=[word_emb, pooling])
print(f"基座加载完成: {model.get_sentence_embedding_dimension()} 维")

batch_size = 4
loader = DataLoader(train_samples, batch_size=batch_size, shuffle=True)
loss = losses.CosineSimilarityLoss(model)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"设备: {device}")
model.to(device)

EPOCHS = 1
WARMUP = int(len(loader) * EPOCHS * 0.05)
print(f"训练: {EPOCHS} epochs, warmup {WARMUP}, batch {batch_size}")

# 限制序列长度避免 OOM（4GB GPU）
model.max_seq_length = 256

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