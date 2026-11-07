"""Imports every domain models module so all tables register on the one shared ``Base``.

``Base.metadata.create_all`` (app.core.db.init_db) and Alembic autogenerate (migrations/env.py) only
see tables whose model module has been imported; import this module, not the individual packages,
wherever the full table set matters.
"""

from __future__ import annotations

from app.admin import models as admin_models
from app.analyst import models as analyst_models
from app.core import models as core_models
from app.core.base import Base
from app.duel import models as duel_models
from app.group_buy import models as group_buy_models
from app.planner import models as planner_models
from app.social import models as social_models

MODEL_MODULES = (
    core_models,
    planner_models,
    group_buy_models,
    duel_models,
    analyst_models,
    social_models,
    admin_models,
)

__all__ = ["Base", "MODEL_MODULES"]
