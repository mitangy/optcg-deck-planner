#!/usr/bin/env python3
"""Synthetic training scenes for the learned card detector (#701).

Composites real card art onto varied backgrounds and writes YOLO *pose*
labels: one object per visible card face, four keypoints = the printed
card's own corners (TL, TR, BR, BL of the card as printed, so a rotated card
keeps its corner identities). The card face is what is labelled, never the
sleeve / toploader / slab / acrylic case around it.

    python gen_scenes.py --cards .scan-build/refs-train --textures /tmp/tex/ambient \
        --out /tmp/det-data --n 3000 --val 300 --seed 1

Scenes are square (SIZE x SIZE). The network is fully convolutional, so it
runs at the real photo's aspect at inference.

Ground-truth rule (applied consistently): a card is labelled when it is a
One Piece card face and at least VISIBLE_MIN of its area (default 35%,
`--visible-min`) is not covered by anything drawn in front of it. A partly
covered card gets its FULL printed quad (amodal: the hidden corners are where
the card's own geometry puts them) and a keypoint visibility flag of 1 for
every corner that is covered, 2 for corners that can be seen. Cards that are
less visible than that, face-down cards, non-One-Piece "distractor" cards and
boxes with printed art are NOT labelled.
"""
import argparse, glob, math, os, random, sys
from multiprocessing import Pool
import cv2
import numpy as np

SIZE = 640
VISIBLE_MIN = 0.35
OOF_MIN = 0.55  # a card cut by the photo's edge is labelled when this much of it is inside
CROP_PROB = 0.3  # share of scenes shown through a smaller window (cards run over the frame)
NON_OP_PILE = 0.07  # share of table piles made of non-One-Piece cards (--non-op-piles)
DISTRACTOR_ON_CARDS = 0.0  # share of distractors dropped right next to / under a card (--hard-negatives)
CARD_ASPECT = 63.0 / 88.0
rng = random.Random()  # re-seeded per scene


# ----------------------------------------------------------------- helpers
def U(a, b):
    return rng.uniform(a, b)


def logU(a, b):
    return math.exp(rng.uniform(math.log(a), math.log(b)))


def read(path, flags=cv2.IMREAD_COLOR):
    return cv2.imread(path, flags)


def rr(sw, sh, x0, y0, x1, y1, r):
    """Anti-aliased rounded-rect coverage mask (float32 HxW)."""
    ys, xs = np.mgrid[0:sh, 0:sw].astype(np.float32)
    xs += 0.5
    ys += 0.5
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hw, hh = (x1 - x0) / 2, (y1 - y0) / 2
    r = min(r, hw, hh)
    dx = np.maximum(np.abs(xs - cx) - (hw - r), 0)
    dy = np.maximum(np.abs(ys - cy) - (hh - r), 0)
    d = np.hypot(dx, dy) - r
    return np.clip(0.5 - d, 0, 1)


class Layer:
    """Premultiplied RGBA float canvas."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.pm = np.zeros((h, w, 3), np.float32)
        self.a = np.zeros((h, w), np.float32)

    def paint(self, color, mask, opacity=1.0):
        m = np.clip(mask * opacity, 0, 1)
        col = np.asarray(color, np.float32).reshape(1, 1, 3)
        self.pm = col * m[..., None] + self.pm * (1 - m[..., None])
        # premultiplied "over": src_pm = col*m, dst scaled by (1-m)
        self.a = m + self.a * (1 - m)

    def paint_img(self, img, mask, x, y):
        """Paste a BGR image (float32) with mask at integer (x, y)."""
        h, w = img.shape[:2]
        x0, y0 = max(x, 0), max(y, 0)
        x1, y1 = min(x + w, self.w), min(y + h, self.h)
        if x1 <= x0 or y1 <= y0:
            return
        sub = img[y0 - y : y1 - y, x0 - x : x1 - x]
        m = mask[y0 - y : y1 - y, x0 - x : x1 - x]
        self.pm[y0:y1, x0:x1] = sub * m[..., None] + self.pm[y0:y1, x0:x1] * (1 - m[..., None])
        self.a[y0:y1, x0:x1] = m + self.a[y0:y1, x0:x1] * (1 - m)

    def overlay_tint(self, color, mask, opacity):
        """Tint what is already drawn (does not change coverage)."""
        m = np.clip(mask * opacity, 0, 1) * (self.a > 0.01)
        col = np.asarray(color, np.float32).reshape(1, 1, 3) * self.a[..., None]
        self.pm = self.pm * (1 - m[..., None]) + col * m[..., None]


def gloss_mask(w, h, strength):
    ang = U(0, math.pi)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (xs * math.cos(ang) + ys * math.sin(ang)) / max(w, h)
    c = U(-0.2, 1.0)
    width = U(0.05, 0.25)
    m = np.exp(-(((t - c) / width) ** 2))
    if rng.random() < 0.4:
        c2 = U(-0.2, 1.0)
        m = np.maximum(m, 0.6 * np.exp(-(((t - c2) / (width * 0.5)) ** 2)))
    return (m * strength).astype(np.float32)


SLEEVE_COLORS = [
    (190, 150, 240), (150, 150, 250), (40, 40, 40), (230, 140, 60), (60, 60, 220), (240, 240, 240),
    (80, 180, 240), (90, 200, 120), (200, 90, 160), (160, 160, 160), (60, 200, 230), (200, 60, 60),
]


def round_card(card, cw, ch):
    """Card art resized, with the printed rounded corners masked."""
    img = cv2.resize(card, (cw, ch), interpolation=cv2.INTER_AREA).astype(np.float32)
    mask = rr(cw, ch, 0, 0, cw, ch, 0.05 * cw)
    return img, mask


def foil(img):
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    hue = ((xs + ys) / (w + h) * U(1, 3) * 180) % 180
    hsv = np.dstack([hue, np.full_like(hue, 160), np.full_like(hue, 255)]).astype(np.uint8)
    rainbow = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR).astype(np.float32)
    a = U(0.08, 0.28)
    return img * (1 - a) + rainbow * a


def gold_frame(img):
    """Gold-bordered alt art: a thick metallic frame on the card's edge."""
    h, w = img.shape[:2]
    t = max(3, int(w * U(0.035, 0.07)))
    m = np.ones((h, w), np.float32)
    m[t : h - t, t : w - t] = 0
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    shine = 0.75 + 0.25 * np.sin((xs + ys) / max(w, h) * U(4, 12))
    gold = np.dstack([np.full((h, w), 60, np.float32), 175 * shine, 225 * shine]) * U(0.85, 1.1)
    m = cv2.GaussianBlur(m, (0, 0), 0.8)[..., None]
    return img * (1 - m) + gold * m


def text_mask(w, h, words, scale, thick=1):
    m = np.zeros((h, w), np.uint8)
    y = int(h * 0.3)
    for wd in words:
        cv2.putText(m, wd, (int(w * 0.06), y), cv2.FONT_HERSHEY_SIMPLEX, scale, 255, thick, cv2.LINE_AA)
        y += int(scale * 28) + 4
        if y > h:
            break
    return m.astype(np.float32) / 255


def rand_words(n):
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return ["".join(rng.choice(letters) for _ in range(rng.randint(3, 10))) for _ in range(n)]


def watermark(img, strength=None):
    """Big translucent "SAMPLE" across the middle, like the reference art carries.

    Nearly every training card image has it and no real photo does, so it is
    also put on things that are NOT cards, so it cannot become a shortcut."""
    h, w = img.shape[:2]
    m = np.zeros((h, w), np.uint8)
    scale = w / 135.0
    cv2.putText(m, "SAMPLE", (int(w * 0.03), int(h * U(0.5, 0.62))), cv2.FONT_HERSHEY_DUPLEX, scale, 255, max(2, int(scale * 3)), cv2.LINE_AA)
    a = (m.astype(np.float32) / 255 * (strength if strength is not None else U(0.35, 0.65)))[..., None]
    return img * (1 - a) + 255 * a


# ------------------------------------------------- non-One-Piece faces (#789)
# Procedural stand-ins for other games' cards and for product box art. They
# have to look like the real thing at phone-photo size (art box, name bar, text
# box, borders, icons), vary a lot, and never reuse One Piece's own frame.
FONT = cv2.FONT_HERSHEY_SIMPLEX


def _col(lo=0, hi=255):
    return np.array([U(lo, hi), U(lo, hi), U(lo, hi)], np.float32)


def _blend(out, x0, y0, x1, y1, col, a=1.0):
    x0, y0, x1, y1 = max(int(x0), 0), max(int(y0), 0), min(int(x1), out.shape[1]), min(int(y1), out.shape[0])
    if x1 > x0 and y1 > y0:
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - a) + np.asarray(col, np.float32) * a


def _vgrad(w, h, c1, c2):
    t = np.linspace(0, 1, max(h, 1), dtype=np.float32)[:, None, None]
    return np.asarray(c1, np.float32) * (1 - t) + np.asarray(c2, np.float32) * t + np.zeros((h, w, 3), np.float32)


