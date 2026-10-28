"""Original playmat and card-back art for the trailer's custom-art clip (no third-party artwork).
   python3 make_assets.py  ->  playmat.png (2400x1400), cardback.png (630x880)"""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def playmat():
    W, H = 2400, 1400
    img = Image.new("RGB", (W, H))
    px = img.load()
    top, mid, bot = (255, 170, 90), (214, 92, 110), (30, 36, 88)
    for y in range(H):
        t = y / H
        c = lerp(top, mid, t / 0.45) if t < 0.45 else lerp(mid, bot, (t - 0.45) / 0.55)
        for x in range(W): px[x, y] = c
    d = ImageDraw.Draw(img, "RGBA")
    # sun
    cx, cy, r = W // 2, int(H * 0.40), 250
    for i in range(14, 0, -1):
        d.ellipse([cx - r - i * 26, cy - r - i * 26, cx + r + i * 26, cy + r + i * 26], fill=(255, 220, 150, 9))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 238, 190, 255))
    # sea bands with highlights
    rnd = random.Random(4)
    for k in range(34):
        y = int(H * 0.46 + (k / 34) ** 1.5 * H * 0.54)
        a = 30 + int(k * 3)
        d.rectangle([0, y, W, y + 6 + k], fill=(16, 24, 70, a))
        for _ in range(14):
            x = rnd.randint(0, W); wl = rnd.randint(60, 240) * (1 + k / 16)
            d.line([x, y + 3, x + wl, y + 3], fill=(255, 215, 170, 70 if k < 12 else 28), width=3)
    # compass rose
    d.ellipse([cx - 560, int(H * .78) - 560, cx + 560, int(H * .78) + 560], outline=(255, 236, 190, 70), width=4)
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        d.line([cx, int(H * .78), cx + 560 * math.cos(a), int(H * .78) + 560 * math.sin(a)], fill=(255, 236, 190, 46), width=3)
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    img.save("playmat.png")

def cardback():
    W, H = 630, 880
    img = Image.new("RGB", (W, H), (22, 30, 72))
    d = ImageDraw.Draw(img, "RGBA")
    for y in range(H):
        d.line([0, y, W, y], fill=(*lerp((24, 34, 92), (10, 14, 40), y / H), 255))
    for i in range(0, W + H, 34):
        d.line([i, 0, i - H, H], fill=(255, 205, 110, 16), width=2)
        d.line([i - H, 0, i, H], fill=(255, 205, 110, 16), width=2)
    d.rounded_rectangle([34, 34, W - 34, H - 34], radius=28, outline=(240, 188, 88, 255), width=6)
    d.rounded_rectangle([54, 54, W - 54, H - 54], radius=20, outline=(240, 188, 88, 120), width=2)
    cx, cy = W // 2, H // 2
    for r in (220, 180, 120):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(240, 188, 88, 255 if r == 220 else 150), width=5 if r == 220 else 2)
    for ang in range(0, 360, 30):
        a = math.radians(ang); L = 250 if ang % 90 == 0 else 200
        d.line([cx + 130 * math.cos(a), cy + 130 * math.sin(a), cx + L * math.cos(a), cy + L * math.sin(a)], fill=(240, 188, 88, 255), width=4)
    d.polygon([(cx, cy - 110), (cx + 26, cy), (cx, cy + 110), (cx - 26, cy)], fill=(240, 188, 88, 255))
    d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(22, 30, 72, 255))
    img.save("cardback.png")

playmat(); cardback()
