import json

from fastapi.testclient import TestClient

from app.gate import GateConfig
from app.main import create_app
from app.repo import InMemoryRepo
from tests.fakes import ScriptedLLM

RAW = "Minimalist is affordable. CeraVe is trusted."
GOOD = lambda raw, n: json.dumps({"mentions": [
    {"brand": "Minimalist", "sentiment": "positive", "quote": "Minimalist is affordable."},
    {"brand": "CeraVe", "sentiment": "neutral", "quote": "CeraVe is trusted."}]})


def client(extractor=GOOD, n=3):
    llm = ScriptedLLM({f"q{i}": RAW for i in range(n)}, extractor)
    app = create_app(repo=InMemoryRepo(), llm_factory=lambda: llm, gate=GateConfig(3, 0.2))
    return TestClient(app)


BODY = {"brand": "Minimalist", "competitors": ["CeraVe"], "prompts": ["q0", "q1", "q2"]}


def test_create_and_fetch_run():
    with client() as c:
        r = c.post("/runs", json=BODY)
        assert r.status_code == 201 and r.json()["status"] == "SCORED"
        assert r.json()["schema_version"] == "1.0.0"
        rid = r.json()["id"]
        assert c.get(f"/runs/{rid}").json()["score"]["valid_samples"] == 3
        assert len(c.get("/runs").json()) == 1


def test_halted_run_has_no_score_field_value():
    with client(lambda raw, n: "garbage") as c:
        r = c.post("/runs", json=BODY)
        assert r.status_code == 201
        j = r.json()
        assert j["status"] == "HALTED" and j["score"] is None and j["halt_reasons"]


def test_request_validation_rejects_bad_input():
    with client() as c:
        assert c.post("/runs", json={**BODY, "prompts": []}).status_code == 422
        assert c.post("/runs", json={**BODY, "extra": 1}).status_code == 422
        assert c.post("/runs", json={**BODY, "brand": "  "}).status_code == 422


def test_unknown_run_is_404():
    with client() as c:
        assert c.get("/runs/nope").status_code == 404


def test_stats_aggregates_outcomes_and_rejection_codes():
    with client() as c:
        c.post("/runs", json=BODY)
    with client(lambda raw, n: "garbage") as c:
        c.post("/runs", json=BODY)
        st = c.get("/stats").json()
        assert {(o["status"], o["samples"]) for o in st["outcomes"]} == {("INVALID", 3)}
        assert st["rejections"] == [{"code": "SCHEMA_VIOLATION", "count": 3}]
        assert c.get("/stats", params={"brand": "Nobody"}).json() == {"outcomes": [], "rejections": []}
