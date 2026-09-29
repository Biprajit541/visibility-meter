"""Minimal forward-only SQL migration runner.

Applies migrations/NNNN_*.sql in order, each in its own transaction, recording it in
schema_migrations. Usage: python -m app.migrate
"""
from __future__ import annotations

import asyncio
import os
import pathlib

import asyncpg

MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent.parent / "migrations"


async def migrate(dsn: str) -> list[str]:
    con = await asyncpg.connect(dsn, statement_cache_size=0)
    applied_now: list[str] = []
    try:
        await con.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        done = {r["name"] for r in await con.fetch("SELECT name FROM schema_migrations")}
        for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if f.name in done:
                continue
            async with con.transaction():
                await con.execute(f.read_text())
                await con.execute("INSERT INTO schema_migrations (name) VALUES ($1)", f.name)
            applied_now.append(f.name)
    finally:
        await con.close()
    return applied_now


if __name__ == "__main__":
    print("applied:", asyncio.run(migrate(os.environ["DATABASE_URL"])) or "nothing to do")
