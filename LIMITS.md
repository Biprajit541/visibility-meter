# What this system cannot reliably do

Written down before building workarounds, per the rule "if it's impossible, say so in writing".

1. **It measures one model's answers, not "AI search" in general.** A score describes how the configured
   model (default: a Groq-hosted Llama) answers the prompts you supplied. Other engines, other days and
   other phrasings can differ.
2. **Sampling noise is real.** Answers are non-deterministic. The gate enforces a minimum number of valid
   samples, but it does not compute confidence intervals. Do not read small score differences as real.
3. **The prompt set is the biggest source of bias.** The score is only as representative as the prompts.
4. **Sentiment is the witness's opinion.** The code checks that the quote is real and names the brand. It
   cannot check that "positive" is the right label for that sentence. Treat sentiment as advisory.
5. **Brand matching is string-based.** Aliases, misspellings and product-line names (e.g. "the Vitamin C
   serum") are not resolved. A brand written differently is not seen, by the witness or by the recall check.
6. **The recall check is one-directional.** It catches a tracked brand present in the text but omitted by the
   extractor. It cannot catch a wrong sentiment or a semantically wrong quote that still contains the name.
7. **Position means order of first mention among tracked brands**, not prominence in the page a user sees.
8. **Runs are synchronous.** A run holds the HTTP request open until all prompts finish (max 20 prompts).
   A queue plus polling would be the production design.
