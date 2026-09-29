import json

from app.egress import EgressBlocked
from app.gate import GateConfig
from app.pipeline import EXTRACT_TOOL_SCHEMA, execute_run
from app.repo import InMemoryRepo
from app.schemas import ExtractionResult, HaltCode, RunRequest, RunStatus, SampleStatus
from tests.fakes import ScriptedLLM

GATE = GateConfig(min_valid_samples=3, max_failure_rate=0.34)
RAW = "Minimalist is affordable. CeraVe is trusted."


def good(raw, n):
    return json.dumps({"mentions": [
        {"brand": "Minimalist", "sentiment": "positive", "quote": "Minimalist is affordable."},
        {"brand": "CeraVe", "sentiment": "positive", "quote": "CeraVe is trusted."}]})


def req(n):
    return RunRequest(brand="Minimalist", competitors=["CeraVe"], prompts=[f"q{i}" for i in range(n)])


async def test_happy_path_scores():
    llm = ScriptedLLM({f"q{i}": RAW for i in range(4)}, good)
    repo = InMemoryRepo()
    run = await execute_run(req(4), llm, repo, GATE)
    assert run.status == RunStatus.scored and run.score.valid_samples == 4
    assert {b.brand: b.mean_position for b in run.score.brands} == {"Minimalist": 1.0, "CeraVe": 2.0}
    assert (await repo.get_run(run.id)) == run


async def test_unusable_output_is_retried_once_then_recovers():
    def flaky(raw, n):
        return "not json at all" if n == 1 else good(raw, n)
    # distinct raw text per prompt so the fake's per-response retry counter is per sample
    llm = ScriptedLLM({f"q{i}": f"{RAW} (variant {i})" for i in range(3)}, flaky)
    run = await execute_run(req(3), llm, InMemoryRepo(), GATE)
    assert run.status == RunStatus.scored
    assert all(s.attempts == 2 for s in run.samples)


async def test_hallucinated_quote_after_retry_marks_sample_invalid_and_run_halts():
    bad = lambda raw, n: json.dumps({"mentions": [
        {"brand": "Minimalist", "sentiment": "positive", "quote": "Minimalist is the best ever."}]})
    llm = ScriptedLLM({f"q{i}": RAW for i in range(4)}, bad)
    run = await execute_run(req(4), llm, InMemoryRepo(), GATE)
    assert run.status == RunStatus.halted and run.score is None
    assert {r.code for r in run.halt_reasons} == {HaltCode.too_few_valid_samples, HaltCode.failure_rate_too_high}
    assert all(s.status == SampleStatus.invalid and s.attempts == 2 for s in run.samples)
    assert any("QUOTE_NOT_IN_RESPONSE" in r for r in run.samples[0].reasons)


async def test_schema_violation_extra_field_is_rejected():
    extra = lambda raw, n: json.dumps({"mentions": [], "confidence": 0.99})
    llm = ScriptedLLM({"q0": "No brands here."}, extra)
    run = await execute_run(req(1), llm, InMemoryRepo(), GateConfig(1, 0.0))
    assert run.samples[0].status == SampleStatus.invalid
    assert run.samples[0].reasons == ["SCHEMA_VIOLATION: ValidationError"]


async def test_provider_failures_count_against_failure_rate():
    llm = ScriptedLLM({f"q{i}": RAW for i in range(4)}, good, fail_prompts={"q0", "q1"})
    run = await execute_run(req(4), llm, InMemoryRepo(), GATE)
    assert run.status == RunStatus.halted
    assert [s.status for s in run.samples[:2]] == [SampleStatus.query_failed] * 2


async def test_egress_block_halts_immediately_with_security_reason():
    llm = ScriptedLLM({f"q{i}": RAW for i in range(4)}, good,
                      raise_on={"q1": EgressBlocked("host 'evil.example.com' is not on the egress allowlist")})
    repo = InMemoryRepo()
    run = await execute_run(req(4), llm, repo, GATE)
    assert run.status == RunStatus.halted and run.score is None
    assert [r.code for r in run.halt_reasons] == [HaltCode.egress_blocked]
    assert await repo.get_run(run.id) is not None


async def test_sample_order_matches_prompt_order():
    llm = ScriptedLLM({f"q{i}": RAW for i in range(5)}, good)
    run = await execute_run(req(5), llm, InMemoryRepo(), GATE)
    assert [s.prompt for s in run.samples] == [f"q{i}" for i in range(5)]


def test_tool_schema_matches_pydantic_contract():
    item = EXTRACT_TOOL_SCHEMA["properties"]["mentions"]["items"]
    model_props = ExtractionResult.model_json_schema()["$defs"]["BrandMention"]["properties"]
    assert set(item["properties"]) == set(model_props) == set(item["required"])
    assert set(item["properties"]["sentiment"]["enum"]) == {"positive", "neutral", "negative"}
