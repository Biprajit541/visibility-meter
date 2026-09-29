# Trace notes (from REAL runs)

Each case below happened while building and testing against the live API. Run ids are the first 8 characters shown
in the dashboard; runs 49dfe8fc and 522556d9 come from local development. Add cases from the deployed site as you
find them.

## Case template
- **Run id / prompt:**
- **What the model returned (plausible but wrong):**
- **Which check caught it** (`QUOTE_NOT_IN_RESPONSE`, `MISSED_MENTION`, `SCHEMA_VIOLATION`, ...):
- **How you found it** (what evidence you looked at, in what order):
- **What changed afterwards** (test added, prompt changed, rule tightened):

---

## Case 1: markdown bold made a correct quote look fabricated
- **Run id / prompt:** run 49dfe8fc, "Which brands make gentle cleansers?" (Minimalist vs CeraVe, Cetaphil). 5 of 6 valid.
- **What the model returned:** mentions of CeraVe and Cetaphil with quotes copied from an answer that contained `**bold**` markers and special dashes.
- **Which check caught it:** `QUOTE_NOT_IN_RESPONSE` (x2), on both attempts, so the sample was `INVALID`.
- **How I found it:** the run showed 5/6 and the rejection-reason chart counted `QUOTE_NOT_IN_RESPONSE: 2`. Opening the sample, the quotes matched the raw answer once `*` and the dash characters were ignored, so the judge was too literal, not the model wrong.
- **What changed afterwards:** `_norm_text` in `app/validator.py` now ignores markdown emphasis, dash and quote variants and Unicode form when comparing. Word choice and case are still strict. Tests: `test_markdown_bold_and_dash_variants_do_not_cause_false_rejection` and `test_normalisation_does_not_accept_paraphrase_or_case_change`.

## Case 2: a brand named twice rejected a valid answer
- **Run id / prompt:** laptop run (ASUS vs HP, Dell, Lenovo), "Which laptop brand has the best service centres in India?"
- **What the model returned:** Dell reported twice, once for the Dell bullet and once for the closing sentence ("Dell and Apple are generally regarded as the most reliable...").
- **Which check caught it:** `DUPLICATE_BRAND`, on both attempts, so the sample was `INVALID` although Dell really is named twice.
- **How I found it:** the report showed the two highlighted Dell mentions in the answer next to the rejection. The rule was rejecting a legitimate answer.
- **What changed afterwards:** only the first entry per brand is judged; later entries are dropped and never reach the score. The first entry still has to pass the verbatim-quote and brand checks, and position still comes from the first appearance in the text. The old test that expected rejection became `test_repeated_brand_keeps_first_mention_and_stays_valid`.

## Case 3: every call failed, so the gate halted
- **Run id / prompt:** run 522556d9, all 6 prompts.
- **What the model returned:** nothing. Every call returned `provider returned HTTP 404`: the default model was not available to the API key.
- **Which check caught it:** all six samples `QUERY_FAILED`; the gate halted with `TOO_FEW_VALID_SAMPLES` (0 valid, need 5) and `FAILURE_RATE_TOO_HIGH` (100%, limit 20%). No score was stored.
- **How I found it:** the halted run and the SQL rejection chart both showed the same provider message. Listing the models the key could see (`/models`) confirmed the model name was the problem.
- **What changed afterwards:** the model is set with `GROQ_MODEL=openai/gpt-oss-120b`, also the code default. The client now puts the provider's own message in the error text.

## Case 4: rate limits and a doubled request
- **Run id / prompt:** a 6-question run where the prompts had been pasted twice into the form, on the free Groq tier.
- **What the model returned:** HTTP 429 on several calls, and `EXTRACTION_CALL_FAILED` on the extraction step; 0 of 6 valid.
- **Which check caught it:** samples marked `QUERY_FAILED` or `INVALID`, then a `HALTED` run.
- **How I found it:** the reasons in each sample (429 and long answers), and the doubled prompt text that doubled the number of calls.
- **What changed afterwards:** questions run one at a time (`CONCURRENCY = 1`), answers are asked to stay under 120 words, and 429 responses are retried a bounded number of times honouring `Retry-After` (`app/llm.py`). Tests: `test_429_is_retried_with_retry_after_then_succeeds` and `test_persistent_429_gives_up_after_bounded_retries_and_reports_detail`.

## Case 5: too few questions halts by design
- **Run id / prompt:** a run with 3 questions.
- **Which check caught it:** `TOO_FEW_VALID_SAMPLES`. The gate needs at least 5 valid samples, so the run is `HALTED` with `score: null`, and the database constraint would refuse a score on a halted run.
- **What changed afterwards:** nothing. This is the intended fail-closed behaviour, shown on the dashboard with its meaning and a suggested fix.

## Case 6: the deployed API refused to start
- **Symptom (Render logs):** `relation "runs" already exists`, then later `EMAXCONNSESSION: max clients reached in session mode - max clients are limited to pool_size: 15`.
- **Cause:** the tables had been created by hand in the Supabase SQL editor before the app's own migration ran; then the default connection pool (10 per copy) exceeded Supabase's 15-client limit while the old and new copies overlapped during a redeploy.
- **What changed afterwards:** tables are created only by `app.migrate`; the pool is now `min_size=1, max_size=4`.
