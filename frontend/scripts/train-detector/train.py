#!/usr/bin/env python3
"""Fine-tune YOLO11n-pose (4 card-corner keypoints) on generated scenes (#701).

CPU training is slow (~0.2 s/img at 512), so instead of many epochs over one
dataset this trains in ROUNDS: each round is a *fresh* generated dataset
(different seed), starting from the previous round's weights. Fresh scenes
every few epochs act as unlimited augmentation without repeating images.

    python train.py --rounds /tmp/det-r1 /tmp/det-r2 /tmp/det-r3 --epochs 8 --out /tmp/det-runs
"""
import argparse, os, shutil
from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", nargs="+", required=True, help="dataset dirs (each has data.yaml)")
    ap.add_argument("--epochs", type=int, default=8, help="epochs per round")
    ap.add_argument("--imgsz", type=int, default=512)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--base", default="yolo11n-pose.pt")
    ap.add_argument("--out", default="/tmp/det-runs")
    ap.add_argument("--resume-from", default=None, help="weights to start from instead of --base")
    a = ap.parse_args()
    weights = a.resume_from or a.base
    for i, d in enumerate(a.rounds):
        m = YOLO(weights)
        last = i == len(a.rounds) - 1
        m.train(
            data=os.path.join(d, "data.yaml"),
            epochs=a.epochs,
            imgsz=a.imgsz,
            batch=a.batch,
            device="cpu",
            project=a.out,
            name=f"round{i + 1}",
            exist_ok=True,
            optimizer="AdamW",
            lr0=0.002 if i == 0 and not a.resume_from else 0.001,
            lrf=0.2 if not last else 0.05,
            warmup_epochs=1.0 if i == 0 else 0.0,
            # the generator already rotates, tilts and scales; flips would
            # swap corner identities, so keep them off
            fliplr=0.0,
            flipud=0.0,
            degrees=0.0,
            mosaic=0.3,
            close_mosaic=0,
            scale=0.35,
            translate=0.1,
            hsv_h=0.02,
            hsv_s=0.5,
            hsv_v=0.35,
            plots=False,
            patience=100,
        )
        weights = os.path.join(a.out, f"round{i + 1}", "weights", "last.pt")
        shutil.copy(weights, os.path.join(a.out, f"round{i + 1}.pt"))
    print("final weights:", weights)


if __name__ == "__main__":
    main()
