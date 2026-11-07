"""Traffic tab data for the admin page (#1020): Vercel Web Analytics and Render service metrics.

Read server-side with the tokens already set for the Hosting tab, so no token reaches the browser. Each provider is
cached per window for ten minutes; a provider without a token is {"configured": False}; a failed provider call is
{"configured": True, "error": "..."}; one project or service that fails is a row with an "error" and the rest still load.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

import httpx

from app.admin.hosting import ProviderError, _client, _get
from app.config import Settings

CACHE_SECONDS = 600
RENDER_KEEPS_DAYS = 30
POOL_SIZE = 6
PROJECT_PREFIX = "optcg-"
_cache: dict[tuple[str, int], tuple[float, dict]] = {}
_lock = threading.Lock()

VERCEL = "https://api.vercel.com"
RENDER = "https://api.render.com/v1"
# (output key, Vercel dimension, row limit)
_BREAKDOWNS = (("pages", "requestPath", 8), ("referrers", "referrerHostname", 8), ("countries", "country", 8), ("devices", "deviceType", 5))
# Render rejects a query with too many points, so the resolution grows with the window.
_RESOLUTIONS = (60, 300, 900, 3600, 21600, 86400)
MAX_POINTS = 100


def _run_all(fns: list[Callable[[], Any]]) -> list[Any]:
    """Run the calls on a small pool; a call that raised gives its exception in place of a result."""
    def safe(fn: Callable[[], Any]) -> Any:
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - handed back to the caller to judge
            return e

    with ThreadPoolExecutor(max_workers=POOL_SIZE) as pool:
        return list(pool.map(safe, fns))


def _window(now: datetime, days: int) -> tuple[datetime, list[date]]:
    """The first instant (UTC midnight) and every date of the last `days` days, today last."""
    today = now.date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    return datetime(dates[0].year, dates[0].month, dates[0].day, tzinfo=timezone.utc), dates


def _stamp(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _problem(e: Exception) -> str:
    return str(e) if isinstance(e, ProviderError) else "Unexpected response"


# ---------------------------------------------------------------- Vercel Web Analytics

def _vercel_project(client: httpx.Client, headers: dict, team: dict, project: dict, start: datetime, now: datetime, dates: list[date]) -> dict:
    base = {"projectId": project["id"], **team, "since": _stamp(start), "until": _stamp(now)}

    def query(kind: str, **extra: Any) -> Any:
        return lambda: _get(client, f"{VERCEL}/v1/query/web-analytics/visits/{kind}", headers=headers, params={**base, **extra})

    calls = [query("count"), query("aggregate", by="day", limit=100)]
    calls += [query("aggregate", by=dim, limit=limit) for _, dim, limit in _BREAKDOWNS]
    results = _run_all(calls)
    for r in results:
        if isinstance(r, Exception):
            raise r
    count, daily, *rest = results
    by_day = {str(r.get("timestamp", ""))[:10]: r for r in daily["data"]}
    out: dict[str, Any] = {
        "name": project.get("name"),
        # Visitors are unique across the window, so the total is its own count and never the sum of the days.
        "totals": {"visitors": count["data"]["visitors"], "pageviews": count["data"]["pageviews"]},
        "daily": [
            {"date": d.isoformat(), "visitors": by_day.get(d.isoformat(), {}).get("visitors", 0), "pageviews": by_day.get(d.isoformat(), {}).get("pageviews", 0)}
            for d in dates
        ],
    }
    for (key, dim, _), res in zip(_BREAKDOWNS, rest):
        out[key] = [{"key": r.get(dim) or "", "visitors": r.get("visitors", 0), "pageviews": r.get("pageviews", 0)} for r in res["data"]]
    return out


def fetch_vercel(settings: Settings, client: httpx.Client, days: int) -> dict:
    headers = {"Authorization": f"Bearer {settings.vercel_token}"}
    team = {"teamId": settings.vercel_team_id} if settings.vercel_team_id else {}
    projects = _get(client, f"{VERCEL}/v9/projects", headers=headers, params=team).get("projects", [])
    # The team also holds unrelated projects (a personal budget app); only the OPTCG sites belong here.
    projects = [p for p in projects if str(p.get("name", "")).startswith(PROJECT_PREFIX)]
    now = datetime.now(timezone.utc)
    start, dates = _window(now, days)

    def one(p: dict) -> Callable[[], dict]:
        def go() -> dict:
            try:
                return _vercel_project(client, headers, team, p, start, now, dates)
            except Exception as e:  # noqa: BLE001 - one project failing must not hide the others
                return {"name": p.get("name"), "error": _problem(e)}

        return go

    return {"projects": _run_all([one(p) for p in projects])}


# ---------------------------------------------------------------- Render metrics

def _label(series: dict, field: str) -> str | None:
    for lab in series.get("labels") or []:
        if lab.get("field") == field:
            return lab.get("value")
    return None


def _summed(series: list[dict]) -> list[float]:
    """One total per timestamp across instances, oldest first."""
    by_time: dict[str, float] = {}
    for s in series:
        for v in s.get("values") or []:
            by_time[v["timestamp"]] = by_time.get(v["timestamp"], 0) + v["value"]
    return [by_time[t] for t in sorted(by_time)]


def _limit(client: httpx.Client, headers: dict, kind: str, sid: str) -> float | None:
    try:
        series = _get(client, f"{RENDER}/metrics/{kind}", headers=headers, params={"resource": sid}) or []
    except ProviderError:
        return None
    latest = [s["values"][-1]["value"] for s in series if s.get("values")]
    return sum(latest) if latest else None


def _resolution(days: int) -> int:
    need = days * 86400 / MAX_POINTS
    return next((r for r in _RESOLUTIONS if r >= need), _RESOLUTIONS[-1])


def _render_service(client: httpx.Client, headers: dict, svc: dict, start: datetime, now: datetime, dates: list[date]) -> dict:
    sid = svc["id"]
    span = {"resource": sid, "startTime": _stamp(start), "endTime": _stamp(now)}
    res = _resolution(len(dates))
    get = lambda kind, **p: _get(client, f"{RENDER}/metrics/{kind}", headers=headers, params={**span, **p}) or []  # noqa: E731
    requests = get("http-requests", resolutionSeconds=86400, aggregateBy="statusCode")
    cpu = _summed(get("cpu", resolutionSeconds=res))
    mem = _summed(get("memory", resolutionSeconds=res))
    daily = {d.isoformat(): {"date": d.isoformat(), "total": 0, "errors_5xx": 0} for d in dates}
    e4 = 0
    for s in requests:
        code = str(_label(s, "statusCode") or "")
        for v in s.get("values") or []:
            row = daily.get(str(v["timestamp"])[:10])
            if row is None:
                continue
            n = int(v["value"])
            row["total"] += n
            if code.startswith("5"):
                row["errors_5xx"] += n
            elif code.startswith("4"):
                e4 += n
    rows = list(daily.values())
    return {
        "name": svc.get("name"),
        "type": svc.get("type"),
        "requests_daily": rows,
        "requests": sum(r["total"] for r in rows),
        "errors_5xx": sum(r["errors_5xx"] for r in rows),
        "errors_4xx": e4,
        "cpu_avg": round(sum(cpu) / len(cpu), 4) if cpu else None,
        "cpu_peak": round(max(cpu), 4) if cpu else None,
        "cpu_limit": _limit(client, headers, "cpu-limit", sid),
        "memory_avg": round(sum(mem) / len(mem)) if mem else None,
        "memory_peak": round(max(mem)) if mem else None,
        "memory_limit": _limit(client, headers, "memory-limit", sid),
    }


def fetch_render(settings: Settings, client: httpx.Client, days: int) -> dict:
    headers = {"Authorization": f"Bearer {settings.render_api_key}", "Accept": "application/json"}
    rows = _get(client, f"{RENDER}/services", headers=headers, params={"limit": 20}) or []
    window = min(days, RENDER_KEEPS_DAYS)
    now = datetime.now(timezone.utc)
    start, dates = _window(now, window)
    services = [r.get("service", r) for r in rows]
    # A suspended service has no traffic; a static site has no service metrics.
    services = [s for s in services if s.get("suspended") != "suspended" and s.get("type") != "static_site"]

    def one(s: dict) -> Callable[[], dict]:
        def go() -> dict:
            try:
                return _render_service(client, headers, s, start, now, dates)
            except Exception as e:  # noqa: BLE001 - one service failing must not hide the others
                return {"name": s.get("name"), "error": _problem(e)}

        return go

    return {"days": window, "services": _run_all([one(s) for s in services])}


# ---------------------------------------------------------------- entry points

_TOKENS = {"vercel": lambda s: s.vercel_token, "render": lambda s: s.render_api_key}
_FETCHERS: dict[str, Callable[[Settings, httpx.Client, int], dict]] = {"vercel": fetch_vercel, "render": fetch_render}


def provider(settings: Settings, name: str, days: int, *, refresh: bool = False) -> dict:
    if not _TOKENS[name](settings):
        return {"configured": False}
    now = time.monotonic()
    with _lock:
        hit = _cache.get((name, days))
    if hit and not refresh and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    try:
        with _client() as client:
            data = {"configured": True, **_FETCHERS[name](settings, client, days)}
    except ProviderError as e:
        data = {"configured": True, "error": str(e)}
    except (KeyError, TypeError, AttributeError):
        data = {"configured": True, "error": "Unexpected response"}
    data["fetched_at"] = datetime.now(timezone.utc).isoformat()
    if "error" not in data:  # a failed call is retried on the next load, not cached
        with _lock:
            _cache[(name, days)] = (now, data)
    return data


def traffic(settings: Settings, days: int, *, refresh: bool = False) -> dict:
    out: dict[str, Any] = {"days": days}
    for name in _FETCHERS:
        out[name] = provider(settings, name, days, refresh=refresh)
    return out


def clear_cache() -> None:
    with _lock:
        _cache.clear()
