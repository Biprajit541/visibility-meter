"""Scoring and the fail-closed gate. Arithmetic only; no model involved."""
from __future__ import annotations

from dataclasses import dataclass

from .schemas import BrandScore, HaltCode, HaltReason, Score
from .validator import ValidMention


@dataclass(frozen=True)
class GateConfig:
    min_valid_samples: int = 5
    max_failure_rate: float = 0.2


def compute_score(per_sample: list[list[ValidMention]], tracked_brands: list[str]) -> Score:
    n = len(per_sample)
    brands: list[BrandScore] = []
    for b in tracked_brands:
        hits = [m for sample in per_sample for m in sample if m.brand == b]
        sentiment = {"positive": 0, "neutral": 0, "negative": 0}
        for m in hits:
            sentiment[m.sentiment.value] += 1
        brands.append(
            BrandScore(
                brand=b,
                mention_rate=round(len(hits) / n, 4) if n else 0.0,
                mean_position=round(sum(m.position for m in hits) / len(hits), 4) if hits else None,
                sentiment=sentiment,
            )
        )
    return Score(valid_samples=n, brands=brands)


def evaluate_gate(total: int, valid: int, cfg: GateConfig) -> list[HaltReason]:
    """Return halt reasons. Empty list means the run may emit a score."""
    reasons: list[HaltReason] = []
    if valid < cfg.min_valid_samples:
        reasons.append(
            HaltReason(
                code=HaltCode.too_few_valid_samples,
                detail=f"{valid} valid samples; need at least {cfg.min_valid_samples}",
            )
        )
    failed = total - valid
    rate = failed / total if total else 1.0
    if rate > cfg.max_failure_rate:
        reasons.append(
            HaltReason(
                code=HaltCode.failure_rate_too_high,
                detail=f"failure rate {rate:.0%} exceeds limit {cfg.max_failure_rate:.0%}",
            )
        )
    return reasons
