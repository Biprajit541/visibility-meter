# What this system cannot reliably do

Written down before building workarounds, per the rule "if it's impossible, say so in writing".

1. **It measures one model's answers, not "AI search" in general.** A score describes how the configured
   model (default: `openai/gpt-oss-120b` on Groq) answers the prompts you supplied. Other engines, other days
   and other phrasings can differ.
2. **Sampling noise is real.** Answers are non-deterministic. The gate enforces a minimum number of valid
   samples, but it does not compute confidence intervals. With 6 questions each answer moves a rate by about
   17 points, so do not read small score differences as real. Use 8 to 10 questions or more.
3. **The prompt set is the biggest source of bias.** The score is only as representative as the prompts.
4. **Sentiment is the witness's opinion.** The code checks that the quote is real and names the brand. It
   cannot check that "positive" is the right label for that sentence. Treat sentiment, and the net score built
   from it, as advisory.
5. **Brand matching is string-based.** Aliases, misspellings and product-line names (e.g. "the Vitamin C
   serum") are not resolved. A brand written differently is not seen, by the witness or by the recall check.
6. **The recall check is one-directional.** It catches a tracked brand present in the text but omitted by the
   extractor. It cannot catch a wrong sentiment or a semantically wrong quote that still contains the name.
7. **Position means order of first mention among tracked brands**, not prominence in the page a user sees. A
   brand can be "1st" while untracked companies are named before it. Share of Voice likewise counts tracked
   brands only, so it is not market share.
8. **Repeated brands are collapsed.** If the extractor reports a brand more than once, only its first entry is
   judged and counted; later entries are ignored. A later mention that contradicts the first is not represented.
9. **The verbatim-quote rule is strict on purpose.** Unicode form, dash and quote variants, markdown emphasis and
   whitespace are normalised, but wording and case are not. A faithful paraphrase is rejected, so some
   correct answers are excluded (and counted toward the failure rate).
10. **The gate is only as good as its thresholds.** Defaults are 5 valid samples and a 20% failure rate
    (`MIN_VALID_SAMPLES`, `MAX_FAILURE_RATE`). A run with fewer than 5 questions always halts. Loosening them
    lets weaker data through.
11. **Runs are synchronous and sequential.** A run holds the HTTP request open until all prompts finish (max 20
    prompts), and calls are made one at a time because of free-tier Groq limits. Rate-limited calls are retried
    a bounded number of times, then counted as failures. A queue plus polling would be the production design.
12. **One provider.** Only `api.groq.com` is allowed by the egress guard. Other providers would need a change
    in `app/egress.py` and `app/llm.py`.
13. **Free-tier hosting.** Render's free service sleeps when idle (the first request can take about a minute),
    and Supabase's session pooler allows 15 clients, so the API keeps a small connection pool.
14. **No authentication or quotas.** Anyone who can reach the API can start a run, which spends the Groq key's
    quota. CORS restricts browsers, not other clients. Add auth and rate limiting before real public use.
    Row Level Security is on with no policies, so the Supabase public API cannot read or write the tables.
