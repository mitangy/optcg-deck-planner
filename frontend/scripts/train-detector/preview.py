#!/usr/bin/env python3
"""Montage of generated scenes with their labels drawn, for eyeballing the generator."""
import sys, glob, os, cv2, numpy as np
d, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 12
split = sys.argv[4] if len(sys.argv) > 4 else "train"
fs = sorted(glob.glob(f"{d}/images/{split}/*.jpg"))[:n]
tiles = []
for f in fs:
    im = cv2.imread(f)
    s = im.shape[0]
    lf = f.replace("images", "labels").replace(".jpg", ".txt")
    for line in open(lf).read().split("\n"):
        v = line.split()
        if len(v) < 17: continue
        k = np.array(v[5:], float).reshape(4, 3)[:, :2] * s
        cv2.polylines(im, [np.int32(k)], True, (0, 255, 0), 2)
        cv2.circle(im, tuple(np.int32(k[0])), 5, (0, 0, 255), -1)
    tiles.append(cv2.resize(im, (400, 400)))
cols = 4
rows = [np.hstack(tiles[i:i + cols] + [np.zeros_like(tiles[0])] * (cols - len(tiles[i:i + cols]))) for i in range(0, len(tiles), cols)]
cv2.imwrite(out, np.vstack(rows))
