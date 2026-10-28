#!/usr/bin/env python3
"""Fine-tune YOLO11n-pose (4 card-corner keypoints) on generated scenes (#701).

CPU training is slow (~0.2 s/img at 512), so instead of many epochs over one
dataset this trains in ROUNDS: each round is a *fresh* generated dataset
(different seed), starting from the previous round's weights. Fresh scenes
every few epochs act as unlimited augmentation without repeating images.

    python train.py --rounds /tmp/det-r1 /tmp/det-r2 /tmp/det-r3 --epochs 8 --out /tmp/det-runs
"""
import argparse, os, shutil
import numpy as np
from ultralytics import YOLO


def allow_off_frame_keypoints():
    """Let corners lie outside the photo (#789).

    A card cut by the frame still has four corners; the generator writes them as
    (v + 0.5) / 2 because ultralytics rejects label coordinates outside [0, 1].
    Undo that on load, and stop ultralytics from zeroing the visibility of (and
    clipping) keypoints that leave the image, which would turn them into
    unsupervised corners. Written against ultralytics 8.4.x."""
    from ultralytics.data import dataset as D
    from ultralytics.data.augment import RandomPerspective
    from ultralytics.utils import instance

    verify = D.verify_image_label

    def verify_decoded(args):
        r = list(verify(args))
        kp = r[4]
        if kp is not None and len(kp):
            kp = kp.copy()
            kp[..., :2] = kp[..., :2] * 2 - 0.5
            r[4] = kp
        return tuple(r)

    D.verify_image_label = verify_decoded

    clip = instance.Instances.clip

    def clip_keep_keypoints(self, w, h, *a, **k):
        kp = None if self.keypoints is None else self.keypoints.copy()
        clip(self, w, h, *a, **k)
        if kp is not None:
            self.keypoints = kp

    instance.Instances.clip = clip_keep_keypoints

    def apply_keypoints(self, keypoints, M, size):
        n, nkpt = keypoints.shape[:2]
        if n == 0:
            return keypoints
        xy = np.ones((n * nkpt, 3), dtype=keypoints.dtype)
        xy[:, :2] = keypoints[..., :2].reshape(n * nkpt, 2)
        xy = xy @ M.T
        xy = xy[:, :2] / xy[:, 2:3]
        return np.concatenate([xy, keypoints[..., 2].reshape(n * nkpt, 1)], axis=-1).reshape(n, nkpt, 3)

    RandomPerspective.apply_keypoints = apply_keypoints


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
    allow_off_frame_keypoints()
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
            mosaic=0.0,  # mosaic and translate cut cards at tile edges by rules that differ from the generator's
            
            close_mosaic=0,
            scale=0.2,
            translate=0.0,
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
