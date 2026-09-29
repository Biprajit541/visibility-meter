"""Outbound HTTP guard, enforced at the transport layer.

Lesson from the JD: a guard only protects the paths it sits on. So this sits on the
lowest path we control (the httpx transport) and every HTTP client in the codebase
must come from make_client(). tests/test_egress.py scans the source tree and fails
if anything else constructs a client.
"""
from __future__ import annotations

import httpx

DEFAULT_ALLOWED_HOSTS = frozenset({"api.groq.com"})


class EgressBlocked(Exception):
    """Raised when a request targets a host outside the allowlist."""


class AllowlistTransport(httpx.AsyncBaseTransport):
    def __init__(self, allowed_hosts: frozenset[str], inner: httpx.AsyncBaseTransport | None = None):
        self._allowed = frozenset(h.lower() for h in allowed_hosts)
        self._inner = inner or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        host = (request.url.host or "").lower()
        if host not in self._allowed:
            raise EgressBlocked(f"host '{host}' is not on the egress allowlist")
        return await self._inner.handle_async_request(request)

    async def aclose(self) -> None:
        await self._inner.aclose()


def make_client(
    allowed_hosts: frozenset[str] = DEFAULT_ALLOWED_HOSTS,
    inner_transport: httpx.AsyncBaseTransport | None = None,
    **kwargs,
) -> httpx.AsyncClient:
    kwargs.setdefault("timeout", httpx.Timeout(30.0))
    return httpx.AsyncClient(transport=AllowlistTransport(allowed_hosts, inner_transport), **kwargs)
