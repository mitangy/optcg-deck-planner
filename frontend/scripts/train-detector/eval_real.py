#!/usr/bin/env python3
"""Score a YOLO-pose .pt/.onnx on the real photos (quads.json = hand-labelled top cards).

    python eval_real.py weights.pt [--imgsz 640] [--conf 0.25] [--out /tmp/overlays]
"""
import argparse, json, os, sys
import cv2, numpy as np
from ultralytics import YOLO

PHOTOS = os.path.join(os.path.dirname(__file__), "../../.scan-build/real-photos")


def poly_iou(a, b):
    a = np.float32(a); b = np.float32(b)
    area, inter = cv2.intersectConvexConvex(a, b)
    ua = cv2.contourArea(a) + cv2.contourArea(b) - area
    return area / ua if ua > 0 else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("weights")
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--out", default="/tmp/real-overlays")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    gt = json.load(open(os.path.join(PHOTOS, "quads.json")))
    m = YOLO(a.weights)
    tot_found = tot_gt = tot_fp = 0
    for name, items in gt.items():
        path = os.path.join(PHOTOS, name)
        im = cv2.imread(path)
        r = m.predict(path, imgsz=a.imgsz, conf=a.conf, device="cpu", verbose=False, iou=0.5)[0]
        dets = []
        if r.keypoints is not None:
            for k, c in zip(r.keypoints.xy.cpu().numpy(), r.boxes.conf.cpu().numpy()):
                dets.append((k, float(c)))
        used = set(); found = 0; ious = []
        for it in items:
            q = [[p["x"], p["y"]] for p in it["quad"]]
            best, bi = 0, -1
            for i, (k, c) in enumerate(dets):
                v = poly_iou(q, k)
                if v > best: best, bi = v, i
            ious.append(best)
            if best >= 0.5:
                found += 1; used.add(bi)
        fp = len(dets) - len(used)
        tot_found += found; tot_gt += len(items); tot_fp += fp
        print(f"{name}: found {found}/{len(items)}  fp {fp}  IoUs {[round(x, 2) for x in ious]}")
        for it in items:
            cv2.polylines(im, [np.int32([[p["x"], p["y"]] for p in it["quad"]])], True, (0, 255, 0), 5)
        for i, (k, c) in enumerate(dets):
            col = (0, 0, 255) if i not in used else (255, 128, 0)
            cv2.polylines(im, [np.int32(k)], True, col, 4)
            cv2.circle(im, tuple(np.int32(k[0])), 12, col, -1)
            cv2.putText(im, f"{c:.2f}", tuple(np.int32(k[0]) + [0, -14]), 0, 1.2, col, 3)
        s = 1600 / max(im.shape)
        cv2.imwrite(os.path.join(a.out, name), cv2.resize(im, None, fx=s, fy=s))
    print(f"TOTAL found {tot_found}/{tot_gt}  fp {tot_fp}")


if __name__ == "__main__":
    main()
