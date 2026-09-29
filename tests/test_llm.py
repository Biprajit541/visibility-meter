import httpx
import pytest

from app.egress import make_client
from app.llm import GroqClient, LLMError


def client_for(handler):
    return GroqClient(make_client(frozenset({"api.groq.com"}), httpx.MockTransport(handler)), "k", "m")


def tool_msg(name="submit_mentions", args='{"mentions": []}', n=1):
    call = {"id": "1", "type": "function", "function": {"name": name, "arguments": args}}
    return {"choices": [{"message": {"content": None, "tool_calls": [call] * n}}]}


async def test_call_tool_sends_forced_tool_and_returns_arguments():
    seen = {}

    def handler(req):
        seen["body"] = __import__("json").loads(req.content)
        return httpx.Response(200, json=tool_msg())
    out = await client_for(handler).call_tool("s", "u", tool_name="submit_mentions", parameters={"type": "object"})
    assert out == '{"mentions": []}'
    assert seen["body"]["tool_choice"]["function"]["name"] == "submit_mentions"
    assert seen["body"]["tools"][0]["function"]["parameters"] == {"type": "object"}


@pytest.mark.parametrize("payload", [tool_msg(name="other"), tool_msg(n=2), tool_msg(args=""),
                                     {"choices": [{"message": {"content": "plain text"}}]}])
async def test_call_tool_rejects_wrong_or_missing_tool_call(payload):
    c = client_for(lambda req: httpx.Response(200, json=payload))
    with pytest.raises(LLMError):
        await c.call_tool("s", "u", tool_name="submit_mentions", parameters={})


async def test_http_error_becomes_llm_error():
    c = client_for(lambda req: httpx.Response(500))
    with pytest.raises(LLMError):
        await c.complete("s", "u")


def ok_chat(text="hi"):
    return {"choices": [{"message": {"content": text}}]}


async def test_429_is_retried_with_retry_after_then_succeeds():
    delays, calls = [], {"n": 0}

    def handler(req):
        calls["n"] += 1
        if calls["n"] <= 2:
            return httpx.Response(429, headers={"retry-after": "3"}, json={"error": {"message": "rate limit"}})
        return httpx.Response(200, json=ok_chat("done"))

    async def fake_sleep(d):
        delays.append(d)
    http = make_client(frozenset({"api.groq.com"}), httpx.MockTransport(handler))
    assert await GroqClient(http, "k", "m", sleep=fake_sleep).complete("s", "u") == "done"
    assert delays == [3.0, 3.0] and calls["n"] == 3


async def test_persistent_429_gives_up_after_bounded_retries_and_reports_detail():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(429, json={"error": {"message": "Rate limit reached for model"}})

    async def no_sleep(d):
        pass
    http = make_client(frozenset({"api.groq.com"}), httpx.MockTransport(handler))
    with pytest.raises(LLMError, match="HTTP 429: Rate limit reached"):
        await GroqClient(http, "k", "m", sleep=no_sleep).complete("s", "u")
    assert calls["n"] == 4  # 1 try + 3 retries


async def test_non_429_errors_are_not_retried():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(404, json={"error": {"message": "model not found"}})
    with pytest.raises(LLMError, match="HTTP 404: model not found"):
        await client_for(handler).complete("s", "u")
    assert calls["n"] == 1