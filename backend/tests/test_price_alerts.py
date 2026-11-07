"""Card price alerts, their emails and the notification inbox (#855)."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import select

from app.planner import catalog_sync, mailer, price_alerts, price_refresh
from app.core.auth import SESSION_COOKIE, create_session_token
from app.core.config import get_settings
from app.models import CatalogCard, CatalogPrinting, Notification, PriceAlert, User
from tests.conftest import add_catalog, make_user
from tests.test_abuse_limits import client  # noqa: F401  (fixture)
from tests.test_price_refresh import NOW, _client, _group, _product

LUFFY = "OP01-001"
ALT = 2001
LATER = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)


class Outbox:
    """Stands in for mailer.send_email so no test sends a real message."""

    def __init__(self, result: bool = True) -> None:
        self.sent: list[dict] = []
        self.result = result

    def __call__(self, to, subject, html, text):
        self.sent.append({"to": to, "subject": subject, "html": html, "text": text})
        return self.result


@pytest.fixture()
def outbox(monkeypatch):
    box = Outbox()
    monkeypatch.setattr(mailer, "send_email", box)
    monkeypatch.setattr(mailer, "email_enabled", lambda: True)
    return box


def _seed(db, base=5.0, alt=3.0):
    """Luffy with a base art at `base` and one alternate art at `alt`."""
    add_catalog(db, LUFFY, name="Luffy", product_id=1001, market=base)
    add_catalog(db, LUFFY, name="Luffy", product_id=ALT, market=alt, special=True)
    return make_user(db, email="a@example.com", name="A", sub="sub-a")


def _set_price(db, *, base=None, alt=None):
    if base is not None:
        db.get(CatalogCard, LUFFY).market_price = base
    if alt is not None:
        row = db.scalar(select(CatalogPrinting).where(CatalogPrinting.product_id == ALT))
        row.market_price = alt
    db.commit()


def _alert(db, user, *, product_id=0, target=5.0, direction="below", armed=True, **kw) -> PriceAlert:
    row = PriceAlert(
        user_id=user.id, card_id=LUFFY, product_id=product_id, target_price=target,
        direction=direction, armed=armed, **kw,
    )
    db.add(row)
    db.commit()
    return row


def _inbox(db, user):
    return db.scalars(select(Notification).where(Notification.user_id == user.id)).all()


# ------------------------------------------------------------------ checking prices


def test_alert_fires_when_price_drops_to_exactly_the_target_855(db, outbox):
    user = _seed(db, base=5.0)
    alert = _alert(db, user, target=5.0)

    summary = price_alerts.check_alerts(db, LATER)

    assert summary["fired"] == 1
    db.refresh(alert)
    assert (alert.armed, alert.last_price) == (False, 5.0)
    assert alert.triggered_at is not None
    assert [n.title for n in _inbox(db, user)] == ["Luffy is now $5.00"]


def test_alert_stays_quiet_while_the_price_is_above_the_target_855(db, outbox):
    user = _seed(db, base=5.01)
    _alert(db, user, target=5.0)

    assert price_alerts.check_alerts(db, LATER)["fired"] == 0
    assert _inbox(db, user) == [] and outbox.sent == []


def test_alert_does_not_fire_again_while_the_price_stays_under_the_target_855(db, outbox):
    user = _seed(db, base=4.0)
    alert = _alert(db, user, target=5.0)

    assert price_alerts.check_alerts(db, LATER)["fired"] == 1
    _set_price(db, base=3.5)
    assert price_alerts.check_alerts(db, LATER)["fired"] == 0
    assert len(_inbox(db, user)) == 1 and len(outbox.sent) == 1
    db.refresh(alert)
    # The "Hit" chip shows the price it fired at, not the latest one.
    assert (alert.triggered_price, alert.last_price) == (4.0, 3.5)


def test_alert_rearms_when_the_price_climbs_back_and_fires_on_the_next_drop_855(db, outbox):
    user = _seed(db, base=4.0)
    alert = _alert(db, user, target=5.0)
    price_alerts.check_alerts(db, LATER)

    _set_price(db, base=6.0)
    price_alerts.check_alerts(db, LATER)
    db.refresh(alert)
    assert alert.armed is True

    _set_price(db, base=4.5)
    assert price_alerts.check_alerts(db, LATER)["fired"] == 1
    assert len(_inbox(db, user)) == 2


def test_alt_art_alert_watches_that_printings_price_not_the_base_price_855(db, outbox):
    user = _seed(db, base=10.0, alt=3.0)
    base_alert = _alert(db, user, product_id=0, target=5.0)
    alt_alert = _alert(db, user, product_id=ALT, target=5.0)

    price_alerts.check_alerts(db, LATER)

    db.refresh(base_alert)
    db.refresh(alt_alert)
    assert (base_alert.armed, base_alert.last_price) == (True, 10.0)
    assert (alt_alert.armed, alt_alert.last_price) == (False, 3.0)
    assert [n.product_id for n in _inbox(db, user)] == [ALT]
    assert _inbox(db, user)[0].title.startswith("Luffy (Alt) is now")


def test_above_alert_fires_when_the_price_rises_to_the_target_855(db, outbox):
    user = _seed(db, base=8.0)
    _alert(db, user, target=10.0, direction="above")

    assert price_alerts.check_alerts(db, LATER)["fired"] == 0
    _set_price(db, base=10.0)
    assert price_alerts.check_alerts(db, LATER)["fired"] == 1


def test_above_alert_does_not_fire_just_because_the_price_is_low_855(db, outbox):
    user = _seed(db, base=2.0)
    _alert(db, user, target=10.0, direction="above")

    assert price_alerts.check_alerts(db, LATER)["fired"] == 0


def test_a_missing_price_neither_fires_nor_rearms_855(db, outbox):
    user = _seed(db)
    alert = _alert(db, user, target=5.0, armed=False)
    db.get(CatalogCard, LUFFY).market_price = None
    db.commit()

    summary = price_alerts.check_alerts(db, LATER)

    db.refresh(alert)
    assert summary["fired"] == 0
    assert alert.armed is False and alert.last_price is None


def test_paused_alert_never_fires_855(db, outbox):
    user = _seed(db, base=1.0)
    _alert(db, user, target=5.0, paused=True)

    summary = price_alerts.check_alerts(db, LATER)

    assert summary["checked"] == 0 and summary["fired"] == 0
    assert _inbox(db, user) == [] and outbox.sent == []


def test_app_only_alert_sends_no_email_and_email_only_alert_leaves_no_notification_855(db, outbox):
    user = _seed(db, base=1.0, alt=1.0)
    _alert(db, user, product_id=0, target=5.0, notify_email=False, notify_app=True)
    _alert(db, user, product_id=ALT, target=5.0, notify_email=True, notify_app=False)

    price_alerts.check_alerts(db, LATER)

    assert [n.product_id for n in _inbox(db, user)] == [0]
    assert len(outbox.sent) == 1
    assert outbox.sent[0]["subject"] == "Price alert: Luffy is now $1.00"
    assert "Luffy (Alt)" in outbox.sent[0]["text"]


def test_several_fired_alerts_make_one_email_per_user_855(db, outbox):
    user = _seed(db, base=1.0, alt=1.0)
    other = make_user(db, email="b@example.com", name="B", sub="sub-b")
    _alert(db, user, product_id=0, target=5.0)
    _alert(db, user, product_id=ALT, target=5.0)
    _alert(db, other, product_id=0, target=5.0)

    summary = price_alerts.check_alerts(db, LATER)

    assert summary["emails_sent"] == 2
    by_to = {m["to"]: m for m in outbox.sent}
    assert set(by_to) == {"a@example.com", "b@example.com"}
    assert by_to["a@example.com"]["subject"] == "2 price alerts"
    assert by_to["b@example.com"]["subject"] == "Price alert: Luffy is now $1.00"
    assert "/alerts" in by_to["a@example.com"]["text"]


def test_card_names_are_escaped_in_the_email_html_855(db, outbox):
    user = _seed(db, base=1.0)
    db.get(CatalogCard, LUFFY).name = "<script>x</script>"
    db.commit()
    _alert(db, user, target=5.0)

    price_alerts.check_alerts(db, LATER)

    assert "<script>" not in outbox.sent[0]["html"]
    assert "&lt;script&gt;" in outbox.sent[0]["html"]


def test_email_failures_are_counted_and_never_raise_855(db, monkeypatch):
    monkeypatch.setattr(mailer, "email_enabled", lambda: True)
    monkeypatch.setattr(mailer, "send_email", Outbox(result=False))
    user = _seed(db, base=1.0)
    _alert(db, user, target=5.0)
    assert price_alerts.check_alerts(db, LATER)["email_failures"] == 1

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(mailer, "send_email", boom)
    _alert(db, user, product_id=ALT, target=5.0)
    summary = price_alerts.check_alerts(db, LATER)
    assert (summary["fired"], summary["email_failures"], summary["emails_sent"]) == (1, 1, 0)


def test_no_email_is_attempted_while_email_is_not_set_up_855(db, monkeypatch):
    box = Outbox()
    monkeypatch.setattr(mailer, "send_email", box)
    monkeypatch.setattr(mailer, "email_enabled", lambda: False)
    user = _seed(db, base=1.0)
    _alert(db, user, target=5.0)

    summary = price_alerts.check_alerts(db, LATER)

    assert box.sent == []
    assert summary["fired"] == 1 and len(_inbox(db, user)) == 1


def test_inbox_keeps_only_the_newest_hundred_notifications_855(db, outbox):
    user = _seed(db, base=1.0)
    for i in range(100):
        db.add(Notification(user_id=user.id, kind="price_alert", title=f"old {i}"))
    db.commit()
    _alert(db, user, target=5.0)

    price_alerts.check_alerts(db, LATER)

    titles = [n.title for n in _inbox(db, user)]
    assert len(titles) == 100
    assert "old 0" not in titles and "old 1" in titles
    assert "Luffy is now $1.00" in titles


# ------------------------------------------------------------------ hooks


def test_a_price_refresh_checks_alerts_after_applying_prices_855(db, outbox):
    user = _seed(db, base=5.0)
    db.add(CatalogPrinting(card_id="OP18-001", product_id=77, name="Zoro", market_price=5.0, low_price=5.0, is_special=0))
    db.add(CatalogCard(card_id="OP18-001", name="Zoro", market_price=5.0, low_price=5.0))
    db.commit()
    db.add(PriceAlert(user_id=user.id, card_id="OP18-001", product_id=0, target_price=4.0))
    db.commit()
    client = _client([_group(1, "2026-10-21T00:00:00")], {1: [_product(77, 3.5, 3.0)]})

    price_refresh.refresh_new_release_prices(db, client, NOW, 30)

    assert [n.title for n in _inbox(db, user)] == ["Zoro is now $3.50"]


def test_a_failing_alert_check_does_not_fail_the_price_refresh_855(db, monkeypatch):
    def boom(db, now=None):
        raise RuntimeError("alerts broke")

    monkeypatch.setattr(price_alerts, "check_alerts", boom)
    client = _client([_group(1, "2026-10-21T00:00:00")], {1: []})

    summary = price_refresh.refresh_new_release_prices(db, client, NOW, 30)

    assert summary["groups"] == 1


@pytest.fixture()
def _fresh_sync_state():
    catalog_sync._sync_state.update(running=False, started_at=None, finished_at=None, last_result=None, last_error=None)
    yield


def test_a_catalog_sync_checks_alerts_with_its_own_session_and_survives_a_failure_855(monkeypatch, _fresh_sync_state):
    from unittest.mock import MagicMock

    session = MagicMock()
    monkeypatch.setattr(catalog_sync, "sync_catalog", lambda db: {"card_count": 1})
    seen = []

    def boom(db, now=None):
        seen.append(db)
        raise RuntimeError("alerts broke")

    monkeypatch.setattr(price_alerts, "check_alerts", boom)

    result = catalog_sync.run_catalog_sync_job(session_factory=lambda: session)

    assert result == {"card_count": 1}
    assert seen == [session]
    assert catalog_sync.sync_status()["last_error"] is None


# ------------------------------------------------------------------ API


def _login(c, SessionLocal, email):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=email, google_sub="sub-" + email)
            db.add(user)
            db.commit()
        uid = user.id
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return uid


def _catalog(SessionLocal, base=5.0, alt=3.0):
    with SessionLocal() as db:
        add_catalog(db, LUFFY, name="Luffy", product_id=1001, market=base)
        add_catalog(db, LUFFY, name="Luffy", product_id=ALT, market=alt, special=True)
        add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=2.0)
        row = db.scalar(select(CatalogPrinting).where(CatalogPrinting.product_id == ALT))
        row.image_url = "https://img.test/alt.png"
        db.get(CatalogCard, LUFFY).image_url = "https://img.test/base.png"
        db.commit()


def _post(c, **body):
    payload = {"card_id": LUFFY, "target_price": 4.0}
    payload.update(body)
    return c.post("/price-alerts", json=payload)


def test_alerts_need_a_signed_in_user_855(client):
    c, _ = client
    assert c.get("/price-alerts").status_code == 401
    assert c.get("/notifications").status_code == 401


def test_creating_an_alert_returns_the_card_art_and_prices_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    _login(c, SessionLocal, "a@x.test")

    res = _post(c, product_id=ALT, target_price=2.5, direction="below")

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["card_name"], body["art_name"], body["is_alt"]) == ("Luffy", "Luffy (Alt)", True)
    assert body["image_url"] == "https://img.test/alt.png"
    assert (body["current_price"], body["target_price"], body["met_now"], body["armed"]) == (3.0, 2.5, False, True)
    base = _post(c).json()
    assert (base["art_name"], base["is_alt"], base["image_url"], base["current_price"]) == (
        "Base", False, "https://img.test/base.png", 5.0,
    )


def test_each_art_gets_its_own_alert_and_posting_again_updates_it_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    _login(c, SessionLocal, "a@x.test")

    first = _post(c, target_price=4.0).json()
    _post(c, product_id=ALT, target_price=2.0)
    again = _post(c, target_price=4.5).json()

    assert again["id"] == first["id"] and again["target_price"] == 4.5
    listing = c.get("/price-alerts").json()
    assert sorted(a["product_id"] for a in listing["alerts"]) == [0, ALT]
    assert listing["email_enabled"] is False
    card = c.get(f"/price-alerts/card/{LUFFY.lower()}").json()
    assert len(card["alerts"]) == 2
    assert c.get("/price-alerts/card/OP01-002").json()["alerts"] == []


def test_an_alert_already_met_when_created_waits_for_a_real_crossing_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal, base=3.0)
    _login(c, SessionLocal, "a@x.test")

    body = _post(c, target_price=4.0).json()

    assert (body["met_now"], body["armed"]) == (True, False)
    with SessionLocal() as s:
        assert price_alerts.check_alerts(s, LATER)["fired"] == 0
        assert s.scalars(select(Notification)).all() == []


def test_alert_for_an_unknown_card_or_a_foreign_art_is_not_found_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    _login(c, SessionLocal, "a@x.test")

    assert _post(c, card_id="NOPE-999").status_code == 404
    # ALT belongs to Luffy; Zoro cannot be watched through it.
    assert _post(c, card_id="OP01-002", product_id=ALT).status_code == 404
    assert c.get("/price-alerts").json()["alerts"] == []


def test_target_price_must_be_positive_and_at_most_100000_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    _login(c, SessionLocal, "a@x.test")

    assert _post(c, target_price=0).status_code == 422
    assert _post(c, target_price=100_000.01).status_code == 422
    assert _post(c, target_price=100_000).status_code == 200
    assert _post(c, direction="sideways").status_code == 422


def test_a_player_can_watch_at_most_200_arts_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    uid = _login(c, SessionLocal, "a@x.test")
    with SessionLocal() as s:
        for i in range(200):
            s.add(PriceAlert(user_id=uid, card_id=f"ZZ{i:03d}", product_id=0, target_price=1.0))
        s.commit()

    res = _post(c)

    assert res.status_code == 400 and "200" in res.json()["detail"]


def test_editing_the_target_rearms_or_disarms_against_the_current_price_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal, base=3.0)
    _login(c, SessionLocal, "a@x.test")
    alert = _post(c, target_price=4.0).json()  # met at creation, so disarmed
    assert alert["armed"] is False

    lower = c.patch(f"/price-alerts/{alert['id']}", json={"target_price": 2.0}).json()
    assert (lower["armed"], lower["met_now"]) == (True, False)

    higher = c.patch(f"/price-alerts/{alert['id']}", json={"target_price": 3.5}).json()
    assert (higher["armed"], higher["met_now"]) == (False, True)

    flipped = c.patch(f"/price-alerts/{alert['id']}", json={"direction": "above"}).json()
    assert (flipped["armed"], flipped["direction"]) == (True, "above")


def test_toggles_and_pause_patch_without_touching_the_target_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    _login(c, SessionLocal, "a@x.test")
    alert = _post(c, target_price=4.0).json()

    out = c.patch(
        f"/price-alerts/{alert['id']}", json={"notify_email": False, "notify_app": False, "paused": True}
    ).json()

    assert (out["notify_email"], out["notify_app"], out["paused"], out["target_price"]) == (False, False, True, 4.0)


def test_nobody_else_can_read_edit_or_delete_my_alerts_855(client):
    c, SessionLocal = client
    _catalog(SessionLocal)
    _login(c, SessionLocal, "a@x.test")
    alert = _post(c).json()

    _login(c, SessionLocal, "b@x.test")
    assert c.get("/price-alerts").json()["alerts"] == []
    assert c.get(f"/price-alerts/card/{LUFFY}").json()["alerts"] == []
    assert c.patch(f"/price-alerts/{alert['id']}", json={"paused": True}).status_code == 404
    assert c.delete(f"/price-alerts/{alert['id']}").status_code == 404

    _login(c, SessionLocal, "a@x.test")
    assert c.get("/price-alerts").json()["alerts"][0]["paused"] is False
    assert c.delete(f"/price-alerts/{alert['id']}").status_code == 204
    assert c.get("/price-alerts").json()["alerts"] == []


def test_notifications_list_newest_first_with_an_unread_count_and_limit_855(client):
    c, SessionLocal = client
    uid = _login(c, SessionLocal, "a@x.test")
    with SessionLocal() as s:
        for i in range(5):
            s.add(Notification(user_id=uid, kind="price_alert", title=f"n{i}", read_at=LATER if i == 0 else None))
        s.commit()

    body = c.get("/notifications?limit=3").json()

    assert [n["title"] for n in body["items"]] == ["n4", "n3", "n2"]
    assert body["unread"] == 4
    assert c.get("/notifications?limit=0").status_code == 422


def test_marking_read_changes_only_the_ids_given_and_only_my_own_855(client):
    c, SessionLocal = client
    mine = _login(c, SessionLocal, "a@x.test")
    theirs = _login(c, SessionLocal, "b@x.test")
    with SessionLocal() as s:
        ids = []
        for uid in (mine, mine, mine, theirs):
            n = Notification(user_id=uid, kind="price_alert", title="t")
            s.add(n)
            s.flush()
            ids.append(n.id)
        s.commit()
    _login(c, SessionLocal, "a@x.test")

    assert c.post("/notifications/read", json={"ids": [ids[0], ids[3]]}).json() == {"unread": 2}
    assert c.post("/notifications/read").json() == {"unread": 0}

    with SessionLocal() as s:
        other = s.get(Notification, ids[3])
        assert other.read_at is None


# ------------------------------------------------------------------ mailer


@pytest.fixture()
def mail_env(monkeypatch):
    for name in ("RESEND_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PORT", "EMAIL_FROM"):
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()
    yield monkeypatch
    get_settings.cache_clear()


def test_email_is_off_until_a_provider_is_configured_855(mail_env):
    assert mailer.email_enabled() is False
    assert mailer.send_email("a@x.test", "s", "<p>h</p>", "t") is False
    mail_env.setenv("SMTP_HOST", "smtp.example.test")
    get_settings.cache_clear()
    assert mailer.email_enabled() is True
    mail_env.delenv("SMTP_HOST")
    mail_env.setenv("RESEND_API_KEY", "re_test")
    get_settings.cache_clear()
    assert mailer.email_enabled() is True


def test_resend_gets_the_message_with_the_key_and_sender_855(mail_env):
    mail_env.setenv("RESEND_API_KEY", "re_secret")
    mail_env.setenv("EMAIL_FROM", "Planner <hi@example.test>")
    get_settings.cache_clear()
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append((url, headers, json))
        return httpx.Response(200, request=httpx.Request("POST", url))

    mail_env.setattr(httpx, "post", fake_post)

    assert mailer.send_email("a@x.test", "Subj", "<p>h</p>", "t") is True

    url, headers, payload = calls[0]
    assert url == "https://api.resend.com/emails"
    assert headers["Authorization"] == "Bearer re_secret"
    assert payload == {
        "from": "Planner <hi@example.test>", "to": ["a@x.test"], "subject": "Subj", "html": "<p>h</p>", "text": "t",
    }


def test_a_rejected_resend_call_is_a_failed_send_not_an_error_855(mail_env, caplog):
    mail_env.setenv("RESEND_API_KEY", "re_secret")
    get_settings.cache_clear()
    mail_env.setattr(
        httpx, "post", lambda url, **k: httpx.Response(422, request=httpx.Request("POST", url))
    )

    assert mailer.send_email("someone@x.test", "s", "h", "t") is False
    assert "someone@x.test" not in caplog.text and "re_secret" not in caplog.text


def test_smtp_sends_over_starttls_with_the_login_855(mail_env):
    import smtplib

    mail_env.setenv("SMTP_HOST", "smtp.example.test")
    mail_env.setenv("SMTP_PORT", "2525")
    mail_env.setenv("SMTP_USER", "user")
    mail_env.setenv("SMTP_PASSWORD", "pw")
    get_settings.cache_clear()
    log: list = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            log.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context):
            log.append(("starttls",))

        def login(self, user, password):
            log.append(("login", user, password))

        def send_message(self, msg):
            log.append(("send", msg["To"], msg["Subject"]))

    mail_env.setattr(smtplib, "SMTP", FakeSMTP)

    assert mailer.send_email("a@x.test", "Subj", "<p>h</p>", "t") is True
    assert log == [
        ("connect", "smtp.example.test", 2525),
        ("starttls",),
        ("login", "user", "pw"),
        ("send", "a@x.test", "Subj"),
    ]


def test_gmail_smtp_sends_from_the_login_address_when_no_sender_is_set_860(mail_env):
    import smtplib

    mail_env.setenv("SMTP_HOST", "smtp.gmail.com")
    mail_env.setenv("SMTP_USER", "planner@gmail.com")
    mail_env.setenv("SMTP_PASSWORD", "app-password")
    get_settings.cache_clear()
    sent: list = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context):
            pass

        def login(self, user, password):
            pass

        def send_message(self, msg):
            sent.append(msg["From"])

    mail_env.setattr(smtplib, "SMTP", FakeSMTP)

    assert mailer.send_email("a@x.test", "Subj", "<p>h</p>", "t") is True
    assert sent == ["OPTCG Planner <planner@gmail.com>"]
