# Fail-Closed AI Visibility Meter

Measures how often a brand shows up when an LLM answers buyer-style questions, and **refuses to emit a
score it cannot defend**. Doctrine: **LLM as witness, code as judge.**

- Backend: Python, FastAPI (async), PostgreSQL (Supabase), deployed on Render (Docker)
- Frontend: React / Next.js (TypeScript), deployed on Vercel
- LLM: Groq API (OpenAI-compatible), including a forced tool call for structured extraction
- Built AI-assisted with Claude

```
prompts -> [Answer agent: LLM] -> raw answer
                                      |
                 [Extraction agent: LLM calls tool submit_mentions]
                   -> {brand, sentiment, verbatim quote}   (strict Pydantic schema, one retry)
                                      v
                 [Validator: pure code, NO LLM]
                   - quote is verbatim text in the raw answer, and names the brand
                   - no unknown / duplicate brands
                   - recall check: tracked brand in text but omitted by the witness => reject
                   - position computed from text offsets, never taken from the model
                                      v
                 [Gate: pure code]  enough valid samples? failure rate under limit?
                      |                        |
                   SCORED                   HALTED (score = null, with reasons)
```

## How each point of the Kasparro job description is covered
| JD point | Where |
|---|---|
| Multi-agent pipeline: plan / extract / draft / critique wrapped in deterministic code | `app/pipeline.py` (answer + extraction agents, code validates and gates) |
| Deterministic code computes every number and gates every stage | `app/validator.py`, `app/gate.py` |
| LLM as witness, code as judge | validator never calls a model; positions and scores are code-computed |
| Schemas are contracts; changing one is a versioning event | `app/schemas.py` (`extra="forbid"`, `SCHEMA_VERSION` stored on every run); `frontend/lib/types.ts` mirrors it |
| Pipelines fail closed / halt rather than emit an indefensible number | gate returns `HALTED` with `score: null`; DB CHECK constraint `score_matches_status` |
| Tool functions agents call | extraction agent must call `submit_mentions` (`app/llm.py: call_tool`) |
| Structured output validation, and handling a model returning something unusable | Pydantic validation, one retry, then sample `INVALID` with reasons |
| Domain allowlist that cannot be bypassed via the underlying client | `app/egress.py` on the httpx transport + source-tree scan test |
| FastAPI: endpoints, request/response models, error handling, async | `app/main.py` |
| PostgreSQL: tables, queries, migrations; joins, filters, aggregations | `migrations/0001_init.sql`, `app/migrate.py`, `PgRepo.stats` in `app/repo.py` |
| React / Next.js dashboard with loading and error states | `frontend/` |
| Git and deployment, at least one live app | see SETUP.md (GitHub, Vercel, Render, Supabase) |
| Used LLM APIs (tool call, multi-step task) | Groq answer + tool-call extraction |
| Docker (bonus) | `Dockerfile`, `docker-compose.yml` |
| Testing habit (bonus) | `tests/` (40 tests) |
| Teardown of why a model got something wrong (bonus) | `TRACE.md` |
| "If impossible, say so in writing" | `LIMITS.md` |

## Run locally
See [SETUP.md](SETUP.md) for the step-by-step VS Code guide, including environment creation and deployment.

## API
| Method | Path | |
|---|---|---|
| POST | `/runs` | Run prompts, returns the run (`SCORED` or `HALTED`) |
| GET | `/runs`, `/runs/{id}` | History and detail incl. every sample and rejection reason |
| GET | `/stats?brand=&since=` | SQL aggregates: sample outcomes per brand and rejection-code counts |
| GET | `/health` | |

## Tests
`pytest -q` runs 40 tests with no network or database: validator rules, gate boundaries, scoring arithmetic,
the allowlist (lookalike hosts, redirects, source-tree bypass scan), tool-call handling, the retry/halt pipeline
and the API contract.

Live demo: _add your Vercel URL_ · API: _add your Render URL_
