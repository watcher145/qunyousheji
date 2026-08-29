# -*- coding: utf-8 -*-
"""导出微调后的 embedding 模型为 ONNX（供 transformers.js / Node 加载）"""
import os
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE_DIR, "models", "tuned-bge-zh-v2")
OUT = os.path.join(BASE_DIR, "models", "tuned-bge-zh-onnx")

print(f"导出 {SRC} -> {OUT}")
model = ORTModelForFeatureExtraction.from_pretrained(SRC, export=True)
tokenizer = AutoTokenizer.from_pretrained(SRC)
model.save_pretrained(OUT)
tokenizer.save_pretrained(OUT)
print("ONNX 导出完成:")
for f in os.listdir(OUT):
    p = os.path.join(OUT, f)
    print(f"  {f} ({os.path.getsize(p)})")