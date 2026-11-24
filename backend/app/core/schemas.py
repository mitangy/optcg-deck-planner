
from __future__ import annotations

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    username: str | None = None
    sum_across_leaders: bool = False
    share_scans: bool = True
    role: str = "user"

    model_config = {"from_attributes": True}


class UsernameUpdate(BaseModel):
    username: str = Field(max_length=64)


class UsernameSuggestionOut(BaseModel):
    username: str


class UserPreferencesUpdate(BaseModel):
    sum_across_leaders: bool | None = None
    share_scans: bool | None = None


CARD_ID_PATTERN = r"^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$"
