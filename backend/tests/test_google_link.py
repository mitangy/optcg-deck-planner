from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.auth import resolve_google_user
from tests.conftest import make_user


def test_resolve_creates_new_user(db):
    user = resolve_google_user(
        db, email="new@example.com", sub="sub-new", name="New"
    )
    assert user.email == "new@example.com"
    assert user.google_sub == "sub-new"


def test_resolve_links_email_without_google_sub(db):
    existing = make_user(db, email="link@example.com", name="Link", sub="placeholder")
    # Simulate a local/dev row that will be claimed by Google later:
    existing.google_sub = ""
    db.commit()
    user = resolve_google_user(
        db, email="link@example.com", sub="sub-link", name="Linked"
    )
    assert user.id == existing.id
    assert user.google_sub == "sub-link"


def test_resolve_refuses_rebind_to_different_sub(db):
    make_user(db, email="taken@example.com", name="Taken", sub="sub-original")
    with pytest.raises(HTTPException) as exc:
        resolve_google_user(
            db, email="taken@example.com", sub="sub-attacker", name="Attacker"
        )
    assert exc.value.status_code == 403
