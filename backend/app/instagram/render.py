"""Post images (#1477): 1080x1350 (4:5) JPEGs drawn with Pillow.

The header carries our own app logo (the straw-hat card icon from duel-web/public/favicon.svg, redrawn with
Pillow primitives) next to the text wordmark "OPTCG Duel": never Bandai's official game logo or the official
card back (#1483).
Every image carries a small "Unofficial fan-made sim" line.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
FONT_DIR = Path(__file__).parent / "fonts"
BG = (10, 18, 40)
PANEL = (20, 32, 66)
TEXT = (245, 247, 252)
MUTED = (148, 163, 196)
GOLD = (244, 196, 48)
UNOFFICIAL = "Unofficial fan-made sim"
URL = "optcgduel.app"

COLORS = {
    "red": (226, 70, 70),
    "green": (60, 180, 110),
    "blue": (70, 140, 235),
    "purple": (160, 100, 225),
    "yellow": (240, 200, 60),
    "black": (170, 178, 196),
}


def color_rgb(name: str) -> tuple[int, int, int]:
    first = (name or "").replace("/", " ").split()
    return COLORS.get(first[0].lower(), MUTED) if first else MUTED


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        FONT_DIR / ("Inter-Bold.otf" if bold else "Inter-Regular.otf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        try:
            return ImageFont.truetype(str(path), size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _text_w(draw: ImageDraw.ImageDraw, text: str, f) -> float:
    return draw.textlength(text, font=f)


def wrap(draw: ImageDraw.ImageDraw, text: str, f, max_w: int) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if line and _text_w(draw, trial, f) > max_w:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines


def _fit(draw: ImageDraw.ImageDraw, text: str, max_w: int, size: int, bold: bool, floor: int = 24):
    f = font(size, bold)
    while size > floor and _text_w(draw, text, f) > max_w:
        size -= 2
        f = font(size, bold)
    return f


LOGO_SIZE = 68
LOGO_X, LOGO_Y = 60, 48
_SS = 4  # supersampling factor for smooth edges


def draw_logo(img: Image.Image, x: int, y: int, size: int = LOGO_SIZE) -> None:
    """Paste our app logo (favicon.svg: gold-framed card with a straw hat) with its top-left at (x, y)."""
    big = size * _SS
    k = big / 64  # SVG units -> supersampled pixels
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def box(x0, y0, x1, y1):
        return [x0 * k, y0 * k, x1 * k, y1 * k]

    d.rounded_rectangle(box(0, 0, 64, 64), radius=14 * k, fill=(11, 23, 32, 255))
    # card: SVG stroke is centred on the 36x54 rect, so the outer edge is 1.75 units out.
    d.rounded_rectangle(box(12.25, 3.25, 51.75, 60.75), radius=6.75 * k, fill=(226, 180, 88, 255))
    d.rounded_rectangle(box(15.75, 6.75, 48.25, 57.25), radius=3.25 * k, fill=(22, 48, 59, 255))

    def hat(px, py):  # hat group: translate(32 32) scale(.66) translate(-32 -31)
        return 32 + 0.66 * (px - 32), 32 + 0.66 * (py - 31)

    cx0, cy0 = hat(19, 20)
    cx1, cy1 = hat(45, 56)
    crown = Image.new("L", (big, big), 0)
    ImageDraw.Draw(crown).pieslice(box(cx0, cy0, cx1, cy1), 180, 360, fill=255)
    band = Image.new("L", (big, big), 0)
    bx0, by0 = hat(17, 32)
    bx1, by1 = hat(47, 38)
    ImageDraw.Draw(band).rectangle(box(bx0, by0, bx1, by1), fill=255)
    gold = Image.new("RGBA", (big, big), (226, 180, 88, 255))
    red = Image.new("RGBA", (big, big), (184, 50, 42, 255))
    layer.paste(gold, (0, 0), crown)
    layer.paste(red, (0, 0), Image.composite(band, Image.new("L", (big, big), 0), crown))
    rx0, ry0 = hat(8, 37)
    rx1, ry1 = hat(56, 42)
    d.rounded_rectangle(box(rx0, ry0, rx1, ry1), radius=2.5 * 0.66 * k, fill=(217, 164, 65, 255))

    small = layer.resize((size, size), Image.LANCZOS)
    img.paste(small, (x, y), small)


def _canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_logo(img, LOGO_X, LOGO_Y)
    draw.text((LOGO_X + LOGO_SIZE + 18, 54), "OPTCG Duel", font=font(46, True), fill=TEXT)
    draw.text((W - 60, 66), URL, font=font(30), fill=MUTED, anchor="ra")
    draw.rectangle([60, 122, 180, 127], fill=GOLD)
    draw.text((W / 2, H - 46), f"{UNOFFICIAL} · not affiliated with Bandai", font=font(24), fill=MUTED, anchor="mm")
    return img, draw


def _jpeg(img: Image.Image) -> bytes:
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def _pill(draw: ImageDraw.ImageDraw, center_y: int, text: str, size: int = 34) -> None:
    f = font(size, True)
    w = int(_text_w(draw, text, f)) + 80
    draw.rounded_rectangle([(W - w) / 2, center_y - 41, (W + w) / 2, center_y + 41], radius=41, fill=GOLD)
    draw.text((W / 2, center_y), text, font=f, fill=(12, 18, 36), anchor="mm")


def render_meta_chart(rows: list[tuple[str, float, str]], days: int, source: str) -> bytes:
    """rows: (leader name, share 0-1, color name), largest first."""
    img, draw = _canvas()
    draw.text((60, 170), "Tournament meta", font=font(72, True), fill=TEXT)
    draw.text((60, 262), f"Top leaders by share of decks · last {days} days", font=font(32), fill=MUTED)
    top = max((r[1] for r in rows), default=0.0) or 1.0
    y, step = 340, 92
    bar_x, bar_max = 60, W - 120
    for name, share, color in rows[:8]:
        draw.text((bar_x, y), name, font=_fit(draw, name, 640, 36, True, 26), fill=TEXT)
        draw.text((W - 60, y), f"{share * 100:.1f}%", font=font(36, True), fill=color_rgb(color), anchor="ra")
        by = y + 50
        draw.rounded_rectangle([bar_x, by, bar_x + bar_max, by + 20], radius=10, fill=PANEL)
        draw.rounded_rectangle([bar_x, by, bar_x + max(20, int(bar_max * share / top)), by + 20], radius=10, fill=color_rgb(color))
        y += step
    draw.text((W / 2, 1120), f"Tournament meta · last {days} days · data: {source}", font=font(26), fill=MUTED, anchor="mm")
    _pill(draw, 1235, "Play it free at optcgduel.app", 32)
    return _jpeg(img)


def render_card_spotlight(name: str, card_id: str, color: str, card_type: str, art: Image.Image | None) -> bytes:
    img, draw = _canvas()
    top, art_h = 170, 640
    if art is not None:
        art = art.convert("RGB")
        art_w = max(1, round(art.width * art_h / art.height))
        art_w = min(art_w, 640)
        art = art.resize((art_w, round(art.height * art_w / art.width)), Image.LANCZOS)
        art_h = art.height
        x = (W - art.width) // 2
        draw.rounded_rectangle([x - 14, top - 14, x + art.width + 14, top + art_h + 14], radius=26, fill=color_rgb(color))
        mask = Image.new("L", art.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, art.width, art.height], radius=18, fill=255)
        img.paste(art, (x, top), mask)
    else:
        draw.rounded_rectangle([W / 2 - 230, top, W / 2 + 230, top + art_h], radius=26, fill=PANEL, outline=color_rgb(color), width=6)
        draw.text((W / 2, top + art_h / 2), card_id, font=font(64, True), fill=color_rgb(color), anchor="mm")
    y = top + art_h + 60
    draw.text((W / 2, y), "Card spotlight", font=font(28, True), fill=GOLD, anchor="mm")
    y += 62
    f = _fit(draw, name, W - 120, 60, True, 34)
    draw.text((W / 2, y), name, font=f, fill=TEXT, anchor="mm")
    y += 58
    details = " · ".join(p for p in (card_id, color.replace("/", " / "), card_type) if p)
    draw.text((W / 2, y), details, font=font(32), fill=MUTED, anchor="mm")
    _pill(draw, 1235, "Play it free at optcgduel.app", 32)
    return _jpeg(img)


def render_feature(title: str, body: str, number: int, total: int) -> bytes:
    img, draw = _canvas()
    draw.text((60, 200), f"App tip {number}/{total}", font=font(30, True), fill=GOLD)
    y = 270
    tf = font(86, True)
    for line in wrap(draw, title, tf, W - 120)[:4]:
        draw.text((60, y), line, font=tf, fill=TEXT)
        y += 104
    y += 30
    draw.rounded_rectangle([60, y, 180, y + 6], radius=3, fill=GOLD)
    y += 50
    bf = font(44)
    for line in wrap(draw, body, bf, W - 120)[:8]:
        draw.text((60, y), line, font=bf, fill=MUTED)
        y += 66
    _pill(draw, 1235, "Play it free at optcgduel.app", 32)
    return _jpeg(img)
