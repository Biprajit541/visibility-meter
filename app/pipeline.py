"""Witness -> judge pipeline. The LLM answers and extracts; code validates, scores, gates."""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Protocol

from pydantic import ValidationError

from .egress import EgressBlocked
from .gate import GateConfig, compute_score, evaluate_gate
from .llm import LLMError
from .schemas import (SCHEMA_VERSION, ExtractionResult, HaltCode, HaltReason, RunRecord,
                      RunRequest, RunStatus, SampleRecord, SampleStatus)
from .validator import ValidMention, validate_extraction

MAX_EXTRACTION_ATTEMPTS = 2  # first try + one retry, then the sample is INVALID
CONCURRENCY = 1  # sequential on purpose: free-tier Groq rate limits (HTTP 429)

ANSWER_SYSTEM = (
    "You are a helpful assistant answering a shopper's question. Name specific brands. "
    "Answer in under 120 words, as a short paragraph or a short list."
)
ANSWER_MAX_TOKENS = 1200  # ceiling only (reasoning models spend tokens thinking); brevity comes from the prompt
EXTRACT_SYSTEM = (
    "You extract brand mentions from a text by calling the submit_mentions tool. "
    "Only include brands from the provided list. Each quote must be an exact sentence copied "
    "verbatim from the text that names the brand; never paraphrase."
)
EXTRACT_TOOL = "submit_mentions"
# Hand-written and flat on purpose: some providers handle $defs/$ref poorly. The Pydantic
# model remains the contract; tests/test_pipeline.py checks this schema stays in sync with it.
EXTRACT_TOOL_SCHEMA = {
    "type": "object",
    "properties": {"mentions": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "brand": {"type": "string"},
            "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
            "quote": {"type": "string"},
        },
        "required": ["brand", "sentiment", "quote"],
        "additionalProperties": False,
    }}},
    "required": ["mentions"],
    "additionalProperties": False,
}


class LLM(Protocol):
    async def complete(self, system: str, user: str, *, temperature: float = 0.2,
                       max_tokens: int | None = None) -> str: ...
    async def call_tool(self, system: str, user: str, *, tool_name: str, parameters: dict,
                        temperature: float = 0.0) -> str: ...


class Repo(Protocol):
    async def save_run(self, run: RunRecord) -> None: ...
    async def get_run(self, run_id: str) -> RunRecord | None: ...
    async def list_runs(self, limit: int = 50) -> list[RunRecord]: ...
    async def stats(self, brand: str | None = None, since=None): ...


async def _extract_once(llm: LLM, raw: str, brands: list[str]) -> ExtractionResult:
    out = await llm.call_tool(
        EXTRACT_SYSTEM, f"Brands: {json.dumps(brands)}\n\nText:\n{raw}",
        tool_name=EXTRACT_TOOL, parameters=EXTRACT_TOOL_SCHEMA,
    )
    return ExtractionResult.model_validate_json(out)


async def _run_sample(llm: LLM, prompt: str, brands: list[str]) -> tuple[SampleRecord, list[ValidMention]]:
    try:
        raw = await llm.complete(ANSWER_SYSTEM, prompt, temperature=0.4, max_tokens=ANSWER_MAX_TOKENS)
    except LLMError as e:
        return SampleRecord(prompt=prompt, status=SampleStatus.query_failed, reasons=[str(e)]), []

    reasons: list[str] = []
    attempts = 0
    for _ in range(MAX_EXTRACTION_ATTEMPTS):
        attempts += 1
        reasons = []
        try:
            extraction = await _extract_once(llm, raw, brands)
        except LLMError as e:
            reasons = [f"EXTRACTION_CALL_FAILED: {e}"]
            continue
        except (ValidationError, ValueError) as e:
            reasons = [f"SCHEMA_VIOLATION: {type(e).__name__}"]
            continue
        verdict = validate_extraction(raw, extraction, brands)
        if verdict.valid:
            return (
                SampleRecord(prompt=prompt, status=SampleStatus.valid, raw_response=raw,
                             extraction=extraction.model_dump(mode="json"), attempts=attempts),
                verdict.mentions,
            )
        reasons = verdict.reasons
    return SampleRecord(prompt=prompt, status=SampleStatus.invalid, raw_response=raw,
                        reasons=reasons, attempts=attempts), []


async def execute_run(req: RunRequest, llm: LLM, repo: Repo, gate: GateConfig) -> RunRecord:
    brands = [req.brand, *[c for c in req.competitors if c.lower() != req.brand.lower()]]
    sem = asyncio.Semaphore(CONCURRENCY)
    results: list[tuple[SampleRecord, list[ValidMention]]] = []

    async def worker(p: str) -> None:
        async with sem:
            results.append(await _run_sample(llm, p, brands))

    run_id = uuid.uuid4().hex
    blocked: EgressBlocked | None = None
    try:
        async with asyncio.TaskGroup() as tg:
            for p in req.prompts:
                tg.create_task(worker(p))
    except* EgressBlocked as eg:
        blocked = eg.exceptions[0]

    if blocked is not None:
        # A blocked host is a security event, not a flaky sample: halt immediately.
        run = RunRecord(
            id=run_id, schema_version=SCHEMA_VERSION, brand=req.brand, competitors=brands[1:],
            status=RunStatus.halted, score=None, samples=[s for s, _ in results],
            halt_reasons=[HaltReason(code=HaltCode.egress_blocked, detail=str(blocked))],
        )
        await repo.save_run(run)
        return run

    order = {p: i for i, p in enumerate(req.prompts)}
    results.sort(key=lambda r: order[r[0].prompt])
    samples = [s for s, _ in results]
    valid = [m for s, m in results if s.status == SampleStatus.valid]

    halt = evaluate_gate(total=len(samples), valid=len(valid), cfg=gate)
    run = RunRecord(
        id=run_id, schema_version=SCHEMA_VERSION, brand=req.brand, competitors=brands[1:],
        status=RunStatus.halted if halt else RunStatus.scored,
        halt_reasons=halt,
        score=None if halt else compute_score(valid, brands),
        samples=samples,
    )
    await repo.save_run(run)
    return run