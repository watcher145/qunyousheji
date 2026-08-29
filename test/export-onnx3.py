# -*- coding: utf-8 -*-
import os
import shutil
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "models", "tuned-bge-zh-v3")
OUT = os.path.join(BASE, "models", "tuned-bge-zh-v3-onnx")
if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
print("export v3")
m = ORTModelForFeatureExtraction.from_pretrained(SRC, export=True)
t = AutoTokenizer.from_pretrained(SRC)
m.save_pretrained(OUT)
t.save_pretrained(OUT)
d = os.path.join(OUT, "onnx")
os.makedirs(d, exist_ok=True)
s = os.path.join(OUT, "model.onnx")
if os.path.exists(s):
    shutil.move(s, os.path.join(d, "model.onnx"))
print("done", os.listdir(OUT))