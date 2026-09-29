# Trace notes (fill in from REAL runs)

Do not invent cases. Run the system against the real API, look at HALTED runs and INVALID samples
(`GET /runs/{id}`, see `samples[].reasons` and `raw_response`), and record what you actually saw.

## Case template
- **Run id / prompt:**
- **What the model returned (plausible but wrong):**
- **Which check caught it** (`QUOTE_NOT_IN_RESPONSE`, `MISSED_MENTION`, `SCHEMA_VIOLATION`, ...):
- **How you found it** (what evidence you looked at, in what order):
- **What changed afterwards** (test added, prompt changed, rule tightened):
