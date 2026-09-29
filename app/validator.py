"""The judge. Pure functions, no I/O, no LLM. Same input -> same verdict.

The model's extraction is treated as testimony. Every claim is checked against
the raw response text before it is allowed to count.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from .schemas import ExtractionResult, Sentiment


@dataclass(frozen=True)
class ValidMention:
    brand: str  # canonical (as tracked)
    position: int  # rank by first appearance among tracked brands, 1-based
    sentiment: Sentiment
    quote: str


@dataclass
class Verdict:
    valid: bool
    mentions: list[ValidMention] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


_DASHES = dict.fromkeys(map(ord, "\u2010\u2011\u2012\u2013\u2014\u2212"), "-")
_QUOTES = {0x2018: "'", 0x2019: "'", 0x201C: '"', 0x201D: '"'}


def _norm_text(s: str) -> str:
    """Comparison-only normalisation for the verbatim-quote check: unicode form, dash/quote
    variants, markdown emphasis markers and whitespace. Word choice and case are NOT relaxed,
    so a paraphrase still fails."""
    s = unicodedata.normalize("NFKC", s).translate(_DASHES).translate(_QUOTES)
    s = s.replace("*", "").replace("`", "")
    return re.sub(r"\s+", " ", s).strip()


def _brand_pattern(brand: str) -> re.Pattern[str]:
    # word-boundary-ish match that also works for names ending in punctuation
    return re.compile(r"(?<!\w)" + re.escape(brand) + r"(?!\w)", re.IGNORECASE)


def find_brand_offset(text: str, brand: str) -> int | None:
    m = _brand_pattern(brand).search(text)
    return m.start() if m else None


def validate_extraction(
    raw_response: str, extraction: ExtractionResult, tracked_brands: list[str]
) -> Verdict:
    """Fail closed: any single failed check invalidates the whole sample."""
    reasons: list[str] = []
    canon = {b.lower(): b for b in tracked_brands}
    norm_raw = _norm_text(raw_response)

    claimed: dict[str, tuple[Sentiment, str]] = {}
    seen: set[str] = set()
    for m in extraction.mentions:
        key = m.brand.strip().lower()
        if key not in canon:
            reasons.append(f"UNKNOWN_BRAND: '{m.brand}' is not a tracked brand")
            continue
        brand = canon[key]
        if brand in seen:
            continue
        seen.add(brand)
        if _norm_text(m.quote) not in norm_raw:
            reasons.append(f"QUOTE_NOT_IN_RESPONSE: quote for '{brand}' is not verbatim text")
            continue
        if not _brand_pattern(brand).search(m.quote):
            reasons.append(f"QUOTE_MISSING_BRAND: quote for '{brand}' does not name it")
            continue
        claimed[brand] = (m.sentiment, m.quote)

    # Deterministic recall check: the response names a tracked brand the witness omitted.
    present = {b: find_brand_offset(raw_response, b) for b in tracked_brands}
    for b, off in present.items():
        if off is not None and b not in claimed and not any(
            r.startswith(("UNKNOWN_BRAND", "QUOTE_")) and f"'{b}'" in r
            for r in reasons
        ):
            reasons.append(f"MISSED_MENTION: '{b}' appears in the response but was not extracted")

    if reasons:
        return Verdict(valid=False, reasons=reasons)

    # Position is computed by code from text offsets, never trusted from the model.
    ordered = sorted(claimed, key=lambda b: present[b])  # all present, checked above
    mentions = [
        ValidMention(brand=b, position=i + 1, sentiment=claimed[b][0], quote=claimed[b][1])
        for i, b in enumerate(ordered)
    ]
    return Verdict(valid=True, mentions=mentions)
