from __future__ import annotations

import io

import pytest
from PIL import Image

from app.instagram import render

CARD_GOLD = (226, 180, 88)  # favicon card frame
HAT_RED = (184, 50, 42)  # favicon hat band


def _near(px, target, tol=24) -> bool:
    return all(abs(a - b) <= tol for a, b in zip(px, target))


def _header_has(img: Image.Image, target) -> bool:
    # Logo box only (left of the wordmark, above the gold underline at y=122).
    for x in range(render.LOGO_X, render.LOGO_X + render.LOGO_SIZE):
        for y in range(render.LOGO_Y, render.LOGO_Y + render.LOGO_SIZE):
            if _near(img.getpixel((x, y)), target):
                return True
    return False


RENDERERS = {
    "meta_chart": lambda: render.render_meta_chart([("Luffy", 0.2, "red"), ("Zoro", 0.1, "green")], 30, "Limitless"),
    "card_spotlight": lambda: render.render_card_spotlight("Zoro", "OP01-025", "green", "Leader", None),
    "feature": lambda: render.render_feature("Tip", "Body text.", 1, 3),
}


@pytest.mark.parametrize("kind", sorted(RENDERERS))
def test_post_header_shows_the_app_logo_left_of_the_wordmark_1483(kind):
    img = Image.open(io.BytesIO(RENDERERS[kind]())).convert("RGB")
    assert _header_has(img, CARD_GOLD), "logo card frame missing"
    assert _header_has(img, HAT_RED), "logo hat band missing"
