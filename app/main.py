from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Callable

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .egress import make_client
from .gate import GateConfig
from .llm import GroqClient
from .pipeline import LLM, Repo, execute_run
from .repo import InMemoryRepo, PgRepo
from .schemas import SCHEMA_VERSION, RunRecord, RunRequest, StatsResponse


def _gate_from_env() -> GateConfig:
    return GateConfig(
        min_valid_samples=int(os.getenv("MIN_VALID_SAMPLES", "5")),
        max_failure_rate=float(os.getenv("MAX_FAILURE_RATE", "0.2")),
    )


def create_app(repo: Repo | None = None, llm_factory: Callable[[], LLM] | None = None,
               gate: GateConfig | None = None) -> FastAPI:
    """Dependencies are injectable so tests never touch the network or a database."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        http = None
        pool = None
        if repo is None:
            dsn = os.getenv("DATABASE_URL")
            if dsn:
                import asyncpg
                pool = await asyncpg.create_pool(dsn, statement_cache_size=0, min_size=1, max_size=4)  # Supabase pooler-safe
                app.state.repo = PgRepo(pool)
            else:
                app.state.repo = InMemoryRepo()  # dev only
        else:
            app.state.repo = repo
        if llm_factory is None:
            http = make_client()
            key = os.getenv("GROQ_API_KEY", "")
            model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            app.state.llm = GroqClient(http, key, model)
        else:
            app.state.llm = llm_factory()
        app.state.gate = gate or _gate_from_env()
        yield
        if http:
            await http.aclose()
        if pool:
            await pool.close()

    app = FastAPI(title="Fail-Closed AI Visibility Meter", version=SCHEMA_VERSION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
        allow_methods=["GET", "POST"], allow_headers=["*"],
    )

    def get_repo(request: Request) -> Repo:
        return request.app.state.repo

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True, "schema_version": SCHEMA_VERSION}

    @app.post("/runs", response_model=RunRecord, status_code=201)
    async def create_run(req: RunRequest, request: Request, repo: Repo = Depends(get_repo)) -> RunRecord:
        # A HALTED run is a successful response: the system did its job by refusing to score.
        return await execute_run(req, request.app.state.llm, repo, request.app.state.gate)

    @app.get("/runs", response_model=list[RunRecord])
    async def list_runs(limit: int = 50, repo: Repo = Depends(get_repo)) -> list[RunRecord]:
        return await repo.list_runs(max(1, min(limit, 200)))

    @app.get("/runs/{run_id}", response_model=RunRecord)
    async def get_run(run_id: str, repo: Repo = Depends(get_repo)) -> RunRecord:
        run = await repo.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="run not found")
        return run

    @app.get("/stats", response_model=StatsResponse)
    async def stats(brand: str | None = None, since: datetime | None = None,
                    repo=Depends(get_repo)) -> StatsResponse:
        return await repo.stats(brand, since)

    return app


app = create_app()
