"""Outbound email for price alerts (#855). Off until RESEND_API_KEY or SMTP_HOST is set."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

import httpx

from app.config import get_settings

log = logging.getLogger("uvicorn.error")

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_S = 15.0


def email_enabled() -> bool:
    s = get_settings()
    return bool(s.resend_api_key or s.smtp_host)


def _send_resend(to: str, subject: str, html: str, text: str) -> bool:
    s = get_settings()
    resp = httpx.post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {s.resend_api_key}"},
        json={"from": s.email_from, "to": [to], "subject": subject, "html": html, "text": text},
        timeout=TIMEOUT_S,
    )
    resp.raise_for_status()
    return True


def _send_smtp(to: str, subject: str, html: str, text: str) -> bool:
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=TIMEOUT_S) as server:
        server.starttls(context=ssl.create_default_context())
        if s.smtp_user:
            server.login(s.smtp_user, s.smtp_password)
        server.send_message(msg)
    return True


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    """Send one message through the configured provider. False when off or when sending failed.

    Never raises, and never logs the address or any key.
    """
    s = get_settings()
    try:
        if s.resend_api_key:
            return _send_resend(to, subject, html, text)
        if s.smtp_host:
            return _send_smtp(to, subject, html, text)
    except Exception as exc:  # noqa: BLE001 - a mail outage must not break price updates
        log.warning("email send failed: %s", type(exc).__name__)
        return False
    return False
