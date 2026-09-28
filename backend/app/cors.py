"""CORS with two trust tiers.

Exact-listed origins (planner, duel-web production) get credentialed CORS so
cookie sessions work. Origins that only match ``credentialless_regex`` (Vercel
branch URLs) get CORS *without* ``Access-Control-Allow-Credentials``: a
look-alike hostname that happens to match the pattern can call public
endpoints (guest token mint) but can never read a response to a request that
carried the user's session cookie.
"""

from __future__ import annotations

import re

from starlette.datastructures import Headers
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send


class TieredCORSMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        credentialed_origins: list[str],
        credentialless_regex: str | None = None,
    ) -> None:
        self._exact = frozenset(credentialed_origins)
        self._credentialed = CORSMiddleware(
            app,
            allow_origins=credentialed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        self._pattern = re.compile(credentialless_regex) if credentialless_regex else None
        self._credentialless = (
            CORSMiddleware(
                app,
                allow_origin_regex=credentialless_regex,
                allow_credentials=False,
                allow_methods=["*"],
                allow_headers=["*"],
            )
            if credentialless_regex
            else None
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and self._pattern is not None:
            origin = Headers(scope=scope).get("origin")
            if origin and origin not in self._exact and self._pattern.fullmatch(origin):
                await self._credentialless(scope, receive, send)
                return
        await self._credentialed(scope, receive, send)
