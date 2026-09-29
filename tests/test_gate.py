from app.gate import GateConfig, compute_score, evaluate_gate
from app.schemas import HaltCode, Sentiment
from app.validator import ValidMention

CFG = GateConfig(min_valid_samples=5, max_failure_rate=0.2)


def test_gate_passes_when_enough_valid():
    assert evaluate_gate(total=10, valid=9, cfg=CFG) == []


def test_gate_halts_on_too_few_samples():
    codes = {r.code for r in evaluate_gate(total=4, valid=4, cfg=CFG)}
    assert codes == {HaltCode.too_few_valid_samples}


def test_gate_halts_on_failure_rate():
    codes = {r.code for r in evaluate_gate(total=10, valid=7, cfg=CFG)}
    assert codes == {HaltCode.failure_rate_too_high}


def test_gate_halts_when_nothing_ran():
    assert evaluate_gate(total=0, valid=0, cfg=CFG)


def test_gate_boundary_exactly_at_limit_passes():
    assert evaluate_gate(total=10, valid=8, cfg=CFG) == []


def test_score_arithmetic():
    m = lambda b, p, s=Sentiment.positive: ValidMention(brand=b, position=p, sentiment=s, quote="q")
    samples = [[m("A", 1), m("B", 2)], [m("B", 1)], [], [m("A", 2, Sentiment.negative)]]
    s = compute_score(samples, ["A", "B", "C"])
    by = {b.brand: b for b in s.brands}
    assert s.valid_samples == 4
    assert by["A"].mention_rate == 0.5 and by["A"].mean_position == 1.5
    assert by["A"].sentiment == {"positive": 1, "neutral": 0, "negative": 1}
    assert by["B"].mention_rate == 0.5 and by["B"].mean_position == 1.5
    assert by["C"].mention_rate == 0.0 and by["C"].mean_position is None
