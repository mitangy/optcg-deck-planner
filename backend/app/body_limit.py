"""Reject oversized request bodies before a route reads them.

Uvicorn and Starlette buffer a whole body in memory when a route parses it, so
without a cap one large POST (to any route, signed in or not) can exhaust the
instance's memory. Most bodies here are a few KB; the few routes that take
more name their own ceiling.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEFAULT_MAX_BODY_BYTES = 1024 * 1024
# (path prefix, ceiling). Cosmetic uploads stream with their own tighter check;
# match ingest is secret-gated and carries a replay plus two seat logs.
ROUTE_MAX_BODY_BYTES: tuple[tuple[str, int], ...] = (
    ("/duel/cosmetics/", 5 * 1024 * 1024),
    ("/duel/matches", 8 * 1024 * 1024),
)


class BodyTooLarge(Exception):
    pass


def body_limit_for(path: str) -> int:
    for prefix, limit in ROUTE_MAX_BODY_BYTES:
        if path.startswith(prefix):
            return limit
    return DEFAULT_MAX_BODY_BYTES


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = body_limit_for(scope.get("path", ""))
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = 0
                if declared > limit:
                    await _too_large(send)
                    return

        # Chunked bodies carry no Content-Length: count what actually arrives.
        received = 0
        started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise BodyTooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except BodyTooLarge:
            if not started:
                await _too_large(send)


async def _too_large(send: Send) -> None:
    body = b'{"detail":"Request body is too large"}'
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
