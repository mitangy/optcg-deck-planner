"""Export a trained embedder checkpoint to ONNX (input 1x3x224x160, output unit vector).

  python scripts/train-embedder/export_onnx.py --ckpt .scan-build/models/embedder_s128.pt --out .scan-build/models/card-embedder.onnx
"""
import argparse, os, sys
import torch
sys.path.insert(0, os.path.dirname(__file__))
from train import Embedder, IN_H, IN_W

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--dim", type=int, default=128); ap.add_argument("--arch", default="small")
a = ap.parse_args()
m = Embedder(a.dim, a.arch)
m.load_state_dict(torch.load(a.ckpt, map_location="cpu"))
m.eval()
torch.onnx.export(m, torch.zeros(1, 3, IN_H, IN_W), a.out, input_names=["input"], output_names=["embedding"],
                  opset_version=17, dynamo=False)
print(a.out, os.path.getsize(a.out) / 1e6, "MB")
