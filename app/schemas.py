"""Contracts. Changing any model here is a versioning event: bump SCHEMA_VERSION
and add a migration if stored shapes change. The version is stored on every run."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "1.0.0"


class Sentiment(str, Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- What the LLM (the witness) must return -------------------------------
class BrandMention(_Strict):
    brand: str = Field(min_length=1, max_length=100)
    sentiment: Sentiment
    quote: str = Field(min_length=3, max_length=500)


class ExtractionResult(_Strict):
    mentions: list[BrandMention]


# --- API request ------------------------------------------------------------
class RunRequest(_Strict):
    brand: str = Field(min_length=1, max_length=100)
    competitors: list[str] = Field(default_factory=list, max_length=10)
    prompts: list[str] = Field(min_length=1, max_length=20)

    @field_validator("brand")
    @classmethod
    def _strip_brand(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("brand must not be blank")
        return v

    @field_validator("competitors", "prompts")
    @classmethod
    def _strip_items(cls, v: list[str]) -> list[str]:
        out = [s.strip() for s in v if s.strip()]
        if len(out) != len(v):
            raise ValueError("entries must not be blank")
        return out


# --- Computed by code, never by the model -----------------------------------
class RunStatus(str, Enum):
    scored = "SCORED"
    halted = "HALTED"


class HaltCode(str, Enum):
    too_few_valid_samples = "TOO_FEW_VALID_SAMPLES"
    failure_rate_too_high = "FAILURE_RATE_TOO_HIGH"
    egress_blocked = "EGRESS_BLOCKED"


class HaltReason(_Strict):
    code: HaltCode
    detail: str


class BrandScore(_Strict):
    brand: str
    mention_rate: float  # valid responses mentioning brand / valid responses
    mean_position: Optional[float]  # 1 = first tracked brand named; None if never mentioned
    sentiment: dict[str, int]


class Score(_Strict):
    valid_samples: int
    brands: list[BrandScore]


class SampleStatus(str, Enum):
    valid = "VALID"
    invalid = "INVALID"  # extraction unusable after retry
    query_failed = "QUERY_FAILED"


class SampleRecord(_Strict):
    prompt: str
    status: SampleStatus
    raw_response: Optional[str] = None
    extraction: Optional[dict] = None
    reasons: list[str] = Field(default_factory=list)
    attempts: int = 0


class RunRecord(_Strict):
    id: str
    schema_version: str
    brand: str
    competitors: list[str]
    status: RunStatus
    halt_reasons: list[HaltReason]
    score: Optional[Score]
    samples: list[SampleRecord]


# --- Aggregates across runs (computed in SQL) -------------------------------
class OutcomeRow(_Strict):
    brand: str
    status: SampleStatus
    samples: int
    avg_attempts: float


class RejectionRow(_Strict):
    code: str  # e.g. QUOTE_NOT_IN_RESPONSE
    count: int


class StatsResponse(_Strict):
    outcomes: list[OutcomeRow]
    rejections: list[RejectionRow]
