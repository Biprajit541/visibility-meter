<img width="1901" height="757" alt="Screenshot 2026-09-30 000127" src="https://github.com/user-attachments/assets/9316171f-03af-4437-b7ef-8eb189ad8c93" />

# Fail-Closed AI Visibility Meter

Measures how often a brand shows up when an LLM answers buyer-style questions, and **refuses to emit a
score it cannot defend**. Doctrine: **LLM as witness, code as judge.**

- Backend: Python, FastAPI (async), PostgreSQL (Supabase), deployed on Render (Docker)
- Frontend: React / Next.js (TypeScript), deployed on Vercel
- LLM: Groq API (OpenAI-compatible, model `openai/gpt-oss-120b`), including a forced tool call for structured extraction
- Built AI-assisted with Claude

API: https://visibility-meter-api.onrender.com       
Live demo: https://visibility-meter.vercel.app

Open the API link first and wait about a minute. The API runs on Render's free plan, which puts it to sleep when idle. Open the health check and wait until it shows {"ok":true,...}, then open the live app. If the app says it cannot reach the API, wait a little and click Retry. A measurement of 8 to 10 questions then takes one to two minutes.

## Screenshots
Live run on the deployed app: ASUS against HP, Dell and Lenovo, 10 buyer questions (9 valid, 1 rejected by the validator).

**Visibility Score and Share of Voice**

<img width="1901" height="867" alt="Screenshot 2026-09-29 233754" src="https://github.com/user-attachments/assets/7b3c14dd-bd6c-41be-a154-904f4a279254" />

**Recommendation Position and Sentiment Quality, and change between runs**

<img width="1897" height="873" alt="Screenshot 2026-09-29 233812" src="https://github.com/user-attachments/assets/f945c4ca-41b4-46e2-878d-b52a65eeeacf" />

**Evidence by question** (each label is a mention whose quote was found word for word in the raw answer; the rejected question is marked "Not counted")

<img width="1901" height="857" alt="Screenshot 2026-09-29 233843" src="https://github.com/user-attachments/assets/adeeda1d-8795-411a-b979-f3f29bc6969b" />

## What it measures
| Metric (dashboard) | Definition, all computed by code |
|---|---|
| Visibility Score | valid answers that name the brand / all valid answers |
| Share of Voice | the brand's mentions / all mentions of tracked brands, across valid answers |
| Recommendation Position | mean rank of the brand among tracked brands, when it is named (1 = named first) |
| Sentiment Quality | positive / neutral / negative counts of the brand's mentions, and a net score `(positive - negative) / mentions` from -100 to +100 |

The API stores `mention_rate`, `mean_position` and `sentiment` counts per brand. Share of Voice and the net
score are derived from those counts in the frontend (`frontend/components/Charts.tsx`).

## Pipeline
```
prompts -> [Answer agent: LLM] -> raw answer (under ~120 words)
                                      |
                 [Extraction agent: LLM must call tool submit_mentions]
                   -> {brand, sentiment, verbatim quote}   (strict Pydantic schema, one retry)
                                      v
                 [Validator: pure code, NO LLM]
                   - brand is one of the tracked brands
                   - quote is verbatim text in the raw answer, and names the brand
                   - a brand reported more than once: only the first entry is judged, the rest are dropped
                   - recall check: tracked brand in text but omitted by the witness => reject
                   - position computed from text offsets, never taken from the model
                                      v
                 [Gate: pure code]  enough valid samples? failure rate under limit?
                      |                        |
                   SCORED                   HALTED (score = null, with reasons)
```
Questions are processed one at a time (free-tier rate limits). A rejected sample gets one retry, then it is
`INVALID`. Defaults: at least 5 valid samples and a failure rate of at most 20%; both can be changed with the
`MIN_VALID_SAMPLES` and `MAX_FAILURE_RATE` environment variables.

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
| Domain allowlist that cannot be bypassed via the underlying client | `app/egress.py` on the httpx transport (only `api.groq.com`) + source-tree scan test |
| FastAPI: endpoints, request/response models, error handling, async | `app/main.py` |
| PostgreSQL: tables, queries, migrations; joins, filters, aggregations | `migrations/0001_init.sql`, `app/migrate.py`, `PgRepo.stats` in `app/repo.py` |
| React / Next.js dashboard with loading and error states | `frontend/` |
| Git and deployment, at least one live app | see SETUP.md (GitHub, Supabase, Render, Vercel) |
| Used LLM APIs (tool call, multi-step task) | Groq answer + tool-call extraction, bounded retry on HTTP 429 |
| Docker (bonus) | `Dockerfile`, `docker-compose.yml` |
| Testing habit (bonus) | `tests/` (45 tests) |
| Teardown of why a model got something wrong (bonus) | `TRACE.md` |
| "If impossible, say so in writing" | `LIMITS.md` |

## Dashboard
Four charts under the names Visibility Score, Share of Voice, Recommendation Position and Sentiment Quality,
a "Change between runs" chart, the outcome of every sample, an Evidence by question table (hover a label to
read the verified quote), a written report where each rejected answer shows what happened, where in the
answer, and a suggested fix, and a SQL-counted "Why samples get rejected" chart. Halted runs list each halt
reason with its meaning and a fix. Loading and error states are handled throughout.

## Run locally
See [SETUP.md](SETUP.md) for the step-by-step VS Code guide, including environment creation and deployment.

## API
| Method | Path | |
|---|---|---|
| POST | `/runs` | Run prompts, returns the run (`SCORED` or `HALTED`). Body: `brand` (max 100 chars), `competitors` (up to 10), `prompts` (1 to 20). Extra fields and blank entries are rejected. |
| GET | `/runs`, `/runs/{id}` | History (`?limit=`, 1 to 200, default 50) and detail incl. every sample and rejection reason |
| GET | `/stats?brand=&since=` | SQL aggregates: sample outcomes per brand and rejection-code counts |
| GET | `/health` | Liveness: `{"ok": true, "schema_version": "1.0.0"}` |

Interactive docs are at `/docs`.

## Tests
`pytest -q` runs 45 tests with no network or database: validator rules (including markdown and dash
normalisation, and repeated brands), gate boundaries, scoring arithmetic, the allowlist (lookalike hosts,
redirects, source-tree bypass scan), tool-call handling, HTTP 429 retry, the retry/halt pipeline and the API
contract.

## Security notes
Row Level Security is enabled on all three tables with no policies. Only the backend connects to the database.
There is no user authentication yet (see LIMITS.md).
