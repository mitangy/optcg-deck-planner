"""Status values of the state machines stored as plain strings (refactor D-11).

Every member's value is exactly the string the database column holds and the API returns, so rows
and JSON do not change. ``StrEnum`` members compare equal to those strings, so a stored value can
still be checked against a member (and the other way round), and ``str(member)`` is the value.
"""

from __future__ import annotations

from enum import StrEnum


class GroupBuyStatus(StrEnum):
    OPEN = "open"
    LOCKED = "locked"
    ORDERED = "ordered"
    COMPLETED = "completed"


class AccessStatus(StrEnum):
    """Log Pose chat access (AnalystAccess)."""

    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class LessonStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"


class FriendshipStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"


class TradeStatus(StrEnum):
    PENDING = "pending"
    COUNTERED = "countered"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    EXPIRED = "expired"


class FeedbackStatus(StrEnum):
    """Feedback and card reports share one triage flow."""

    OPEN = "open"
    FIXED = "fixed"
    WONTFIX = "wontfix"


class ReportStatus(StrEnum):
    """Player reports (PlayerReport)."""

    OPEN = "open"
    DISMISSED = "dismissed"
    ACTIONED = "actioned"


class TournamentStatus(StrEnum):
    OPEN = "open"
    RUNNING = "running"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class TournamentPlayerStatus(StrEnum):
    INVITED = "invited"
    JOINED = "joined"


class TournamentMatchStatus(StrEnum):
    WAITING = "waiting"
    READY = "ready"
    DONE = "done"