def para(out, x0, y0, x1, y1, col, lh, alpha=0.75):
    """Lines of 'text' (word-shaped bars) filling a box."""
    h, w = out.shape[:2]
    m = np.zeros((h, w), np.uint8)
    lh = max(int(lh), 3)
    y = int(y0)
    while y + lh <= y1:
        xe = x1 - (rng.random() < 0.3) * U(0.05, 0.6) * (x1 - x0)
        x = x0
        while x < xe:
            wl = int(U(2.0, 6.5) * lh * 0.55)
            e = min(xe, x + wl)
            if e - x > 1:
                cv2.rectangle(m, (int(x), int(y + lh * 0.2)), (int(e), int(y + lh * 0.7)), 255, -1)
            x = e + lh * 0.35
        y += int(lh * 1.25)
    m = cv2.GaussianBlur(m, (0, 0), 0.6).astype(np.float32)[..., None] / 255 * alpha
    out[:] = out * (1 - m) + np.asarray(col, np.float32) * m


def label_text(out, text, x, y, scale, col, thick=1):
    h, w = out.shape[:2]
    m = np.zeros((h, w), np.uint8)
    cv2.putText(m, text[:14], (int(x), int(y)), FONT, scale * 0.55, 255, thick, cv2.LINE_AA)
    a = m.astype(np.float32)[..., None] / 255
    out[:] = out * (1 - a) + np.asarray(col, np.float32) * a


def proc_art(cards, aw, ah):
    """Art that is not One Piece's: recoloured crops, plasma, landscapes."""
    aw, ah = max(aw, 4), max(ah, 4)
    r = rng.random()
    if r < 0.4:
        b = read(rng.choice(cards))
        bh, bw = b.shape[:2]
        hh, ww = int(bh * U(0.2, 0.4)), int(bw * U(0.3, 0.6))
        y0, x0 = int(bh * U(0.1, 0.45)), int(bw * U(0.05, 0.4))
        art = cv2.resize(b[y0 : y0 + hh, x0 : x0 + ww], (aw, ah), interpolation=cv2.INTER_AREA).astype(np.float32)
        v = rng.random()
        if v < 0.4:
            hsv = cv2.cvtColor(art.astype(np.uint8), cv2.COLOR_BGR2HSV)
            hsv[..., 0] = (hsv[..., 0].astype(int) + rng.randint(25, 155)) % 180
            art = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR).astype(np.float32)
        elif v < 0.7:
            art = art[..., rng.choice([(1, 2, 0), (2, 0, 1), (2, 1, 0), (1, 0, 2)])]
        else:
            g = art.mean(2, keepdims=True)
            art = g * _col(120, 255)[None, None] / 200
        return art
    if r < 0.7:
        small = np.random.rand(rng.randint(3, 7), rng.randint(3, 7), 3).astype(np.float32)
        art = cv2.resize(small, (aw, ah), interpolation=cv2.INTER_CUBIC)
        art = art * U(120, 255) + U(0, 60)
        for _ in range(rng.randint(1, 5)):
            c = (rng.randint(0, aw), rng.randint(0, ah))
            cv2.circle(art, c, int(U(0.06, 0.3) * aw), tuple(float(v) for v in _col()), -1 if rng.random() < 0.5 else 2, cv2.LINE_AA)
        return cv2.GaussianBlur(art, (0, 0), U(0.5, 4))
    art = _vgrad(aw, ah, _col(80, 255), _col(20, 200))
    cv2.circle(art, (rng.randint(0, aw), int(ah * U(0.1, 0.5))), int(aw * U(0.05, 0.18)), tuple(float(v) for v in _col(200, 255)), -1, cv2.LINE_AA)
    for k in range(rng.randint(2, 4)):
        base = ah * (0.55 + 0.12 * k)
        pts = [(0, ah), (0, base)]
        n = rng.randint(4, 8)
        for i in range(n + 1):
            pts.append((aw * i / n, base - U(0.0, 0.3) * ah))
        pts.append((aw, ah))
        cv2.fillPoly(art, [np.int32(pts)], tuple(float(v) for v in _col(10, 150) * (0.6 + 0.2 * k)), cv2.LINE_AA)
    return art


