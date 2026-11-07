"""Admin request/response models: feedback."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FeedbackIn(BaseModel):
    """A player's problem report, idea or other note, with light context."""

    # Strip first so a padded two-word note cannot pass the length floor.
    model_config = ConfigDict(str_strip_whitespace=True)

    kind: Literal["bug", "idea", "other"]
    message: str = Field(min_length=10, max_length=2000)
    app: Literal["duel", "planner"]
    page: str = Field(default="", max_length=200)
    client_build: str = Field(default="", max_length=40)
    viewport: str = Field(default="", max_length=32)
    user_agent: str = Field(default="", max_length=300)
    room_id: str = Field(default="", max_length=64)


class FeedbackOut(BaseModel):
    id: int
    kind: str
    message: str
    app: str
    page: str
    client_build: str
    viewport: str
    user_agent: str
    room_id: str
    user_id: int | None
    reporter: str
    status: str
    created_at: str
    # GitHub issue opened for a Discord ticket: https://github.com/<repo>/issues/<n>
    github_issue: int | None = None


class FeedbackStatusIn(BaseModel):
    status: str = Field(pattern=r"^(open|fixed|wontfix)$")
