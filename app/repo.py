"""Persistence. InMemoryRepo for tests/dev, PgRepo for PostgreSQL."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime

from .schemas import OutcomeRow, RejectionRow, RunRecord, StatsResponse


class InMemoryRepo:
    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}

    async def save_run(self, run: RunRecord) -> None:
        self._runs[run.id] = run

    async def get_run(self, run_id: str) -> RunRecord | None:
        return self._runs.get(run_id)

    async def list_runs(self, limit: int = 50) -> list[RunRecord]:
        return list(self._runs.values())[-limit:][::-1]


    async def stats(self, brand: str | None = None, since: datetime | None = None) -> StatsResponse:
        # In-memory runs carry no timestamp, so `since` is honoured by PgRepo only.
        agg: dict[tuple[str, str], list[int]] = defaultdict(list)
        codes: Counter[str] = Counter()
        for run in self._runs.values():
            if brand and run.brand != brand:
                continue
            for smp in run.samples:
                agg[(run.brand, smp.status.value)].append(smp.attempts)
                codes.update(r.split(":", 1)[0] for r in smp.reasons)
        return StatsResponse(
            outcomes=[OutcomeRow(brand=b, status=st, samples=len(a), avg_attempts=round(sum(a) / len(a), 2))
                      for (b, st), a in sorted(agg.items())],
            rejections=[RejectionRow(code=c, count=n) for c, n in codes.most_common()],
        )


class PgRepo:
    def __init__(self, pool) -> None:  # asyncpg.Pool
        self._pool = pool

    async def save_run(self, run: RunRecord) -> None:
        async with self._pool.acquire() as con, con.transaction():
            await con.execute(
                """INSERT INTO runs (id, schema_version, brand, competitors, status, halt_reasons, score)
                   VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)""",
                run.id, run.schema_version, run.brand, run.competitors, run.status.value,
                json.dumps([h.model_dump(mode="json") for h in run.halt_reasons]),
                json.dumps(run.score.model_dump(mode="json")) if run.score else None,
            )
            for i, s in enumerate(run.samples):
                await con.execute(
                    """INSERT INTO samples (run_id, idx, prompt, status, raw_response, extraction, reasons, attempts)
                       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)""",
                    run.id, i, s.prompt, s.status.value, s.raw_response,
                    json.dumps(s.extraction) if s.extraction is not None else None,
                    json.dumps(s.reasons), s.attempts,
                )

    async def _hydrate(self, con, row) -> RunRecord:
        srows = await con.fetch("SELECT * FROM samples WHERE run_id=$1 ORDER BY idx", row["id"])
        return RunRecord(
            id=row["id"], schema_version=row["schema_version"], brand=row["brand"],
            competitors=list(row["competitors"]), status=row["status"],
            halt_reasons=json.loads(row["halt_reasons"]),
            score=json.loads(row["score"]) if row["score"] else None,
            samples=[
                dict(prompt=s["prompt"], status=s["status"], raw_response=s["raw_response"],
                     extraction=json.loads(s["extraction"]) if s["extraction"] else None,
                     reasons=json.loads(s["reasons"]), attempts=s["attempts"])
                for s in srows
            ],
        )

    async def get_run(self, run_id: str) -> RunRecord | None:
        async with self._pool.acquire() as con:
            row = await con.fetchrow("SELECT * FROM runs WHERE id=$1", run_id)
            return await self._hydrate(con, row) if row else None

    async def list_runs(self, limit: int = 50) -> list[RunRecord]:
        async with self._pool.acquire() as con:
            rows = await con.fetch("SELECT * FROM runs ORDER BY created_at DESC LIMIT $1", limit)
            return [await self._hydrate(con, r) for r in rows]

    async def stats(self, brand: str | None = None, since: datetime | None = None) -> StatsResponse:
        async with self._pool.acquire() as con:
            outcomes = await con.fetch(
                """SELECT r.brand, s.status, COUNT(*)::int AS samples,
                          ROUND(AVG(s.attempts), 2)::float8 AS avg_attempts
                   FROM samples s
                   JOIN runs r ON r.id = s.run_id
                   WHERE ($1::text IS NULL OR r.brand = $1)
                     AND ($2::timestamptz IS NULL OR r.created_at >= $2)
                   GROUP BY r.brand, s.status
                   ORDER BY r.brand, s.status""", brand, since)
            rejections = await con.fetch(
                """SELECT split_part(reason, ':', 1) AS code, COUNT(*)::int AS count
                   FROM samples s
                   JOIN runs r ON r.id = s.run_id
                   CROSS JOIN LATERAL jsonb_array_elements_text(s.reasons) AS reason
                   WHERE ($1::text IS NULL OR r.brand = $1)
                     AND ($2::timestamptz IS NULL OR r.created_at >= $2)
                   GROUP BY code
                   ORDER BY count DESC, code""", brand, since)
        return StatsResponse(outcomes=[dict(r) for r in outcomes], rejections=[dict(r) for r in rejections])