def _art_box(out, x0, y0, x1, y1, cards, edge=None, edge_t=None):
    aw, ah = int(x1 - x0), int(y1 - y0)
    if aw < 6 or ah < 6:
        return
    art = proc_art(cards, aw, ah)
    out[int(y0) : int(y0) + ah, int(x0) : int(x0) + aw] = art
    if edge is not None:
        cv2.rectangle(out, (int(x0), int(y0)), (int(x1) - 1, int(y1) - 1), tuple(float(c) for c in edge), edge_t or max(1, aw // 60))


def _icons(out, cx, cy, r, n, step):
    for i in range(n):
        cv2.circle(out, (int(cx + i * step), int(cy)), int(r), tuple(float(c) for c in _col()), -1, cv2.LINE_AA)
        cv2.circle(out, (int(cx + i * step), int(cy)), int(r), (30, 30, 30), 1, cv2.LINE_AA)


def style_pokemon(cards, cw, ch):
    border = rng.choice([(50, 200, 240), (70, 190, 245), (60, 60, 60), (230, 230, 230), (140, 200, 90)]) if rng.random() < 0.8 else _col()
    out = np.zeros((ch, cw, 3), np.float32)
    out[:] = np.asarray(border, np.float32)
    m = int(cw * U(0.04, 0.065))
    inner = _vgrad(cw - 2 * m, ch - 2 * m, _col(120, 255), _col(120, 255)) if rng.random() < 0.7 else _col(150, 255)[None, None] + np.zeros((ch - 2 * m, cw - 2 * m, 3), np.float32)
    out[m : ch - m, m : cw - m] = inner
    y = m + ch * 0.015
    nbh = ch * 0.06
    dark = np.array([30, 30, 30], np.float32)
    label_text(out, rand_words(1)[0].title(), m + cw * 0.1, y + nbh, cw / 200, dark, 1)
    label_text(out, "HP%d" % rng.choice([60, 90, 120, 180, 250]), cw * 0.68, y + nbh * 0.85, cw / 300, (40, 40, 220), 1)
    _icons(out, cw * 0.9, y + nbh * 0.55, cw * 0.03, 1, 0)
    ya = y + nbh * 1.3
    ah = ch * U(0.3, 0.38)
    _art_box(out, m + cw * 0.03, ya, cw - m - cw * 0.03, ya + ah, cards, rng.choice([(150, 190, 200), (200, 200, 200), (60, 160, 210)]), max(2, cw // 40))
    ytxt = ya + ah + ch * 0.03
    label_text(out, rand_words(1)[0], m + cw * 0.06, ytxt + ch * 0.015, cw / 330, dark, 1)
    for k in range(rng.randint(1, 3)):
        yy = ytxt + ch * (0.05 + 0.11 * k)
        _icons(out, m + cw * 0.09, yy + ch * 0.02, cw * 0.03, rng.randint(1, 3), cw * 0.07)
        label_text(out, rand_words(1)[0].title(), m + cw * 0.3, yy + ch * 0.03, cw / 230, dark, 1)
        label_text(out, str(rng.choice([10, 20, 30, 50, 90, 120])), cw - m - cw * 0.17, yy + ch * 0.03, cw / 200, dark, 1)
        para(out, m + cw * 0.08, yy + ch * 0.045, cw - m - cw * 0.08, yy + ch * 0.1, dark, ch * 0.022)
    _blend(out, m, ch - m - ch * 0.075, cw - m, ch - m, dark, 0.15)
    para(out, m + cw * 0.05, ch - m - ch * 0.06, cw - m - cw * 0.05, ch - m - ch * 0.01, dark, ch * 0.02)
    return out


def style_mtg(cards, cw, ch):
    out = np.zeros((ch, cw, 3), np.float32)
    out[:] = np.array([rng.choice([18, 22, 235, 225])] * 3, np.float32) if rng.random() < 0.9 else _col()
    m = int(cw * U(0.04, 0.06))
    frame = _col(60, 230)
    out[m : ch - m, m : cw - m] = frame * U(0.8, 1.1)
    paper = np.array([U(215, 245), U(225, 248), U(232, 250)], np.float32)
    dark = np.array([25, 25, 25], np.float32)
    nb = int(ch * 0.065)
    y = int(m + ch * 0.012)
    _blend(out, m + cw * 0.02, y, cw - m - cw * 0.02, y + nb, paper, 0.9)
    label_text(out, rand_words(1)[0].title(), m + cw * 0.05, y + nb * 0.72, cw / 240, dark, 1)
    _icons(out, cw - m - cw * 0.12, y + nb * 0.5, cw * 0.022, rng.randint(1, 4), -cw * 0.05)
    ya = y + nb + ch * 0.008
    ah = ch * U(0.4, 0.46)
    _art_box(out, m + cw * 0.04, ya, cw - m - cw * 0.04, ya + ah, cards, (30, 30, 30), 2)
    yt = ya + ah + ch * 0.008
    _blend(out, m + cw * 0.02, yt, cw - m - cw * 0.02, yt + nb * 0.85, paper, 0.9)
    label_text(out, rand_words(1)[0].title() + " - " + rand_words(1)[0].title(), m + cw * 0.05, yt + nb * 0.6, cw / 300, dark, 1)
    yb = yt + nb * 0.85 + ch * 0.008
    ybe = ch - m - ch * 0.04
    _blend(out, m + cw * 0.04, yb, cw - m - cw * 0.04, ybe, paper * U(0.92, 1.0), 0.95)
    para(out, m + cw * 0.08, yb + ch * 0.015, cw - m - cw * 0.08, ybe - ch * 0.01, dark, ch * 0.027)
    if rng.random() < 0.6:
        _blend(out, cw - m - cw * 0.26, ybe - ch * 0.02, cw - m - cw * 0.04, ybe + ch * 0.025, paper, 0.95)
        label_text(out, "%d/%d" % (rng.randint(0, 9), rng.randint(1, 9)), cw - m - cw * 0.22, ybe + ch * 0.016, cw / 300, dark, 1)
    para(out, m + cw * 0.05, ybe + ch * 0.008, cw - m - cw * 0.3, ch - m - ch * 0.003, paper, ch * 0.016)
    return out


def style_ygo(cards, cw, ch):
    out = np.zeros((ch, cw, 3), np.float32)
    frame = rng.choice([(60, 130, 210), (50, 90, 150), (130, 70, 140), (90, 150, 90), (110, 150, 60), (80, 200, 230), (40, 40, 60), (170, 110, 70)])
    out[:] = _vgrad(cw, ch, np.array(frame) * 1.1, np.array(frame) * 0.8)
    m = int(cw * 0.035)
    cv2.rectangle(out, (0, 0), (cw - 1, ch - 1), (15, 15, 15), max(2, m // 2))
    dark = np.array([20, 20, 20], np.float32)
    label_text(out, rand_words(1)[0].title(), cw * 0.07, ch * 0.07, cw / 190, dark, 1)
    cv2.circle(out, (int(cw * 0.89), int(ch * 0.058)), int(cw * 0.05), tuple(float(c) for c in _col()), -1, cv2.LINE_AA)
    _icons(out, cw * 0.86, ch * 0.115, cw * 0.022, rng.randint(3, 8), -cw * 0.05)
    aw = cw * U(0.78, 0.84)
    ax = (cw - aw) / 2
    ay = ch * 0.145
    _art_box(out, ax, ay, ax + aw, ay + aw, cards, (60, 190, 230), max(2, cw // 45))
    yt = ay + aw + ch * 0.02
    _blend(out, cw * 0.06, yt, cw * 0.94, ch * 0.955, np.array([U(160, 215), U(195, 235), U(215, 245)], np.float32), 0.95)
    para(out, cw * 0.09, yt + ch * 0.015, cw * 0.91, ch * 0.935, dark, ch * 0.024)
    label_text(out, "ATK/%d DEF/%d" % (rng.randint(0, 40) * 100, rng.randint(0, 40) * 100), cw * 0.45, ch * 0.945, cw / 330, dark, 1)
    return out


def style_sports(cards, cw, ch):
    out = np.zeros((ch, cw, 3), np.float32)
    out[:] = _col(180, 255) if rng.random() < 0.6 else _col(10, 80)
    m = int(cw * U(0.03, 0.07))
    _art_box(out, m, m, cw - m, ch - m, cards)
    bh = ch * U(0.09, 0.16)
    y1 = ch - m - ch * U(0.0, 0.05)
    col = _col(20, 240)
    _blend(out, m, y1 - bh, cw - m * U(0.0, 3), y1, col, U(0.8, 1.0))
    label_text(out, rand_words(1)[0].title(), m * 2, y1 - bh * 0.35, cw / U(160, 230), 255 - col, 2)
    label_text(out, rand_words(1)[0], m * 2, y1 - bh * 0.75, cw / 340, 255 - col, 1)
    if rng.random() < 0.7:
        cv2.circle(out, (int(m * 3), int(m * 3)), int(cw * 0.07), tuple(float(c) for c in _col()), -1, cv2.LINE_AA)
    if rng.random() < 0.4:
        cv2.rectangle(out, (m, m), (cw - m, ch - m), tuple(float(c) for c in _col(150, 255)), max(1, cw // 60))
    return out


def style_fullart(cards, cw, ch):
    """Modern full-art card: art to the edge, cost orbs, a text panel over it, like the newest games (and a bit like ours)."""
    out = np.zeros((ch, cw, 3), np.float32)
    m = int(cw * U(0.02, 0.05))
    out[:] = _col(10, 240)
    _art_box(out, m, m, cw - m, ch - m, cards)
    dark = np.array([20, 20, 20], np.float32)
    ph = ch * U(0.2, 0.38)
    y0 = ch - m - ph - ch * U(0, 0.06)
    _blend(out, m, y0, cw - m, y0 + ph, rng.choice([dark, np.array([235, 235, 235], np.float32), _col(20, 140)]), U(0.55, 0.9))
    txtc = 240 if out[int(y0 + 2), int(cw / 2)].mean() < 128 else 25
    para(out, m + cw * 0.06, y0 + ph * 0.28, cw - m - cw * 0.06, y0 + ph * 0.95, np.array([txtc] * 3, np.float32), ch * 0.026)
    label_text(out, rand_words(1)[0].title(), m + cw * 0.08, y0 + ph * 0.2, cw / 210, np.array([txtc] * 3, np.float32), 1)
    for k in range(rng.randint(1, 3)):
        cv2.circle(out, (int(m + cw * (0.09 + 0.14 * k)), int(m + cw * 0.09)), int(cw * 0.065), tuple(float(c) for c in _col(20, 230)), -1, cv2.LINE_AA)
        cv2.circle(out, (int(m + cw * (0.09 + 0.14 * k)), int(m + cw * 0.09)), int(cw * 0.065), (240, 240, 240), 2, cv2.LINE_AA)
    cv2.rectangle(out, (m, m), (cw - m, ch - m), tuple(float(c) for c in _col(100, 255)), max(1, cw // 70))
    if rng.random() < 0.5:
        _blend(out, 0, 0, cw, m, _col(), 1.0)
        _blend(out, 0, ch - m, cw, ch, _col(), 1.0)
        _blend(out, 0, 0, m, ch, _col(), 1.0)
        _blend(out, cw - m, 0, cw, ch, _col(), 1.0)
    return out


def style_back(cards, cw, ch):
    out = np.zeros((ch, cw, 3), np.float32)
    base = _col(15, 200)
    out[:] = base
    m = int(cw * U(0.04, 0.08))
    out[m : ch - m, m : cw - m] = np.clip(base * U(0.5, 1.4), 0, 255)
    v = rng.random()
    cx, cy = cw // 2, ch // 2
    if v < 0.35:  # swirl / oval emblem
        cv2.ellipse(out, (cx, cy), (int(cw * U(0.2, 0.36)), int(cw * U(0.2, 0.36))), 0, 0, 360, tuple(float(c) for c in _col()), -1, cv2.LINE_AA)
        cv2.circle(out, (cx, cy), int(cw * 0.14), tuple(float(c) for c in _col()), 3, cv2.LINE_AA)
    elif v < 0.7:  # diamond lattice
        step = max(6, int(cw * U(0.05, 0.12)))
        c2 = tuple(float(c) for c in np.clip(base * U(0.3, 1.8) + 20, 0, 255))
        for k in range(-ch, cw + ch, step):
            cv2.line(out, (k, 0), (k + ch, ch), c2, 1, cv2.LINE_AA)
            cv2.line(out, (k + ch, 0), (k, ch), c2, 1, cv2.LINE_AA)
        cv2.ellipse(out, (cx, cy), (int(cw * 0.3), int(ch * 0.2)), 0, 0, 360, tuple(float(c) for c in _col()), -1, cv2.LINE_AA)
    else:  # logo text band
        _blend(out, m, ch * 0.4, cw - m, ch * 0.6, _col(), 0.9)
        label_text(out, rand_words(1)[0], cw * 0.18, ch * 0.54, cw / 130, _col(150, 255), 2)
    cv2.rectangle(out, (m, m), (cw - m, ch - m), tuple(float(c) for c in _col(150, 255)), max(1, cw // 70))
    return out


STYLES = [style_pokemon, style_mtg, style_ygo, style_sports, style_fullart, style_back]


def fake_card(cards, cw, ch):
    """A card that is NOT a One Piece card: another game's layout, procedurally drawn."""
    fn = rng.choices(STYLES, [22, 20, 14, 10, 22, 12])[0]
    out = fn(cards, cw, ch)
    if rng.random() < 0.12:
        out = foil(out)
    if rng.random() < 0.3:
        out = cv2.GaussianBlur(out, (0, 0), U(0.3, 0.9))
    if rng.random() < 0.3:
        out = watermark(out)
    return np.clip(out, 0, 255), rr(cw, ch, 0, 0, cw, ch, U(0.03, 0.06) * cw)


def card_back(cw, ch):
    return style_back(None, cw, ch), rr(cw, ch, 0, 0, cw, ch, 0.05 * cw)


def box_face(cards, cw, ch):
    """The front of a product box: a coloured panel with a logo band, a warning
    tag and a printed (smaller, slightly crooked) card on it, like the starter
    deck boxes behind the acrylic cases on a shop shelf."""
    out = _vgrad(cw, ch, _col(10, 230), _col(10, 230))
    dark = np.array([25, 25, 25], np.float32)
    lg = int(ch * U(0.06, 0.12))
    _blend(out, 0, ch * U(0.0, 0.1), cw, ch * U(0.0, 0.1) + lg, _col(0, 255), U(0.6, 1.0))
    label_text(out, rand_words(1)[0], cw * 0.06, ch * 0.1 + lg * 0.2, cw / U(120, 200), _col(190, 255), 2)
    pw = int(cw * U(0.5, 0.9))
    ph = int(pw / CARD_ASPECT)
    c = read(rng.choice(cards))
    c = cv2.resize(c, (pw, ph), interpolation=cv2.INTER_AREA).astype(np.float32)
    c = c * U(0.7, 1.0) + U(0, 25)
    if rng.random() < 0.5:  # printed art is slightly crooked
        M = cv2.getRotationMatrix2D((pw / 2, ph / 2), U(-9, 9), 1.0)
        pm = cv2.warpAffine(np.ones((ph, pw), np.float32), M, (pw, ph))
        c = cv2.warpAffine(c, M, (pw, ph))
    else:
        pm = rr(pw, ph, 0, 0, pw, ph, 0.05 * pw)
    px = int(U(-0.1, 0.35) * cw + cw * 0.05)
    py = int(U(0.15, 0.55) * ch)
    x0, y0 = max(px, 0), max(py, 0)
    x1, y1 = min(px + pw, cw), min(py + ph, ch)
    if x1 > x0 and y1 > y0:
        sub = c[y0 - py : y1 - py, x0 - px : x1 - px]
        mm = pm[y0 - py : y1 - py, x0 - px : x1 - px][..., None]
        out[y0:y1, x0:x1] = sub * mm + out[y0:y1, x0:x1] * (1 - mm)
    # tags, badges, barcode, small print
    if rng.random() < 0.8:
        _blend(out, cw * 0.04, ch * U(0.3, 0.5), cw * 0.36, ch * U(0.3, 0.5) + ch * 0.1, (235, 235, 235), 0.95)
        para(out, cw * 0.06, ch * 0.32, cw * 0.34, ch * 0.42, dark, ch * 0.022)
    for _ in range(rng.randint(0, 3)):
        cv2.circle(out, (int(U(0.1, 0.9) * cw), int(U(0.75, 0.95) * ch)), int(cw * U(0.04, 0.08)), tuple(float(c) for c in _col()), -1, cv2.LINE_AA)
    if rng.random() < 0.5:
        bx = int(cw * U(0.55, 0.8))
        _blend(out, bx, ch * 0.9, bx + cw * 0.18, ch * 0.97, (240, 240, 240), 0.95)
        for k in range(0, int(cw * 0.16), 3):
            cv2.line(out, (bx + 3 + k, int(ch * 0.91)), (bx + 3 + k, int(ch * 0.96)), (20, 20, 20), 1)
    if rng.random() < 0.4:
        out = watermark(out)
    gl = gloss_mask(cw, ch, U(0.0, 0.35))
    out = out + gl[..., None] * 255 * 0.5
    return np.clip(out, 0, 255), rr(cw, ch, 0, 0, cw, ch, U(1, 0.03 * cw))


# ----------------------------------------------------------- card sprites
class Sprite:
    def __init__(self, layer, quad, label, kind):
        self.layer, self.quad, self.label, self.kind = layer, quad, label, kind


def build_sprite(kind, face, cw, ch, label, sleeve_color=None):
    """Card face + its container, upright, at the scene's pixel scale."""
    img, mask = face
    pad = 5
    # --- geometry of the container around the card
    if kind == "sleeve":
        mx, mt, mb = cw * U(0.03, 0.085), ch * U(0.035, 0.1), ch * U(0.02, 0.07)
    elif kind == "clear_sleeve":
        mx, mt, mb = cw * U(0.02, 0.04), ch * U(0.02, 0.05), ch * U(0.015, 0.035)
    elif kind == "toploader":
        mx, mt, mb = cw * U(0.06, 0.11), ch * U(0.06, 0.1), ch * U(0.03, 0.06)
    elif kind == "pocket":
        mx, mt, mb = cw * U(0.025, 0.06), ch * U(0.02, 0.05), ch * U(0.02, 0.05)
    elif kind == "acrylic":
        mx, mt, mb = cw * U(0.07, 0.12), ch * U(0.05, 0.09), ch * U(0.05, 0.09)
    elif kind == "slab":
        mx, mt, mb = cw * U(0.14, 0.2), ch * U(0.36, 0.44), ch * U(0.07, 0.11)
    else:
        mx = mt = mb = 0
    mx, mt, mb = int(mx), int(mt), int(mb)
    sw, sh = cw + 2 * mx + 2 * pad, ch + mt + mb + 2 * pad
    L = Layer(sw, sh)
    ox, oy = pad + mx, pad + mt
    x0, y0, x1, y1 = pad, pad, sw - pad, sh - pad
    rad = 0.07 * cw
    outer = rr(sw, sh, x0, y0, x1, y1, rad)

    def stroke(t, inset=0.0):
        a = rr(sw, sh, x0 + inset, y0 + inset, x1 - inset, y1 - inset, max(rad - inset, 2))
        b = rr(sw, sh, x0 + inset + t, y0 + inset + t, x1 - inset - t, y1 - inset - t, max(rad - inset - t, 2))
        return np.clip(a - b, 0, 1)

    sleeved_img = img
    if kind == "sleeve":
        col = np.array(sleeve_color if sleeve_color is not None else rng.choice(SLEEVE_COLORS), np.float32)
        L.paint(col * U(0.85, 1.05), outer, U(0.9, 1.0))
        L.paint(col * 1.15 + 15, stroke(max(1.0, cw * 0.012), 0), 0.35)  # sleeve rim highlight
    elif kind == "clear_sleeve":
        L.paint((235, 235, 235), outer, U(0.08, 0.2))
        L.paint((250, 250, 250), stroke(1.5), 0.6)
        L.paint((60, 60, 60), stroke(1.0, 2.0), 0.25)
    elif kind == "toploader":
        tint = np.array([U(225, 245), U(225, 240), U(215, 235)], np.float32)
        L.paint(tint, outer, U(0.12, 0.34))
        L.paint((255, 255, 255), stroke(max(1.5, cw * 0.012)), 0.85)
        L.paint((70, 70, 70), stroke(1.2, max(1.5, cw * 0.012)), 0.45)
        rail = int(mx * U(0.35, 0.6))
        for rx in (x0 + rail, x1 - rail):
            L.paint((250, 250, 250), rr(sw, sh, rx - 1, y0 + 3, rx + 1, y1 - 3, 1), 0.5)
        ty = y0 + int(mt * U(0.3, 0.6))
        L.paint((250, 250, 250), rr(sw, sh, x0 + 4, ty - 1, x1 - 4, ty + 1, 1), 0.5)
    elif kind == "pocket":
        L.paint((240, 240, 240), outer, U(0.06, 0.16))
        L.paint((255, 255, 255), stroke(1.5), 0.55)
        L.paint((40, 40, 40), stroke(1.0, 2.0), 0.3)
    elif kind == "acrylic":
        t = max(3, int(cw * U(0.045, 0.07)))
        g = U(25, 70)
        L.paint((g, g, g + 4), stroke(t), U(0.88, 1.0))
        L.paint((230, 230, 230), stroke(1.5, 1), 0.7)
        gap = rr(sw, sh, x0 + t, y0 + t, x1 - t, y1 - t, 3)
        L.paint((200, 200, 200), gap, U(0.1, 0.3))
        # inner shadow ring around card
        L.paint((15, 15, 15), np.clip(rr(sw, sh, ox - 3, oy - 3, ox + cw + 3, oy + ch + 3, rad) - mask_at(sw, sh, ox, oy, mask), 0, 1), 0.5)
        for cy in (y0 + sh * 0.3, y0 + sh * 0.7):  # clips on the sides
            L.paint((200, 200, 205), rr(sw, sh, x0, cy - 6, x0 + t * 0.9, cy + 6, 2), 0.8)
            L.paint((200, 200, 205), rr(sw, sh, x1 - t * 0.9, cy - 6, x1, cy + 6, 2), 0.8)
    elif kind == "slab":
        rim = rng.choice(["clear", "clear", "red", "black", "blue"])
        rimc = {"clear": (225, 225, 225), "red": (50, 40, 190), "black": (35, 35, 35), "blue": (170, 90, 40)}[rim]
        t = max(3, int(cw * 0.06))
        L.paint(np.array(rimc, np.float32), outer, 0.95 if rim != "clear" else 0.55)
        if rim != "clear":  # glitter
            sp = (np.random.rand(sh, sw) > 0.92).astype(np.float32) * U(0.3, 0.8)
            L.paint((255, 255, 255), sp * stroke(t * 3.0), 0.8)
        inner = rr(sw, sh, x0 + t, y0 + t, x1 - t, y1 - t, 3)
        L.paint((215, 215, 215), inner, U(0.55, 0.9))
        # label strip
        lh = int(mt * 0.8)
        lab = rr(sw, sh, x0 + t * 1.5, y0 + t * 1.5, x1 - t * 1.5, y0 + t * 1.5 + lh, 2)
        base = rng.choice([(245, 245, 245), (245, 245, 245), (50, 40, 200), (40, 40, 40)])
        L.paint(np.array(base, np.float32), lab, 1.0)
        tm = text_mask(sw, sh, rand_words(3), cw / 260.0) * lab
        fg = 30 if base[0] > 200 else 240
        L.paint((fg, fg, fg), tm, 0.8)
        band = rr(sw, sh, x0 + t * 1.5, y0 + t * 1.5, x0 + t * 1.5 + (x1 - x0 - 3 * t) * 0.3, y0 + t * 1.5 + lh, 2)
        L.paint((40, 40, 200), band, 0.8)
        for bx in range(int(x1 - t * 1.5 - cw * 0.35), int(x1 - t * 1.5 - 4), 3):
            if rng.random() < 0.6:
                L.paint((20, 20, 20), rr(sw, sh, bx, y0 + t * 1.5 + lh * 0.55, bx + 1.5, y0 + t * 1.5 + lh * 0.95, 0.5), 0.8)
        L.paint((60, 60, 60), rr(sw, sh, ox - 5, oy - 5, ox + cw + 5, oy + ch + 5, 4) - rr(sw, sh, ox - 3, oy - 3, ox + cw + 3, oy + ch + 3, 3), 0.55)
    # --- the card itself
    L.paint_img(img, mask, ox, oy)
    # tint of the sleeve over the card, glare over everything
    if kind == "sleeve" and rng.random() < 0.7:
        L.overlay_tint(sleeve_color if sleeve_color is not None else (230, 190, 240), mask_at(sw, sh, ox, oy, mask), U(0.03, 0.1))
    if kind in ("sleeve", "clear_sleeve", "toploader", "pocket", "acrylic", "slab") and rng.random() < 0.7:
        g = gloss_mask(sw, sh, U(0.1, 0.5))
        L.overlay_tint((255, 255, 255), g * np.clip(L.a, 0, 1), 1.0)
    # soft edge of the sprite for shadow computations is done by the caller
    quad = np.array([[ox, oy], [ox + cw, oy], [ox + cw, oy + ch], [ox, oy + ch]], np.float32)
    return Sprite(L, quad, label, kind)


def mask_at(sw, sh, ox, oy, mask):
    m = np.zeros((sh, sw), np.float32)
    h, w = mask.shape
    m[oy : oy + h, ox : ox + w] = mask
    return m


# ------------------------------------------------------------- backgrounds
class BG:
    def __init__(self, textures, cards):
        self.textures = textures
        self.cards = cards
        self.cache = {}

    def tex(self):
        p = rng.choice(self.textures)
        if rng.random() < 0.35:  # tables are mostly wood
            wood = [t for t in self.textures if os.path.basename(t).lower().startswith(("wood", "plank"))]
            p = rng.choice(wood or self.textures)
        if p not in self.cache:
            if len(self.cache) > 12:
                self.cache.clear()
            im = read(p)
            self.cache[p] = cv2.resize(im, (1024, 1024), interpolation=cv2.INTER_AREA)
        return self.cache[p]

    def crop(self, scale=None):
        t = self.tex()
        s = scale or logU(0.35, 1.4)
        side = int(min(1024, SIZE * s * 1.5))
        side = max(side, 120)
        x, y = rng.randint(0, 1024 - side), rng.randint(0, 1024 - side)
        c = t[y : y + side, x : x + side]
        ang = rng.choice([0, 90, 180, 270]) + U(-12, 12) * (rng.random() < 0.5)
        M = cv2.getRotationMatrix2D((side / 2, side / 2), ang, 1.0)
        c = cv2.warpAffine(c, M, (side, side), borderMode=cv2.BORDER_REFLECT)
        c = cv2.resize(c, (SIZE, SIZE), interpolation=cv2.INTER_LINEAR if side < SIZE else cv2.INTER_AREA)
        return c.astype(np.float32)

    def texture(self):
        img = self.crop()
        gain = np.array([U(0.7, 1.25)] * 3, np.float32) * np.array([U(0.9, 1.1), 1, U(0.9, 1.1)], np.float32)
        return img * gain

    def glass(self):
        base = self.crop() * U(0.25, 0.9)
        if rng.random() < 0.4:
            base *= U(0.1, 0.4)
        refl = np.zeros((SIZE, SIZE), np.float32)
        for _ in range(rng.randint(1, 4)):  # dark silhouettes of furniture / people
            pts = np.array([[rng.randint(-100, SIZE + 100), rng.randint(-100, SIZE + 100)] for _ in range(rng.randint(3, 6))], np.int32)
            cv2.fillConvexPoly(refl, cv2.convexHull(pts), -U(0.2, 0.6))
        for _ in range(rng.randint(0, 3)):  # bright window / lamp
            pts = np.array([[rng.randint(0, SIZE), rng.randint(0, SIZE)] for _ in range(4)], np.int32)
            cv2.fillConvexPoly(refl, cv2.convexHull(pts), U(0.2, 0.7))
        refl = cv2.GaussianBlur(refl, (0, 0), U(4, 30))
        out = base * (1 + refl[..., None])
        for _ in range(rng.randint(0, 3)):  # lamp glare discs
            cx, cy = rng.randint(0, SIZE), rng.randint(0, SIZE)
            r = rng.randint(25, 70)
            disc = np.zeros((SIZE, SIZE), np.float32)
            cv2.circle(disc, (cx, cy), r, 1.0, -1)
            disc = cv2.GaussianBlur(disc, (0, 0), r * U(0.1, 0.3)) * U(0.4, 0.9)
            out = out + disc[..., None] * np.array([150, 220, 255], np.float32)
        return out

    def playmat(self):
        c = self.crop(scale=U(0.3, 1.0))
        art = read(rng.choice(self.cards))
        art = cv2.resize(art, (SIZE, SIZE)).astype(np.float32)
        art = cv2.GaussianBlur(art, (0, 0), U(2, 8))
        col = np.array([U(20, 200), U(20, 200), U(20, 200)], np.float32)
        base = col * U(0.6, 1.1)
        out = base[None, None, :] * (0.7 + 0.3 * c.mean(axis=2, keepdims=True) / 128) 
        a = U(0.0, 0.5)
        return out * (1 - a) + art * a

    def plain(self):
        col = np.array([U(10, 245), U(10, 245), U(10, 245)], np.float32)
        ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
        ang = U(0, 6.28)
        g = (xs * math.cos(ang) + ys * math.sin(ang)) / SIZE
        out = col[None, None] * (1 + U(-0.35, 0.35) * g[..., None])
        return out

    def noisy(self):
        small = np.random.rand(rng.randint(8, 60), rng.randint(8, 60), 3).astype(np.float32) * 255
        return cv2.resize(small, (SIZE, SIZE), interpolation=rng.choice([cv2.INTER_NEAREST, cv2.INTER_CUBIC]))

    def shelf(self):
        """A shop's back wall: pale vertical gradient with metal slat bars."""
        base = np.linspace(U(215, 245), U(170, 215), SIZE, dtype=np.float32)[:, None, None] * np.ones((1, SIZE, 3), np.float32)
        base *= np.array([U(0.95, 1.05), U(0.97, 1.05), U(0.93, 1.03)], np.float32)
        for _ in range(rng.randint(1, 4)):
            y = rng.randint(0, SIZE)
            t = rng.randint(6, 28)
            prof = np.cos(np.linspace(-1.4, 1.4, t)) * U(25, 70) * rng.choice([-1, 1])
            for i in range(t):
                if 0 <= y + i < SIZE:
                    base[y + i] += prof[i]
        return base

    def make(self):
        kind = rng.choices(
            ["texture", "glass", "playmat", "plain", "noisy"], weights=[38, 36, 12, 9, 5]
        )[0]
        return getattr(self, kind)(), kind


# ---------------------------------------------------------------- scene
def rot_matrix(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, -s], [s, c]], np.float32)


def place_homography(sprite_shape, pos, deg):
    sh, sw = sprite_shape
    R = rot_matrix(deg)
    M = np.eye(3, dtype=np.float64)
    M[:2, :2] = R
    c = np.array([sw / 2, sh / 2], np.float32)
    M[:2, 2] = np.asarray(pos) - R @ c
    return M


def persp_matrix():
    """Mild camera tilt: map the plane's corners to jittered corners."""
    j = U(0.0, 0.14) if rng.random() < 0.75 else 0.0
    src = np.float32([[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]])
    d = np.random.uniform(-j, j, (4, 2)).astype(np.float32) * SIZE
    if rng.random() < 0.5:  # keystone: one edge pulled in
        side = rng.randint(0, 3)
        k = U(0.0, 0.2) * SIZE
        idx = [(0, 1), (1, 2), (2, 3), (3, 0)][side]
        for i in idx:
            d[i] += (np.float32([SIZE / 2, SIZE / 2]) - src[i]) * (k / SIZE)
    return cv2.getPerspectiveTransform(src, src + d).astype(np.float64)


def make_scene(cards, bg, rngseed):
    global rng
    rng = random.Random(rngseed)
    np.random.seed(rngseed % (2**32))
    P = persp_matrix()
    scene_kind = rng.choices(["table", "binder", "shelf"], weights=[78, 12, 10])[0]
    base, bgkind = (bg.shelf(), "shelf") if scene_kind == "shelf" else bg.make()
    if rng.random() < 0.2:  # stray big translucent text on the table
        patch = np.zeros((SIZE, SIZE, 3), np.float32)
        wm = watermark(np.zeros((SIZE // 2, SIZE // 2, 3), np.float32) + 128, U(0.15, 0.5))
        M = cv2.getRotationMatrix2D((SIZE // 4, SIZE // 4), U(0, 360), U(0.8, 2.0))
        M[:, 2] += [rng.randint(-100, SIZE - 200), rng.randint(-100, SIZE - 200)]
        patch = cv2.warpAffine(wm - 128, M, (SIZE, SIZE))
        base = base + patch * 1.0
    # background lives on the table plane, so it takes the camera's perspective too
    base = cv2.warpPerspective(base, P, (SIZE, SIZE), borderMode=cv2.BORDER_REFLECT)
    items = []  # (sprite, H(plane->scene 3x3), z)

    Hs = logU(66, 400)  # base card height in plane px
    dominant = rng.choice([0, 90, 180, 270]) + U(-10, 10)
    follow = rng.random() < 0.65
    occ = np.zeros((SIZE // 8, SIZE // 8), np.uint8)

    def foot_free(poly):
        m = np.zeros_like(occ)
        cv2.fillConvexPoly(m, np.int32(poly / 8), 1)
        m = cv2.dilate(m, np.ones((3, 3), np.uint8))
        return not (m & occ).any(), m

    def container_for(scene_kind):
        if scene_kind == "shelf":
            return rng.choices(["acrylic", "toploader", "sleeve", "none"], [60, 15, 15, 10])[0]
        return rng.choices(
            ["none", "sleeve", "clear_sleeve", "toploader", "slab", "acrylic"], [18, 26, 6, 34, 7, 9]
        )[0]

    def face_for(cw, ch, op):
        if op:
            im = read(rng.choice(cards))
            f = round_card(im, cw, ch)
            if rng.random() < 0.15:
                f = (foil(f[0]), f[1])
            if rng.random() < 0.10:
                f = (gold_frame(f[0]), f[1])
            g = U(0.88, 1.12)
            c = np.array([U(0.92, 1.08), U(0.92, 1.08), U(0.92, 1.08)], np.float32)
            return (np.clip(f[0] * g * c, 0, 255), f[1])
        r = rng.random()
        if r < 0.12:
            return card_back(cw, ch)
        if r < 0.3:
            return box_face(cards, cw, ch)
        return fake_card(cards, cw, ch)

    def add_pile(cx, cy, hc, rot, kind, n, step_frac, fan_dir, labels_op=True, non_op=False):
        cw, ch = int(hc * CARD_ASPECT), int(hc)
        sleeve_col = rng.choice(SLEEVE_COLORS)
        sps = []
        for i in range(n):
            op = (not non_op)
            if rng.random() < 0.04:
                op = False
            face = face_for(cw, ch, op)
            sp = build_sprite(kind, face, cw, ch, label=op and face is not None and not non_op, sleeve_color=sleeve_col)
            if not op:
                sp.label = False
            sps.append(sp)
        # offsets: bottom card first, top card last
        d_ang = math.radians(rot + fan_dir)
        rel = math.radians(fan_dir)  # card extent along the offset direction
        along = abs(math.cos(rel)) * ch + abs(math.sin(rel)) * cw
        step = step_frac * along * rng.choice([1, 1])
        poly_pts = []
        local = []
        for i, sp in enumerate(sps):
            k = (n - 1 - i)
            off = np.array([math.sin(d_ang), -math.cos(d_ang)]) * step * k
            off = off + np.random.uniform(-0.015, 0.015, 2) * hc
            deg = rot + U(-2.5, 2.5) * (n > 1)
            M = place_homography(sp.layer.a.shape, np.array([cx, cy]) + off, deg)
            q = cv2.perspectiveTransform(sp.quad[None], M)[0]
            full = np.array([[0, 0], [sp.layer.w, 0], [sp.layer.w, sp.layer.h], [0, sp.layer.h]], np.float32)
            poly_pts.extend(cv2.perspectiveTransform(full[None], M)[0].tolist())
            local.append((sp, M))
        poly = cv2.convexHull(np.float32(poly_pts)).reshape(-1, 2)
        return local, poly

    def inside_scene(local):
        for sp, M in local:
            H = P @ M
            q = cv2.perspectiveTransform(sp.quad[None], H)[0]
            if (q < 2).any() or (q > SIZE - 2).any():
                return False
            if not sp.label:
                full = np.array([[0, 0], [sp.layer.w, 0], [sp.layer.w, sp.layer.h], [0, sp.layer.h]], np.float32)
                f = cv2.perspectiveTransform(full[None], H)[0]
                if (f < -40).any() or (f > SIZE + 40).any():
                    return False
        return True

    z = 0
    if scene_kind == "binder":
        rows, cols = rng.choice([(2, 2), (3, 3), (3, 3), (4, 3), (2, 3), (1, 2), (2, 2)])
        hc = min(SIZE * 0.78 / (rows * 1.09), SIZE * 0.85 / (cols * 1.09 * CARD_ASPECT))
        hc *= U(0.85, 1.0)
        cw, ch = hc * CARD_ASPECT, hc
        rot = dominant if rng.random() < 0.5 else rng.choice([0, 0, 180, 90]) + U(-5, 5)
        gx, gy = cw * 1.1, ch * 1.07
        cx0, cy0 = SIZE / 2 + U(-40, 40), SIZE / 2 + U(-40, 40)
        page_w, page_h = cols * gx + cw * 0.12, rows * gy + ch * 0.12
        # page backing drawn into the background (on the plane), then warped
        page = np.zeros((SIZE, SIZE, 3), np.float32)
        page[:] = U(15, 45)
        R = rot_matrix(rot)
        corners = np.array([[-page_w / 2, -page_h / 2], [page_w / 2, -page_h / 2], [page_w / 2, page_h / 2], [-page_w / 2, page_h / 2]])
        pc = (corners @ R.T) + [cx0, cy0]
        pm = np.zeros((SIZE, SIZE), np.float32)
        cv2.fillConvexPoly(pm, np.int32(pc), 1.0, cv2.LINE_AA)
        page = page + np.random.randn(SIZE, SIZE, 1).astype(np.float32) * 6
        pmw = cv2.warpPerspective(pm, P, (SIZE, SIZE))
        pgw = cv2.warpPerspective(page, P, (SIZE, SIZE))
        base = base * (1 - pmw[..., None]) + pgw * pmw[..., None]
        for r in range(rows):
            for c in range(cols):
                off = np.array([(c - (cols - 1) / 2) * gx, (r - (rows - 1) / 2) * gy]) @ R.T
                roll = rng.random()
                if roll < 0.08:
                    continue
                non_op = roll < 0.55
                local, _ = add_pile(cx0 + off[0], cy0 + off[1], hc, rot, "pocket", 1, 0, 0, non_op=non_op)
                items.extend((sp, P @ M, z) for sp, M in local)
                z += 1
        # loose cards on top of the page (like a photo of two cards laid on a binder)
        for _ in range(rng.randint(0, 3)):
            lh = hc * U(0.9, 1.35)
            cx, cy = cx0 + U(-0.3, 0.3) * page_w, cy0 + U(-0.3, 0.3) * page_h
            kind = rng.choice(["clear_sleeve", "clear_sleeve", "none", "sleeve"])
            for attempt in range(6):
                local, _ = add_pile(cx, cy, lh, rot + U(-6, 6), kind, 1, 0, 0)
                if inside_scene(local):
                    items.extend((sp, P @ M, z) for sp, M in local)
                    z += 1
                    break
                cx, cy = cx0 + U(-0.3, 0.3) * page_w, cy0 + U(-0.3, 0.3) * page_h
    else:
        n_target = rng.randint(1, 3) if Hs > 160 else rng.randint(1, 8) if Hs > 105 else rng.randint(2, 14)
        placed = 0
        for _ in range(n_target * 6):
            if placed >= n_target:
                break
            hc = Hs * U(0.82, 1.2)
            rot = (dominant + U(-5, 5)) if follow and rng.random() < 0.85 else (rng.choice([0, 90, 180, 270]) + U(-14, 14) if rng.random() < 0.6 else U(0, 360))
            kind = container_for(scene_kind)
            n = rng.choices([1, 2, 3, 4, 5], [30, 22, 20, 16, 12])[0]
            if kind in ("slab", "acrylic"):
                n = 1
            non_op = rng.random() < NON_OP_PILE
            style = rng.choice(["fan", "wide_fan", "wide_fan", "stack", "side", "side", "cover"])
            step = {"fan": U(0.03, 0.25), "wide_fan": U(0.3, 0.65), "stack": U(0.005, 0.045), "side": U(0.0, 0.0), "cover": U(0.3, 0.8)}[style]
            fan_dir = rng.choice([0, 180, 90, 270]) + U(-6, 6)
            if style == "side" and n > 1:  # cards laid next to each other, edges touching or overlapping
                fan_dir = 90 if rng.random() < 0.5 else 270
                step = U(0.5, 1.04)
            if style == "cover":  # a card half on top of another, any direction
                fan_dir = U(0, 360)
                n = rng.choice([2, 2, 3])
            if kind in ("slab", "acrylic"):
                n = 1
            for attempt in range(8):
                cx = U(0.1, 0.9) * SIZE
                cy = U(0.1, 0.9) * SIZE
                local, poly = add_pile(cx, cy, hc, rot, kind, n, step, fan_dir, non_op=non_op)
                ok, m = foot_free(poly)
                if not ok and placed > 0 and rng.random() < 0.3:
                    ok = True  # lay this pile partly over a neighbour
                if not ok or not inside_scene(local):
                    continue
                # fan behind cards that are scattered: keep one label rule: visibility decided later
                items.extend((sp, P @ M, z) for sp, M in local)
                z += 1
                occ |= m
                placed += 1
                break
        if scene_kind == "shelf":
            pass

    # ---- distractor rectangles (boxes with printed art, paper, phones)
    distract = []
    for _ in range(rng.choice([0, 0, 1, 2, 3, 5]) if scene_kind != "shelf" else rng.randint(2, 4)):
        hh = logU(60, 280) if scene_kind != "shelf" else logU(220, 380)
        hard_art = rng.random() < DISTRACTOR_ON_CARDS
        ww = hh * CARD_ASPECT * U(1.05, 1.5) if hard_art else hh * U(0.45, 1.3)
        rotd = rng.choice([0, 90, 0]) + U(-8, 8) if rng.random() < 0.6 else U(0, 360)
        cx, cy = U(0.05, 0.95) * SIZE, U(0.05, 0.95) * SIZE
        if items and rng.random() < DISTRACTOR_ON_CARDS:  # box with card art tucked behind / beside a card
            sp0, H0, _ = rng.choice(items)
            c0 = cv2.perspectiveTransform(sp0.quad.mean(0)[None, None], H0)[0, 0]
            cx, cy = float(c0[0]) + U(-0.6, 0.6) * hh, float(c0[1]) + U(-0.6, 0.6) * hh
        col = np.array([U(10, 245), U(10, 245), U(10, 245)], np.float32)
        sw_, sh_ = int(ww) + 10, int(hh) + 10
        L = Layer(sw_, sh_)
        body = rr(sw_, sh_, 5, 5, sw_ - 5, sh_ - 5, U(1, 8))
        L.paint(col, body, 1.0)
        if rng.random() < 0.55:  # a printed box front instead (#789)
            bimg, bmask = box_face(cards, int(ww), int(hh))
            L.paint_img(bimg, bmask, 5, 5)
        elif hard_art or rng.random() < 0.7:  # printed art, sometimes a whole fake printed card
            if hard_art or rng.random() < 0.6:
                art = read(rng.choice(cards))
                aw = int(hh * CARD_ASPECT * U(0.7, 0.93)) if hard_art else int(ww * U(0.4, 0.8))
                ah = int(aw / CARD_ASPECT)
                if ah < hh * 0.95:
                    a = cv2.resize(art, (aw, ah)).astype(np.float32)
                    am = rr(aw, ah, 0, 0, aw, ah, 0.05 * aw)
                    L.paint_img(a, am, int(sw_ * U(0.2, 0.5) - aw * 0.3) + 5, int(sh_ * U(0.25, 0.45)) if not hard_art else int((sh_ - ah) * U(0.3, 0.9)))
            tm = text_mask(sw_, sh_, rand_words(rng.randint(1, 4)), ww / 140.0, 2)
            L.paint((240, 240, 240) if col.mean() < 140 else (30, 30, 30), tm, 0.9)
        if rng.random() < 0.3:
            L.overlay_tint((255, 255, 255), gloss_mask(sw_, sh_, U(0.2, 0.6)) * L.a, 1.0)
        distract.append((L, place_homography((sh_, sw_), (cx, cy), rotd)))

    # ---- render
    img = base.copy()
    idmap = np.full((SIZE, SIZE), -1, np.int32)
    order = sorted(range(len(items)), key=lambda i: items[i][2])
    dist_first = rng.random() < (0.85 if DISTRACTOR_ON_CARDS else 0.6)  # boxes behind the cards, or a stray one over a corner
    def draw_layer(L, H, ident):
        nonlocal img
        warped_pm = cv2.warpPerspective(L.pm, H, (SIZE, SIZE), flags=cv2.INTER_LINEAR)
        warped_a = cv2.warpPerspective(L.a, H, (SIZE, SIZE), flags=cv2.INTER_LINEAR)
        sh = cv2.warpPerspective(L.a, H @ np.array([[1, 0, 3], [0, 1, 5], [0, 0, 1]], np.float64), (SIZE, SIZE))
        sh = cv2.GaussianBlur(sh, (0, 0), U(2, 5))
        img = img * (1 - U(0.15, 0.45) * sh[..., None])
        img = warped_pm + img * (1 - warped_a[..., None])
        if ident is not None:
            idmap[warped_a > 0.5] = ident
        else:
            idmap[warped_a > 0.5] = -1

    if dist_first:
        for L, M in distract:
            draw_layer(L, P @ M, None)
    for i in order:
        sp, H, _ = items[i]
        draw_layer(sp.layer, H, i)
    if not dist_first:
        for L, M in distract:
            draw_layer(L, P @ M, None)
    # occluders: hands / fingers
    for _ in range(rng.choice([0, 0, 0, 1, 2])):
        skin = np.array([U(110, 190), U(130, 190), U(170, 235)], np.float32) * U(0.6, 1.0)
        L = Layer(300, 300)
        L.paint(skin, rr(300, 300, 20, 100, 280, 200, 50), 1.0)
        draw_layer(L, place_homography((300, 300), (U(0, 1) * SIZE, U(0, 1) * SIZE), U(0, 360)) @ np.diag([U(0.4, 1.0), U(0.4, 1.0), 1]), None)

    # ---- labels: full quads of the cards that are visible enough, with per-corner visibility.
    # Frame cut-offs (#789): sometimes the "photo" is a window onto the scene, so
    # cards run over its edge. A card is labelled when >= OOF_MIN of it is inside
    # the window and VISIBLE_MIN of it is visible there; its quad keeps the corners
    # that are outside (flag 1) and the box is the part that is inside.
    crop = None
    if rng.random() < CROP_PROB:
        f = U(0.6, 0.92)
        crop = (U(0, 1) * (1 - f) * SIZE, U(0, 1) * (1 - f) * SIZE, f * SIZE)
    wx0, wy0, ws = crop if crop else (0.0, 0.0, float(SIZE))
    win = np.float32([[wx0, wy0], [wx0 + ws, wy0], [wx0 + ws, wy0 + ws], [wx0, wy0 + ws]])
    win_mask = np.zeros((SIZE, SIZE), bool)
    win_mask[int(math.ceil(wy0)) : int(wy0 + ws), int(math.ceil(wx0)) : int(wx0 + ws)] = True
    k = SIZE / ws
    labels = []
    for i, (sp, H, _) in enumerate(items):
        if not sp.label:
            continue
        q = cv2.perspectiveTransform(sp.quad[None], H)[0]
        m = np.zeros((SIZE, SIZE), np.uint8)
        cv2.fillConvexPoly(m, np.int32(np.round(q)), 1)
        area = m.sum()
        if area < 14 * 14:
            continue
        inter_area, inter_poly = cv2.intersectConvexConvex(q, win)
        inframe = inter_area / max(cv2.contourArea(q), 1.0)
        mw = (m > 0) & win_mask
        if inframe < OOF_MIN or mw.sum() < 14 * 14 / (k * k):
            continue
        vis = (idmap[mw] == i).mean() * inframe
        if vis < VISIBLE_MIN:
            continue
        # a corner is seen when it is in the window and this card is the topmost thing just inside it
        ctr = q.mean(0)
        flags = []
        for p in q:
            d = ctr - p
            p_in = p + d / (np.linalg.norm(d) + 1e-6) * 4.0
            x, y = int(round(p_in[0])), int(round(p_in[1]))
            inside = wx0 <= p[0] <= wx0 + ws and wy0 <= p[1] <= wy0 + ws
            flags.append(2 if inside and idmap[min(max(y, 0), SIZE - 1), min(max(x, 0), SIZE - 1)] == i else 1)
        qn = (q - [wx0, wy0]) * k
        pn = (inter_poly.reshape(-1, 2) - [wx0, wy0]) * k
        if (qn < -0.5 * SIZE + 2).any() or (qn > 1.5 * SIZE - 2).any():
            continue
        bbox = (np.clip(pn.min(0), 0, SIZE), np.clip(pn.max(0), 0, SIZE))
        labels.append((qn, flags, bbox))
    if crop:
        x0, y0, s_ = int(round(wx0)), int(round(wy0)), int(round(ws))
        img = cv2.resize(np.asarray(img, np.float32)[y0 : y0 + s_, x0 : x0 + s_], (SIZE, SIZE), interpolation=cv2.INTER_LINEAR)

    if scene_kind == "shelf" and labels:
        # glass shelf: everything below the lowest card is a faded mirror image
        ys = [q[:, 1].max() for q, _, _ in labels]
        y0 = int(min(SIZE - 40, max(ys) + SIZE * 0.015))
        k = SIZE - y0
        refl = img[max(0, y0 - k) : y0][::-1].astype(np.float32)
        fade = np.linspace(0.55, 0.05, refl.shape[0])[:, None, None]
        tint = np.array([U(150, 200), U(160, 210), U(150, 200)], np.float32)
        img[y0 : y0 + refl.shape[0]] = np.clip(refl * fade + tint * (1 - fade) * 0.6, 0, 255).astype(np.uint8)
        img[y0 : y0 + 3] = np.clip(img[y0 : y0 + 3].astype(np.float32) * 0.5 + 100, 0, 255)
        img = img.astype(np.float32)

    # ---- camera effects
    # glare blobs
    for _ in range(rng.choice([0, 0, 1, 1, 2, 3])):
        cx, cy = rng.randint(0, SIZE), rng.randint(0, SIZE)
        disc = np.zeros((SIZE, SIZE), np.float32)
        cv2.ellipse(disc, (cx, cy), (rng.randint(15, 140), rng.randint(15, 140)), U(0, 180), 0, 360, 1.0, -1)
        disc = cv2.GaussianBlur(disc, (0, 0), U(8, 40)) * U(0.15, 0.7)
        img = img + disc[..., None] * np.array([U(200, 255), U(220, 255), 255], np.float32)
    # vignette + white balance + contrast
    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    r = np.hypot(xs - SIZE / 2, ys - SIZE / 2) / SIZE
    img = img * (1 - U(0, 0.35) * r**2)[..., None]
    img = img * np.array([U(0.88, 1.12), U(0.92, 1.08), U(0.88, 1.12)], np.float32)
    img = (img - 128) * U(0.8, 1.2) + 128 + U(-20, 20)
    img = np.clip(img, 0, 255).astype(np.uint8)
    if rng.random() < 0.55:
        s = U(0.4, 1.4)
        img = cv2.GaussianBlur(img, (0, 0), s)
    if rng.random() < 0.15:
        k = rng.choice([5, 7, 9])
        kern = np.zeros((k, k), np.float32)
        kern[k // 2, :] = 1 / k
        M = cv2.getRotationMatrix2D((k / 2 - 0.5, k / 2 - 0.5), U(0, 180), 1)
        kern = cv2.warpAffine(kern, M, (k, k))
        img = cv2.filter2D(img, -1, kern / max(kern.sum(), 1e-6))
    if rng.random() < 0.5:  # low-res then upscale, like a phone crop
        f = U(0.45, 0.85)
        s = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        img = cv2.resize(s, (SIZE, SIZE), interpolation=cv2.INTER_LINEAR)
    img = np.clip(img.astype(np.float32) + np.random.randn(SIZE, SIZE, 3) * U(0, 6), 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(55, 95)])
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    return img, labels, scene_kind


def label_line(q, flags=(2, 2, 2, 2), bbox=None):
    """YOLO-pose label. Ultralytics rejects keypoints outside [0, 1], so they are
    stored as (v + 0.5) / 2 and `train.py` undoes that when it loads them."""
    q = np.asarray(q, np.float32)
    if bbox is None:
        bbox = (np.clip(q.min(0), 0, SIZE), np.clip(q.max(0), 0, SIZE))
    (x0, y0), (x1, y1) = bbox
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    s = SIZE
    parts = [0, cx / s, cy / s, w / s, h / s]
    for (x, y), f in zip(q, flags):
        parts += [(x / s + 0.5) / 2, (y / s + 0.5) / 2, f]
    return " ".join(f"{v:.6f}" if isinstance(v, float) or isinstance(v, np.floating) else str(v) for v in parts)


_G = {}


def _init(cards_dir, tex_dir, visible_min, non_op, hard, crop_prob):
    global VISIBLE_MIN, NON_OP_PILE, DISTRACTOR_ON_CARDS, CROP_PROB
    VISIBLE_MIN, NON_OP_PILE, DISTRACTOR_ON_CARDS, CROP_PROB = visible_min, non_op, hard, crop_prob
    cv2.setNumThreads(1)
    cards = sorted(glob.glob(os.path.join(cards_dir, "*.jpg")))
    tex = sorted(glob.glob(os.path.join(tex_dir, "*.jpg")))
    _G["cards"], _G["bg"] = cards, BG(tex, cards)


def _job(args):
    split, idx, seed, out = args
    img, labels, kind = make_scene(_G["cards"], _G["bg"], seed)
    name = f"{split}_{idx:05d}"
    cv2.imwrite(os.path.join(out, "images", split, name + ".jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    with open(os.path.join(out, "labels", split, name + ".txt"), "w") as f:
        f.write("\n".join(label_line(q, fl, bb) for q, fl, bb in labels))
    return len(labels)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", required=True)
    ap.add_argument("--textures", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--val", type=int, default=200)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--visible-min", type=float, default=VISIBLE_MIN, help="label cards at least this fraction visible (full quad); 0.85 = top cards only")
    ap.add_argument("--non-op-piles", type=float, default=NON_OP_PILE, help="share of table piles that are non-One-Piece cards (unlabelled)")
    ap.add_argument("--hard-negatives", type=float, default=DISTRACTOR_ON_CARDS, help="share of distractor boxes placed on top of / behind real cards")
    ap.add_argument("--crop-prob", type=float, default=CROP_PROB, help="share of scenes shown through a smaller window so cards run over the frame (#789)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--val-cards-from", type=float, default=0.0, help="unused; reserved")
    a = ap.parse_args()
    for sp in ("train", "val"):
        os.makedirs(os.path.join(a.out, "images", sp), exist_ok=True)
        os.makedirs(os.path.join(a.out, "labels", sp), exist_ok=True)
    jobs = [("train", i, a.seed * 1_000_003 + i, a.out) for i in range(a.n)]
    jobs += [("val", i, 777_777_000 + i, a.out) for i in range(a.val)]
    with Pool(a.workers, initializer=_init, initargs=(a.cards, a.textures, a.visible_min, a.non_op_piles, a.hard_negatives, a.crop_prob)) as p:
        counts = []
        for k, c in enumerate(p.imap_unordered(_job, jobs, chunksize=8)):
            counts.append(c)
            if k % 200 == 0:
                print(k, "/", len(jobs), flush=True)
    print("cards per scene: mean %.2f, empty %d" % (np.mean(counts), sum(1 for c in counts if c == 0)))
    with open(os.path.join(a.out, "data.yaml"), "w") as f:
        f.write(f"path: {os.path.abspath(a.out)}\ntrain: images/train\nval: images/val\nnames:\n  0: card\nkpt_shape: [4, 3]\nflip_idx: [0, 1, 2, 3]\n")


if __name__ == "__main__":
    main()
