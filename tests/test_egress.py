import pathlib
import re

import httpx
import pytest

from app.egress import AllowlistTransport, EgressBlocked, make_client

APP_DIR = pathlib.Path(__file__).resolve().parent.parent / "app"


def ok_transport(calls=None):
    def handler(req: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(str(req.url))
        return httpx.Response(200, json={"ok": True})
    return httpx.MockTransport(handler)


async def test_allowed_host_passes():
    calls = []
    async with make_client(frozenset({"api.groq.com"}), ok_transport(calls)) as c:
        r = await c.get("https://api.groq.com/x")
    assert r.status_code == 200 and calls == ["https://api.groq.com/x"]


async def test_disallowed_host_blocked_before_reaching_network():
    calls = []
    async with make_client(frozenset({"api.groq.com"}), ok_transport(calls)) as c:
        with pytest.raises(EgressBlocked):
            await c.get("https://evil.example.com/steal")
    assert calls == []  # the inner transport was never called


async def test_lookalike_host_blocked():
    async with make_client(frozenset({"api.groq.com"}), ok_transport()) as c:
        with pytest.raises(EgressBlocked):
            await c.get("https://api.groq.com.evil.io/")


async def test_redirect_to_disallowed_host_is_blocked():
    def handler(req):
        if req.url.host == "api.groq.com":
            return httpx.Response(302, headers={"location": "https://evil.example.com/"})
        return httpx.Response(200)
    async with make_client(frozenset({"api.groq.com"}), httpx.MockTransport(handler),
                           follow_redirects=True) as c:
        with pytest.raises(EgressBlocked):
            await c.get("https://api.groq.com/")


async def test_bypass_via_direct_transport_use_still_goes_through_guard():
    # Anything holding the client, however it calls it, hits the transport guard.
    t = AllowlistTransport(frozenset({"api.groq.com"}), ok_transport())
    async with httpx.AsyncClient(transport=t) as c:
        with pytest.raises(EgressBlocked):
            await c.request("POST", "https://evil.example.com/")


def test_no_unguarded_http_clients_in_source_tree():
    """A guard only protects the paths it sits on: fail if any module builds its own client."""
    banned = re.compile(r"httpx\.(Async)?Client\(|import requests|urllib\.request|import aiohttp|http\.client")
    offenders = []
    for f in APP_DIR.rglob("*.py"):
        if f.name == "egress.py":
            continue
        for n, line in enumerate(f.read_text().splitlines(), 1):
            if banned.search(line):
                offenders.append(f"{f.name}:{n}: {line.strip()}")
    assert not offenders, "construct HTTP clients only via egress.make_client():\n" + "\n".join(offenders)
