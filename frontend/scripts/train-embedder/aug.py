"""Augmentations that imitate a phone photo of a card behind a sleeve or toploader.

The reference is a clean TCGPlayer scan; the query is a rectified crop of a
photo: wrong scale and blur, a hazy sleeve that lowers contrast and tints,
glare blobs, a slightly wrong quad (so the card edge is cut or a margin shows),
sometimes an overlapping neighbour, and sometimes upside down.
"""
import cv2
import numpy as np


def _lowfreq(rng, h, w, scale=6):
    n = rng.random((scale, max(2, int(scale * w / h))), dtype=np.float32)
    return cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)


def query_view(img, rng, out_w, out_h, heavy=True):
    """img: HxWx3 uint8 RGB (reference). Returns float32 HxWx3 in [0,1], size out_h x out_w."""
    h, w = img.shape[:2]
    f = img
    # quad error: jitter the four corners, optionally pull the crop inside/outside the card
    j = 0.035 if heavy else 0.008
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = src + rng.uniform(-j, j, (4, 2)).astype(np.float32) * np.float32([w, h])
    bg = rng.integers(40, 200, 3).tolist()
    f = cv2.warpPerspective(f, cv2.getPerspectiveTransform(dst, src), (w, h), flags=cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_CONSTANT, borderValue=bg)
    # resolution loss: shrink to what a 250-450 px card in a photo really has, then blur
    if heavy:
        s = rng.uniform(0.45, 1.0)
        f = cv2.resize(f, (max(24, int(w * s)), max(34, int(h * s))), interpolation=cv2.INTER_AREA)
        sig = rng.uniform(0, 1.6)
        if sig > 0.2:
            f = cv2.GaussianBlur(f, (0, 0), sig)
    f = cv2.resize(f, (out_w, out_h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    H, W = out_h, out_w
    if heavy:
        # sleeve haze: spatially varying blend toward a light/tinted colour, contrast squash
        if rng.random() < 0.7:
            a = np.clip(_lowfreq(rng, H, W) * rng.uniform(0.2, 0.7), 0, 0.6)[..., None]
            tint = np.clip(rng.uniform(0.7, 1.0, 3) + rng.uniform(-0.05, 0.1, 3) * np.array([1.0, -0.5, 0.3]), 0, 1)
            f = f * (1 - a) + tint * a
        c = rng.uniform(0.6, 1.1)
        f = (f - 0.5) * c + 0.5
        # glare blobs
        for _ in range(rng.integers(0, 3)):
            cx, cy = rng.uniform(0, W), rng.uniform(0, H)
            sx, sy = rng.uniform(0.08, 0.5) * W, rng.uniform(0.08, 0.5) * H
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            g = np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2) / 2)[..., None]
            f = f + g * rng.uniform(0.15, 0.7) * np.array([1.0, 0.98, 0.9])
        # overlapping neighbour or sticker
        if rng.random() < 0.2:
            x0, y0 = int(rng.uniform(0, 0.8) * W), int(rng.uniform(0, 0.8) * H)
            x1, y1 = x0 + int(rng.uniform(0.1, 0.4) * W), y0 + int(rng.uniform(0.1, 0.4) * H)
            f[y0:y1, x0:x1] = rng.uniform(0.1, 0.9, 3)
        # colour cast / gamma / saturation
        f = f * rng.uniform(0.85, 1.15, 3)
        f = np.clip(f, 0, 1) ** rng.uniform(0.75, 1.3)
        gray = f.mean(axis=2, keepdims=True)
        f = gray + (f - gray) * rng.uniform(0.5, 1.2)
        f = f + rng.normal(0, rng.uniform(0, 0.03), f.shape)
    f = np.clip(f, 0, 1).astype(np.float32)
    if heavy and rng.random() < 0.5:
        f = f[::-1, ::-1]
    return np.ascontiguousarray(f)
