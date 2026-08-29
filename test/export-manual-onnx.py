# -*- coding: utf-8 -*-
"""
导出 v3 embedding 模型为 ONNX（手动 torch.onnx.export，opset=14）
绕开 optimum/transformers 版本兼容问题
transformers.js 期望结构: <model>/onnx/model.onnx + tokenizer.json
"""
import os
import shutil
import torch
import numpy as np
from transformers import AutoModel, AutoTokenizer

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "models", "tuned-bge-zh-v3")
OUT = os.path.join(BASE, "models", "tuned-bge-zh-v3-onnx")

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(out_dir := os.path.join(OUT, "onnx"), exist_ok=True)

print(f"加载 {SRC}")
tokenizer = AutoTokenizer.from_pretrained(SRC)
model = AutoModel.from_pretrained(SRC)
model.eval()

# 直接导出 BERT 本体（输出 last_hidden_state），由 transformers.js 端 mean_pooling
seq = 64
dummy_ids = torch.randint(0, tokenizer.vocab_size, (1, seq), dtype=torch.long)
dummy_mask = torch.ones((1, seq), dtype=torch.long)

print("导出 ONNX opset=14（BERT 本体）...")
torch.onnx.export(
    model,
    (dummy_ids, dummy_mask),
    os.path.join(out_dir, "model.onnx"),
    input_names=["input_ids", "attention_mask"],
    output_names=["last_hidden_state"],
    dynamic_axes={
        "input_ids": {0: "batch", 1: "seq"},
        "attention_mask": {0: "batch", 1: "seq"},
        "last_hidden_state": {0: "batch", 1: "seq"},
    },
    opset_version=14,
)
# 配套文件
for f in ["tokenizer.json", "config.json", "tokenizer_config.json", "special_tokens_map.json"]:
    p = os.path.join(SRC, f)
    if os.path.exists(p):
        shutil.copy(p, os.path.join(OUT, f))

# 校验导出的 onnx 可用
import torch.nn.functional as F
import onnxruntime as ort
sess = ort.InferenceSession(os.path.join(out_dir, "model.onnx"), providers=["CPUExecutionProvider"])
feeds = {
    "input_ids": dummy_ids.numpy(),
    "attention_mask": dummy_mask.numpy(),
}
out = sess.run(["last_hidden_state"], feeds)[0]
print("ONNX 校验:", out.shape)
print("完成:", os.listdir(OUT), "onnx/", os.listdir(out_dir))