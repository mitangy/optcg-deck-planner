"""Post player feedback and card reports to a Discord channel through a webhook (#979)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

BOT_NAME = "Den Den Mushi"
_DESCRIPTION_MAX = 4000
_FIELD_MAX = 1024
_KIND_LABEL = {"bug": "Bug report", "idea": "Idea", "other": "Other feedback"}
_APP_LABEL = {"duel": "Duel app", "planner": "Deck planner"}
_KIND_COLOR = {"bug": 0xE74C3C, "idea": 0x2ECC71, "other": 0x95A5A6}
_CARD_REPORT_COLOR = 0xE67E22


def _fields(*items: tuple[str, str | None, bool]) -> list[dict[str, Any]]:
    """Embed fields, skipping blank values (Discord rejects empty ones)."""
    out: list[dict[str, Any]] = []
    for name, value, inline in items:
        text = (value or "").strip()
        if text:
            out.append({"name": name, "value": text[:_FIELD_MAX], "inline": inline})
    return out


def _body(embed: dict[str, Any]) -> dict[str, Any]:
    return {"username": BOT_NAME, "allowed_mentions": {"parse": []}, "embeds": [embed]}


def feedback_message(row: Any, reporter_name: str) -> dict[str, Any]:
    kind = _KIND_LABEL.get(row.kind, str(row.kind))
    app = _APP_LABEL.get(row.app, str(row.app))
    return _body(
        {
            "title": f"{kind} · {app}",
            "description": row.message[:_DESCRIPTION_MAX],
            "color": _KIND_COLOR.get(row.kind, _KIND_COLOR["other"]),
            "fields": _fields(
                ("Reporter", reporter_name, True),
                ("Page", row.page, True),
                ("Room", row.room_id, True),
                ("Build", row.client_build, True),
                ("Viewport", row.viewport, True),
            ),
            "footer": {"text": f"Feedback #{row.id}"},
        }
    )


def card_report_message(row: Any, reporter_name: str) -> dict[str, Any]:
    return _body(
        {
            "title": f"Card report · {row.card_id}",
            "description": row.description[:_DESCRIPTION_MAX],
            "color": _CARD_REPORT_COLOR,
            "fields": _fields(
                ("Reporter", reporter_name, True),
                ("Source", row.source, True),
                ("Room", row.room_id, True),
                ("Build", row.client_build, True),
            ),
            "footer": {"text": f"Card report #{row.id}"},
        }
    )


def post_to_discord(url: str, body: dict[str, Any]) -> None:
    """Send ``body`` to the webhook. Never raises; the URL is a secret and is never logged."""
    try:
        resp = httpx.post(url, json=body, timeout=5.0)
        if not resp.is_success:
            log.warning("Discord webhook returned HTTP %s", resp.status_code)
    except Exception as exc:  # noqa: BLE001 - a Discord outage must never affect players
        log.warning("Discord webhook post failed: %s", type(exc).__name__)
