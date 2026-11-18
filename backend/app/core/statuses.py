
from __future__ import annotations

from enum import StrEnum


class GroupBuyStatus(StrEnum):
    OPEN = "open"
    LOCKED = "locked"
    ORDERED = "ordered"
    COMPLETED = "completed"


class ReceiptLineStatus(StrEnum):
    MISSING = "missing"
    EXACT = "exact"
    SURPLUS = "surplus"
    SHORT = "short"
    EXTRA = "extra"


class AccessStatus(StrEnum):
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
    OPEN = "open"
    FIXED = "fixed"
    WONTFIX = "wontfix"


class ReportStatus(StrEnum):
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
