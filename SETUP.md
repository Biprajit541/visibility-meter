# Setup in VS Code, step by step

This project is Python (FastAPI) + Next.js. It does **not** use .NET, so your `dotnet 10.0.301` is not needed here.

## 0. Install once
- Python 3.12 or newer (python.org; tick "Add to PATH") -> check: `python --version`
- Node.js 20+ (nodejs.org) -> check: `node --version`
- Git -> check: `git --version`
- VS Code extensions: Python, Pylance, ESLint, Docker (VS Code will offer them from `.vscode/extensions.json`)

## 1. Open the project
1. Unzip `visibility-meter.zip` (or clone the repo), then in VS Code: **File > Open Folder** and pick the `visibility-meter` folder.
2. Open the terminal: **Terminal > New Terminal**.

## 2. Create your own Python environment
Windows (PowerShell):
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```
If PowerShell blocks the script: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then retry.
Mac/Linux: `python3 -m venv .venv && source .venv/bin/activate`

Then install and select it:
```powershell
pip install -r requirements-dev.txt
```
Press **Ctrl+Shift+P > "Python: Select Interpreter"** and choose the one inside `.venv`.
The terminal prompt should now start with `(.venv)`.

## 3. Configure secrets
```powershell
copy .env.example .env
```
Edit `.env`:

| Variable | Meaning |
|---|---|
| `GROQ_API_KEY` | your key from console.groq.com |
| `GROQ_MODEL` | `openai/gpt-oss-120b` (other models may not be available to your key) |
| `DATABASE_URL` | leave empty for a local in-memory store (nothing is saved after a restart); set it to use PostgreSQL / Supabase |
| `MIN_VALID_SAMPLES` | fewest valid answers a run needs before it may publish a score (default `5`) |
| `MAX_FAILURE_RATE` | largest share of questions that may fail or be rejected (default `0.2`) |
| `CORS_ORIGINS` | comma-separated list of allowed frontend addresses, e.g. `http://localhost:3000` |

`.env` is git-ignored. Never commit it.

## 4. Run the tests
```powershell
pytest -q
```
Expected: `45 passed`. No network or database is needed.

## 5. Start the backend
```powershell
uvicorn app.main:app --reload --port 8000 --env-file .env
```
Open http://localhost:8000/docs to try the endpoints. Or press **F5** in VS Code ("API (uvicorn, reload)") to debug with breakpoints.

## 6. Start the frontend (second terminal: click the `+` in the terminal panel)
```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev
```
Open http://localhost:3000. `NEXT_PUBLIC_API_URL` in `.env.local` points at the API (default `http://localhost:8000`).

## 7. Use PostgreSQL locally (optional)
`docker compose up db` starts Postgres. Then set in `.env`:
`DATABASE_URL=postgresql://meter:meter@localhost:5432/meter`, and restart the API. `python -m app.migrate` reads
`DATABASE_URL` from the process environment, not from `.env`, so run it like this in PowerShell:
```powershell
$env:DATABASE_URL = "postgresql://meter:meter@localhost:5432/meter"
python -m app.migrate
```
To run the API and database together in containers: `docker compose up --build` (needs `GROQ_API_KEY` in your environment).

---

# Deploy: Supabase (database) + Render (API) + Vercel (frontend)

Do them in this order.

## A. Supabase
1. supabase.com > New project (save the database password; use letters and numbers only, because symbols break the connection string).
2. **Connect** button > **Session pooler** > copy the URI. It looks like
   `postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   Use the *session pooler* (port 5432), not "Direct connection": Render has no IPv6 and Supabase's direct host is IPv6-only.
3. Add `?sslmode=require` to the end of that URI. This is your `DATABASE_URL`.
4. **Do not create the tables by hand.** The API container runs `python -m app.migrate` on every start and records
   applied files in `schema_migrations`. If you paste `0001_init.sql` into the SQL editor yourself, the next start
   fails with `relation "runs" already exists`. (Fix: drop `samples`, `runs` and `schema_migrations`, redeploy.)
5. After the first successful deploy, turn on Row Level Security for every table, and add no policies. The backend
   connects as `postgres`, which bypasses RLS, and the frontend never talks to Supabase directly. In the SQL editor:
   ```sql
   alter table public.runs enable row level security;
   alter table public.samples enable row level security;
   alter table public.schema_migrations enable row level security;
   ```
   Check it: `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';`
   every row should say `true`.
6. Supabase's session pooler allows 15 clients in total, so the API keeps a small pool (1 to 4 connections). Two copies
   overlapping during a redeploy still fit.

## B. GitHub
```powershell
git init
git checkout -b main
git add -A
git status          # .env must NOT be listed
git commit -m "Initial commit"
git remote add origin https://github.com/Biprajit541/visibility-meter.git
git push -u origin main
```
Later changes: `git add -A`, `git commit -m "..."`, `git push`. Use `-A` so deleted files are recorded too. Vercel and
Render only see what is pushed. For larger changes, use a branch and a pull request: `git checkout -b feature/x`, push, open a PR, merge.

## C. Render (API, built from the Dockerfile)
1. render.com > **New > Blueprint** > pick your GitHub repo (it reads `render.yaml`).
2. Fill the three secret values when asked:
   - `DATABASE_URL` = the Supabase URL from step A
   - `GROQ_API_KEY` = your Groq key
   - `CORS_ORIGINS` = your Vercel URL (put a placeholder now, fix after step D)
   `GROQ_MODEL`, `MIN_VALID_SAMPLES` and `MAX_FAILURE_RATE` already have values in `render.yaml`.
3. Deploy. Check `https://<your-service>.onrender.com/health` returns `{"ok": true, ...}`.
   Free tier sleeps when idle; the first request can take about a minute.

## D. Vercel (frontend)
1. vercel.com > **Add New > Project** > import the same repo.
2. Set **Root Directory** to `frontend`.
3. Environment variable: `NEXT_PUBLIC_API_URL` = your Render URL (`https://`, no trailing slash).
4. Deploy, copy the Vercel URL, then go back to Render > Environment and set `CORS_ORIGINS` to it (`https://`, no
   trailing slash, exactly as shown in the browser). Render restarts.
5. Vercel reads environment variables at build time. After changing one, use **Redeploy**.

## Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Groq HTTP 404 | The model is not available to your key. Set `GROQ_MODEL=openai/gpt-oss-120b`. |
| Groq HTTP 429 | Free-tier rate limit. The client retries a few times; if it keeps failing, wait a minute. Do not submit a run twice. |
| `relation "runs" already exists` on Render | Tables were created by hand. See step A4. |
| `EMAXCONNSESSION` | Too many connections for the session pooler. Stop other servers that share the database and redeploy. |
| Page says "Cannot reach the API" | Render asleep, `NEXT_PUBLIC_API_URL` wrong or not redeployed, or `CORS_ORIGINS` does not exactly match the Vercel address. |
| Vercel type error about a missing export | A leftover component from an older frontend. Delete the file, `git add -A`, commit and push. |
