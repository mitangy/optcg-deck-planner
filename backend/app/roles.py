
from __future__ import annotations

from enum import StrEnum
from typing import Protocol


class Role(StrEnum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


ROLES = (Role.USER, Role.MODERATOR, Role.ADMIN)
ASSIGNABLE_ROLES = (Role.USER, Role.MODERATOR)
STAFF_ROLES = (Role.ADMIN, Role.MODERATOR)


class _Account(Protocol):
    id: int
    role: str
    banned_at: object


def is_admin(u: _Account) -> bool:
    return u.role == Role.ADMIN


def is_staff(u: _Account) -> bool:
    return u.role in STAFF_ROLES


def is_banned(u: _Account) -> bool:
    return u.banned_at is not None


def can_set_role(actor: _Account, target: _Account, role: str) -> str | None:
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
    if not is_staff(actor):
        return "Staff only"
    if actor.id == target.id:
        return "You cannot ban yourself"
    if is_admin(target):
        return "The admin cannot be banned"
    if not is_admin(actor) and target.role != Role.USER:
        return "Moderators can only ban players"
    return None


def can_delete(actor: _Account, target: _Account) -> str | None:
    if not is_admin(actor):
        return "Only the admin can delete accounts"
    if actor.id == target.id:
        return "You cannot delete yourself"
    if is_admin(target):
        return "The admin cannot be deleted"
    return None
