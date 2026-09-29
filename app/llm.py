"""Thin Groq chat-completions client (OpenAI-compatible). Uses the guarded client only."""
from __future__ import annotations

import asyncio

import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_RATE_LIMIT_RETRIES = 3   # bounded: a persistent 429 still becomes a failed sample
MAX_WAIT_SECONDS = 60.0  # free-tier token limits reset per minute


class LLMError(Exception):
    """The provider call failed or returned an unusable envelope."""


def _retry_delay(resp: httpx.Response, attempt: int) -> float:
    try:
        wait = float(resp.headers.get("retry-after", ""))
    except ValueError:
        wait = 2.0 * (2 ** attempt)
    return max(0.5, min(wait, MAX_WAIT_SECONDS))


class GroqClient:
    def __init__(self, http: httpx.AsyncClient, api_key: str, model: str, sleep=asyncio.sleep):
        self._http = http
        self._key = api_key
        self._model = model
        self._sleep = sleep

    async def _post(self, body: dict) -> dict:
        attempt = 0
        while True:
            try:
                r = await self._http.post(GROQ_URL, json=body,
                                          headers={"Authorization": f"Bearer {self._key}"})
            except httpx.HTTPError as e:  # network/timeouts. EgressBlocked is NOT caught here.
                raise LLMError(f"transport error: {type(e).__name__}") from e
            if r.status_code == 429 and attempt < MAX_RATE_LIMIT_RETRIES:
                await self._sleep(_retry_delay(r, attempt))
                attempt += 1
                continue
            break
        if r.status_code != 200:
            detail = ""
            try:
                detail = str(r.json().get("error", {}).get("message", ""))[:200]
            except (ValueError, AttributeError):
                pass
            raise LLMError(f"provider returned HTTP {r.status_code}: {detail}".rstrip(": "))
        try:
            return r.json()["choices"][0]["message"]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError("malformed provider response") from e

    def _messages(self, system: str, user: str) -> list[dict]:
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    async def complete(self, system: str, user: str, *, temperature: float = 0.2,
                       max_tokens: int | None = None) -> str:
        body: dict = {"model": self._model, "temperature": temperature,
                      "messages": self._messages(system, user)}
        if max_tokens:
            body["max_tokens"] = max_tokens
        msg = await self._post(body)
        content = msg.get("content")
        if not isinstance(content, str) or not content.strip():
            raise LLMError("empty completion")
        return content

    async def call_tool(self, system: str, user: str, *, tool_name: str, parameters: dict,
                        temperature: float = 0.0) -> str:
        """Force the model to call one tool; return the raw JSON arguments string.
        The arguments are untrusted model output: the caller validates them against a schema."""
        msg = await self._post({
            "model": self._model, "temperature": temperature,
            "messages": self._messages(system, user),
            "tools": [{"type": "function", "function": {
                "name": tool_name, "description": "Submit the extracted brand mentions.",
                "parameters": parameters}}],
            "tool_choice": {"type": "function", "function": {"name": tool_name}},
        })
        calls = msg.get("tool_calls") or []
        if len(calls) != 1 or calls[0].get("function", {}).get("name") != tool_name:
            raise LLMError("model did not call the required tool exactly once")
        args = calls[0]["function"].get("arguments")
        if not isinstance(args, str) or not args.strip():
            raise LLMError("tool call had no arguments")
        return args