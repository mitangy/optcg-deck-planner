"""The API's Log Pose constants equal the values in packages/analyst-contract (refactor 2.5).

`packages/analyst-contract/fixtures/backend-values.json` is also read by
`packages/analyst-contract/src/contract.test.ts`, so the API, the analyst service and the client cannot drift apart.
"""

import json
from pathlib import Path
from typing import get_args

from app.analyst.access import CHAT_MODELS
from app.schemas import ANALYST_SCOPE_PATTERN, AnalystChatBudget, AnalystUsageIn

FIXTURE = Path(__file__).resolve().parents[2] / "packages" / "analyst-contract" / "fixtures" / "backend-values.json"
CONTRACT = json.loads(FIXTURE.read_text("utf-8"))


def _literals(model, field):
    """The string literals a model field allows (its annotation minus None)."""
    return [v for arg in get_args(model.model_fields[field].annotation) for v in get_args(arg)]


def test_scope_pattern_matches_the_shared_contract():
    assert ANALYST_SCOPE_PATTERN == CONTRACT["scopePattern"]


def test_chat_models_match_the_shared_contract():
    assert list(CHAT_MODELS) == CONTRACT["chatModels"]


def test_budget_refusals_match_the_shared_contract():
    assert _literals(AnalystChatBudget, "refusal") == CONTRACT["budgetRefusals"]


def test_usage_refusals_match_the_shared_contract():
    assert _literals(AnalystUsageIn, "refusal") == CONTRACT["usageRefusals"]
