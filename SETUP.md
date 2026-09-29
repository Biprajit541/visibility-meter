# Setup in VS Code, step by step

This project is Python (FastAPI) + Next.js. It does **not** use .NET, so your `dotnet 10.0.301` is not needed here.

## 0. Install once
- Python 3.12 (python.org; tick "Add to PATH") -> check: `python --version`
- Node.js 20+ (nodejs.org) -> check: `node --version`
- Git -> check: `git --version`
- VS Code extensions: Python, Pylance, ESLint, Docker (VS Code will offer them from `.vscode/extensions.json`)

## 1. Open the project
1. Unzip `visibility-meter.zip`, then in VS Code: **File > Open Folder** and pick the `visibility-meter` folder.
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
Edit `.env`: put your Groq key in `GROQ_API_KEY` (free key at console.groq.com). Leave `DATABASE_URL` empty for now (in-memory store).

## 4. Run the tests
```powershell
pytest -q
```
Expected: `40 passed`. No network or database is needed.

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
Open http://localhost:3000.

## 7. Use PostgreSQL locally (optional)
`docker compose up db` starts Postgres. Then set in `.env`:
`DATABASE_URL=postgresql://meter:meter@localhost:5432/meter`, run `python -m app.migrate`, and restart the API.

---

# Deploy: Supabase (database) + Render (API) + Vercel (frontend)

Do them in this order.

## A. Supabase
1. supabase.com > New project (save the database password).
2. **Connect** button > **Session pooler** > copy the URI. It looks like
   `postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   Use the *session pooler* (port 5432), not "Direct connection": Render has no IPv6 and Supabase's direct host is IPv6-only.
3. Add `?sslmode=require` to the end of that URI. This is your `DATABASE_URL`.
4. Tables are created automatically: the API container runs `python -m app.migrate` on every start.
   (Or run it yourself: put the URL in `.env` and run `python -m app.migrate`.)

## B. GitHub
```powershell
git init
git checkout -b main
git add . && git commit -m "Initial commit"
```
Create an empty repo on GitHub, then `git remote add origin <url>` and `git push -u origin main`.
For each later change use a branch and a pull request: `git checkout -b feature/x`, push, open a PR, merge.

## C. Render (API)
1. render.com > **New > Blueprint** > pick your GitHub repo (it reads `render.yaml`).
2. Fill the three secret values when asked:
   - `DATABASE_URL` = the Supabase URL from step A
   - `GROQ_API_KEY` = your Groq key
   - `CORS_ORIGINS` = your Vercel URL (put a placeholder now, fix after step D)
3. Deploy. Check `https://<your-service>.onrender.com/health` returns `{"ok": true, ...}`.
   Free tier sleeps when idle; the first request can take about a minute.

## D. Vercel (frontend)
1. vercel.com > **Add New > Project** > import the same repo.
2. Set **Root Directory** to `frontend`.
3. Environment variable: `NEXT_PUBLIC_API_URL` = your Render URL (no trailing slash).
4. Deploy, copy the Vercel URL, then go back to Render > Environment and set `CORS_ORIGINS` to it. Redeploy the API.

## E. Before you email Kasparro
- Open the live Vercel URL and do a real run with at least 6 prompts.
- Look at `HALTED` runs and rejected samples, then write 2-3 real cases in `TRACE.md`.
- Put both live links in the README.
