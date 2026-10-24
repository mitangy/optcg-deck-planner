"""Account roles (#667): who may change roles, ban and delete. Pure helpers, no database.

user < moderator < admin. Only one admin exists (settings.admin_email, set on startup); nobody
can grant it. Moderators may ban and unban plain users and have no delete powers.
"""

from __future__ import annotations

from typing import Protocol

ROLES = ("user", "moderator", "admin")
# What the admin may hand out through the API.
ASSIGNABLE_ROLES = ("user", "moderator")


class _Account(Protocol):
    id: int
    role: str
    banned_at: object


def is_admin(u: _Account) -> bool:
    return u.role == "admin"


def is_staff(u: _Account) -> bool:
    return u.role in ("admin", "moderator")


def is_banned(u: _Account) -> bool:
    return u.banned_at is not None


def can_set_role(actor: _Account, target: _Account, role: str) -> str | None:
    """Why `actor` may not set `target` to `role`, or None when allowed."""
    if not is_admin(actor):
        return "Only the admin can change roles"
    if role not in ASSIGNABLE_ROLES:
        return "That role cannot be assigned"
    if actor.id == target.id:
        return "You cannot change your own role"
    if is_admin(target):
        return "The admin's role cannot be changed"
    return None


def can_ban(actor: _Account, target: _Account) -> str | None:
    """Why `actor` may not ban (or unban) `target`, or None when allowed."""
    if not is_staff(actor):
        return "Staff only"
    if actor.id == target.id:
        return "You cannot ban yourself"
    if is_admin(target):
        return "The admin cannot be banned"
    if not is_admin(actor) and target.role != "user":
        return "Moderators can only ban players"
    return None


def can_delete(actor: _Account, target: _Account) -> str | None:
    """Why `actor` may not delete `target`'s account, or None when allowed."""
    if not is_admin(actor):
        return "Only the admin can delete accounts"
    if actor.id == target.id:
        return "You cannot delete yourself"
    if is_admin(target):
        return "The admin cannot be deleted"
    return None
