# -*- coding: utf-8 -*-
"""Python 端三模型评测：基座 vs v1 vs v2 vs v3（不经 ONNX，直接 SentenceTransformer）"""
import json, os, sys
import numpy as np
from sentence_transformers import SentenceTransformer

BASE = os.path.dirname(os.path.abspath(__file__))
PT = r"C:\Users\25040\AppData\Local\Temp\opencode\bge-pt"

corpus = json.load(open(os.path.join(BASE, "skills-corpus.json"), encoding="utf-8"))
usable = [s for s in corpus if s.get("info") and len(s["info"]) >= 10]
print(f"语料: {len(usable)}")

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

CASES = [
    ("你可以将本回合弃牌堆两张基本牌置于牌堆两侧，视为使用一张基本牌", ["视为", "基本牌"]),
    ("当你使用牌后，你可以明置一张手牌，你使用明置牌无距离和次数限制", ["明置", "无距离"]),
    ("当你的体力值变化后，你暗置明置牌中一个类别的牌", ["体力值", "明置"]),
    ("当你进入濒死状态时，你可以令一名其他角色获得你的技能", ["濒死", "技能"]),
    ("出牌阶段限一次，你可以与一名其他角色拼点", ["拼点"]),
    ("结束阶段，你可以摸一张牌并重复至手牌数全场唯一", ["手牌数", "摸"]),
    ("当你使用杀指定目标后，你可以将其一张牌移出游戏至回合结束", ["移出", "回合结束"]),
    ("准备阶段，其他角色可以依次请求与你交换手牌", ["交换", "手牌"]),
    ("你使用的牌无距离和次数限制", ["无距离", "次数限制"]),
    ("当你的手牌被弃置后，你可以获得其中一张牌", ["弃置", "获得"]),
    ("当你成为其他角色使用牌的目标时，你可以令此牌对你无效", ["目标", "无效"]),
    ("每轮限一次，当你造成伤害后，你可以获得其一张牌", ["造成伤害", "获得"]),
]

models = {
    "base": SentenceTransformer(PT),
    "v1": SentenceTransformer(os.path.join(BASE, "models", "tuned-bge-zh")),
    "v2": SentenceTransformer(os.path.join(BASE, "models", "tuned-bge-zh-v2")),
    "v3": SentenceTransformer(os.path.join(BASE, "models", "tuned-bge-zh-v3")),
}
print("所有模型已加载")

docs = [buildDocText(s) for s in usable]
for name, model in models.items():
    model.max_seq_length = 256
    # 语料向量
    print(f"计算 {name} 语料向量...")
    doc_vecs = model.encode(docs, batch_size=32, convert_to_numpy=True, show_progress_bar=False)
    top1 = top3 = top5 = 0
    for desc, kws in CASES:
        qv = model.encode([desc], convert_to_numpy=True)[0]
        qn = np.linalg.norm(qv)
        sims = doc_vecs @ qv / (np.linalg.norm(doc_vecs, axis=1) * qn + 1e-9)
        top5i = np.argsort(sims)[::-1][:5]
        def rel(n):
            return any(any(k in usable[j]["info"] for k in kws) for j in top5i[:n])
        top1 += rel(1); top3 += rel(3); top5 += rel(5)
    n = len(CASES)
    print(f"== {name}: Top1 {top1/n*100:.0f}% | Top3 {top3/n*100:.0f}% | Top5 {top5/n*100:.0f}%")
    del doc_vecs