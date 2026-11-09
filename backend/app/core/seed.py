"""Reference data written at startup, after the schema is at head.

Schema changes belong to Alembic migrations; this is data the app expects to
find: the admin accounts, the two historic eval runs and the first event.
Every step is idempotent, so running it on each boot (in each worker, under
``app.core.db.startup_lock``) changes nothing on a seeded database.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import Engine, bindparam, func, select, text
from sqlalchemy.orm import Session

from app.analyst.models import AnalystEvalRun
from app.core.config import get_settings


def sync_admin_role(bind: Engine) -> None:
    """Admins are exactly settings.admin_email's accounts. Any other admin row goes back to user (#667, #1209)."""
    admins = sorted(get_settings().admin_email_set)
    with bind.begin() as conn:
        conn.execute(
            text("UPDATE users SET role = 'user' WHERE role = 'admin' AND lower(email) NOT IN :emails").bindparams(
                bindparam("emails", expanding=True)
            ),
            {"emails": admins},
        )
        conn.execute(
            text("UPDATE users SET role = 'admin' WHERE lower(email) IN :emails AND role <> 'admin'").bindparams(
                bindparam("emails", expanding=True)
            ),
            {"emails": admins},
        )


# The eval runs from before the admin page, so the accuracy chart starts with history (#667).
_HISTORIC_EVAL_RUNS = (
    {
        "run_at": datetime(2026, 10, 8, 0, 45, tzinfo=timezone.utc),
        "label": "Baseline",
        "model": "claude-opus-5-5",
        "correct": 43.5,
        "total": 50,
        "groups": {"A": {"correct": 15, "total": 15}, "B": {"correct": 11.5, "total": 12}, "C": {"correct": 13, "total": 13}, "D": {"correct": 4, "total": 10}},
        "spend_usd": 5.97,
        "notes": "Paid eval, 50 cases x 2 reps",
    },
    {
        "run_at": datetime(2026, 10, 8, 1, 30, tzinfo=timezone.utc),
        "label": "PR #415 prompt + grader",
        "model": "claude-opus-5-5",
        "correct": 48.5,
        "total": 50,
        "groups": {"A": {"correct": 15, "total": 15}, "B": {"correct": 11.5, "total": 12}, "C": {"correct": 13, "total": 13}, "D": {"correct": 9, "total": 10}},
        "spend_usd": 7.14,
        "notes": "Grader, D judge and prompt all changed; D jump not split between Log Pose and grading",
    },
)


def seed_eval_runs(bind: Engine) -> None:
    """Insert the two historic eval runs when the table is empty."""
    with Session(bind) as session:
        if session.scalar(select(func.count()).select_from(AnalystEvalRun)):
            return
        for run in _HISTORIC_EVAL_RUNS:
            session.add(AnalystEvalRun(**{**run, "groups": json.dumps(run["groups"])}))
        session.commit()


def seed_default_event(bind: Engine) -> None:
    """Stress Test Sunday as the first admin-managed event (#1019)."""
    from app.duel import events as ev

    with Session(bind) as session:
        ev.seed_default_event(session)


def seed_reference_data(bind: Engine, *, new_database: bool) -> None:
    """Run every seed step. ``new_database``: the schema was just created from nothing."""
    sync_admin_role(bind)
    seed_eval_runs(bind)
    # Only the startup that creates duel_events seeds it, so deleting every event stays deleted.
    if new_database:
        seed_default_event(bind)
