"""Rank real user crops against the reference images with one or more embedder ONNX files (#852).

Preprocessing matches src/scanner/match/cardEmbed.ts embedderInput: RGB, area-resample the whole
image to 160x224, /255, ImageNet mean/std, NCHW. Rank refs by cosine; a crop counts
as correct at rank k when any reference with its card_id is in the top k.

  python eval_crops.py --refs .scan-build/refs --crops .scan-build/crops --split test \\
      --model old=old.onnx --model new=new.onnx --out metrics.json

`--model` takes `path` or `label=path`. Prints only metrics (never card ids).
"""
import argparse, json, os
import cv2, numpy as np, onnxruntime as ort

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
W, H = 160, 224


def prep(path):
    im = cv2.imread(path)
    if im is None: return None
    f = cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2RGB), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    return ((f - MEAN) / STD).transpose(2, 0, 1)


def embed(sess, tensors, bs=64):
    name = sess.get_inputs()[0].name; out = []
    for i in range(0, len(tensors), bs):
        out.append(np.concatenate([sess.run(None, {name: t[None]})[0] for t in tensors[i:i + bs]]))
    e = np.concatenate(out)
    return e / np.linalg.norm(e, axis=1, keepdims=True)


def load(dir_, split=None):
    items, tensors = [], []
    for e in json.load(open(os.path.join(dir_, "index.json"))):
        if split and e.get("split") != split: continue
        t = prep(os.path.join(dir_, e["file"]))
        if t is not None: items.append(e["card_id"]); tensors.append(t)
    return items, tensors


def ranks_for(ref_emb, ref_ids, crop_emb, crop_ids):
    ref_ids = np.array(ref_ids); out = []
    for q, cid in zip(crop_emb, crop_ids):
        order = np.argsort(-(ref_emb @ q), kind="stable")
        hit = np.nonzero(ref_ids[order] == cid)[0]
        if len(hit): out.append(int(hit[0]))
    return out


def summarize(ranks):
    n = len(ranks)
    if not n: return {"n": 0, "top1": 0.0, "top5": 0.0, "mean_rank": None}
    r = np.array(ranks)
    return {"n": n, "top1": float((r < 1).mean()), "top5": float((r < 5).mean()), "mean_rank": float(r.mean() + 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refs", required=True); ap.add_argument("--crops", required=True)
    ap.add_argument("--split", default="test"); ap.add_argument("--out", required=True)
    ap.add_argument("--model", action="append", required=True)
    a = ap.parse_args()
    ref_ids, ref_t = load(a.refs)
    crop_ids, crop_t = load(a.crops, a.split)
    have = set(ref_ids)
    keep = [i for i, c in enumerate(crop_ids) if c in have]  # a crop of a card with no reference cannot be ranked
    crop_ids = [crop_ids[i] for i in keep]; crop_t = [crop_t[i] for i in keep]
    print(f"refs {len(ref_ids)} crops({a.split}) {len(crop_ids)}", flush=True)
    res = {"split": a.split, "refs": len(ref_ids), "models": {}}
    for spec in a.model:
        label, _, path = spec.partition("=") if "=" in spec else (spec, "", spec)
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        m = summarize(ranks_for(embed(sess, ref_t), ref_ids, embed(sess, crop_t) if crop_t else [], crop_ids))
        res["models"][label] = m
        print(label, json.dumps(m), flush=True)
    json.dump(res, open(a.out, "w"), indent=2)
