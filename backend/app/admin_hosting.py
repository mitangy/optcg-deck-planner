"""Hosting tab data for the admin page (#667): Vercel, Render and GitHub, read with the owner's tokens.

Each provider is cached in memory for five minutes. A provider without a token is {"configured": False};
a failed call is {"configured": True, "error": "..."}. Tokens are never returned and never put in an error.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import httpx

from app.config import Settings

CACHE_SECONDS = 300
TIMEOUT_SECONDS = 8.0
# Tests swap this for an httpx.MockTransport; None means the real network.
_transport: httpx.BaseTransport | None = None
_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()


class ProviderError(Exception):
    """A provider call failed; the message is safe to show (no token, no URL)."""


def _client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT_SECONDS, transport=_transport)


def _get(client: httpx.Client, url: str, *, headers: dict[str, str], params: dict[str, Any] | None = None, allow: tuple[int, ...] = ()) -> Any:
    try:
        r = client.get(url, headers=headers, params=params)
    except httpx.HTTPError as e:
        raise ProviderError(f"Request failed ({type(e).__name__})") from None
    if r.status_code in allow:
        return None
    if r.status_code != 200:
        raise ProviderError(f"HTTP {r.status_code}")
    try:
        return r.json()
    except ValueError:
        raise ProviderError("Unreadable response") from None


def _iso_ms(ms: Any) -> str | None:
    if not isinstance(ms, (int, float)):
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def fetch_vercel(settings: Settings, client: httpx.Client) -> dict:
    headers = {"Authorization": f"Bearer {settings.vercel_token}"}
    team = {"teamId": settings.vercel_team_id} if settings.vercel_team_id else {}
    projects = _get(client, "https://api.vercel.com/v9/projects", headers=headers, params=team).get("projects", [])
    week_ago_ms = (datetime.now(timezone.utc) - timedelta(days=7)).timestamp() * 1000
    out = []
    for p in projects:
        deploys = _get(
            client,
            "https://api.vercel.com/v6/deployments",
            headers=headers,
            params={"projectId": p["id"], "target": "production", "limit": 20, **team},
        ).get("deployments", [])
        latest = None
        if deploys:
            d = deploys[0]
            meta = d.get("meta") or {}
            latest = {
                "state": d.get("state") or d.get("readyState"),
                "created_at": _iso_ms(d.get("created")),
                "url": d.get("url"),
                "commit": (meta.get("githubCommitMessage") or "")[:120] or (meta.get("githubCommitSha") or "")[:7] or None,
            }
        out.append(
            {
                "name": p.get("name"),
                "framework": p.get("framework"),
                "latest": latest,
                "deploys_7d": sum(1 for d in deploys if (d.get("created") or 0) >= week_ago_ms),
            }
        )
    return {"projects": out}


def fetch_render(settings: Settings, client: httpx.Client) -> dict:
    headers = {"Authorization": f"Bearer {settings.render_api_key}", "Accept": "application/json"}
    rows = _get(client, "https://api.render.com/v1/services", headers=headers, params={"limit": 20}) or []
    out = []
    for row in rows:
        svc = row.get("service", row)
        deploys = _get(client, f"https://api.render.com/v1/services/{svc['id']}/deploys", headers=headers, params={"limit": 5}) or []
        latest = None
        if deploys:
            d = deploys[0].get("deploy", deploys[0])
            commit = d.get("commit") or {}
            latest = {
                "status": d.get("status"),
                "finished_at": d.get("finishedAt"),
                "commit": (commit.get("message") or "")[:120] or (commit.get("id") or "")[:7] or None,
            }
        out.append(
            {
                "name": svc.get("name"),
                "type": svc.get("type"),
                "suspended": svc.get("suspended") == "suspended",
                "url": (svc.get("serviceDetails") or {}).get("url"),
                "latest": latest,
            }
        )
    return {"services": out}


def _run(r: dict) -> dict:
    return {"name": r.get("name"), "conclusion": r.get("conclusion") or r.get("status"), "created_at": r.get("created_at"), "html_url": r.get("html_url")}


def fetch_github(settings: Settings, client: httpx.Client) -> dict:
    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    base = f"https://api.github.com/repos/{settings.github_repo}"
    repo = _get(client, base, headers=headers)
    pulls = _get(client, f"{base}/pulls", headers=headers, params={"state": "open", "per_page": 100})
    ci = _get(client, f"{base}/actions/runs", headers=headers, params={"branch": "main", "per_page": 10})
    bots = _get(client, f"{base}/actions/workflows/bot-selfplay.yml/runs", headers=headers, params={"per_page": 7})
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    commits = _get(client, f"{base}/commits", headers=headers, params={"since": since, "per_page": 100})
    views = _get(client, f"{base}/traffic/views", headers=headers, allow=(403,))
    return {
        "repo": settings.github_repo,
        "stars": repo.get("stargazers_count"),
        "open_issues": repo.get("open_issues_count"),
        "open_prs": len(pulls),
        "ci_runs": [_run(r) for r in ci.get("workflow_runs", [])],
        "bot_runs": [_run(r) for r in bots.get("workflow_runs", [])],
        "commits_7d": len(commits),
        "traffic_views": None if views is None else {"count": views.get("count"), "uniques": views.get("uniques")},
    }


def _token(settings: Settings, name: str) -> str:
    return {"vercel": settings.vercel_token, "render": settings.render_api_key, "github": settings.github_token}[name]


_FETCHERS: dict[str, Callable[[Settings, httpx.Client], dict]] = {"vercel": fetch_vercel, "render": fetch_render, "github": fetch_github}


def provider(settings: Settings, name: str, *, refresh: bool = False) -> dict:
    if not _token(settings, name):
        return {"configured": False}
    now = time.monotonic()
    with _lock:
        hit = _cache.get(name)
    if hit and not refresh and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    try:
        with _client() as client:
            data = {"configured": True, **_FETCHERS[name](settings, client)}
    except ProviderError as e:
        data = {"configured": True, "error": str(e)}
    except (KeyError, TypeError, AttributeError):
        data = {"configured": True, "error": "Unexpected response"}
    data["fetched_at"] = datetime.now(timezone.utc).isoformat()
    if "error" not in data:  # a failed call is retried on the next load, not cached
        with _lock:
            _cache[name] = (now, data)
    return data


def hosting(settings: Settings, *, refresh: bool = False) -> dict:
    return {name: provider(settings, name, refresh=refresh) for name in _FETCHERS}


def clear_cache() -> None:
    with _lock:
        _cache.clear()
