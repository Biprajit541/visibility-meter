export interface Advice { message: string; fix: string }
export interface Parsed { code: string; brand: string | null; reason: string }

/** Splits an API rejection reason such as "QUOTE_NOT_IN_RESPONSE: quote for 'CeraVe' is not verbatim text". */
export function parseReason(reason: string): Parsed {
  return { code: reason.split(":")[0].trim(), brand: reason.match(/'([^']+)'/)?.[1] ?? null, reason };
}

const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "this brand") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** Plain explanation and a concrete next step for a rejection code, for one or more brands. */
export function describe(code: string, brands: string[], reason: string): Advice {
  const many = brands.length > 1;
  const who = list(brands);

  switch (code) {
    case "QUOTE_NOT_IN_RESPONSE":
      return {
        message: `The ${many ? "quotes" : "quote"} reported for ${who} ${many ? "do" : "does"} not appear word for word in this answer.`,
        fix: "Ask the extractor to copy the sentence exactly. If the answer contains bold markers or special dashes, strip them before comparing (_norm_text in app/validator.py). Then run the measurement again.",
      };
    case "QUOTE_MISSING_BRAND":
      return {
        message: `The ${many ? "quotes" : "quote"} reported for ${who} ${many ? "are" : "is"} real text but ${many ? "do" : "does"} not contain the brand name.`,
        fix: "Tell the extractor the quote must be the sentence that names the brand.",
      };
    case "UNKNOWN_BRAND":
      return {
        message: `${who} ${many ? "are" : "is"} not one of the brands you are tracking.`,
        fix: "Add the brand to Competitors if you want it counted, or tighten the extraction prompt so only listed brands are returned.",
      };
    case "DUPLICATE_BRAND":
      return {
        message: `${who} ${many ? "were" : "was"} reported more than once for the same answer.`,
        fix: "Ask for exactly one entry per brand.",
      };
    case "MISSED_MENTION":
      return {
        message: `${who} ${many ? "appear" : "appears"} in the answer but the extractor left ${many ? "them" : "it"} out.`,
        fix: "Run again. If it repeats, check that the brand is spelled the same way in the form as in the answers.",
      };
    case "SCHEMA_VIOLATION":
      return {
        message: "The extractor returned data that does not match the schema.",
        fix: "Check that EXTRACT_TOOL_SCHEMA in app/pipeline.py matches ExtractionResult in app/schemas.py, then run again.",
      };
  }
  if (/HTTP 429/.test(reason)) return {
    message: "Groq refused the call because a rate limit was reached.",
    fix: "Wait a minute and run again, use fewer questions per run, or set GROQ_MODEL to openai/gpt-oss-20b in .env and restart the API.",
  };
  if (/HTTP 404/.test(reason)) return {
    message: "Groq does not recognise the model name for your key.",
    fix: "Set GROQ_MODEL in .env to a model from your key's /models list (for example openai/gpt-oss-120b), then restart the API.",
  };
  if (/HTTP 401|HTTP 403/.test(reason)) return {
    message: "Groq rejected the API key.",
    fix: "Create a new key at console.groq.com, paste it into GROQ_API_KEY in .env, and restart the API.",
  };
  if (code === "EXTRACTION_CALL_FAILED") return {
    message: "The extraction call to Groq failed.",
    fix: "Read the detail after the code, fix that cause, then run again.",
  };
  if (/transport error/.test(reason)) return {
    message: "The API could not reach Groq.",
    fix: "Check your internet connection. On Render, confirm the service can make outbound requests.",
  };
  return { message: reason, fix: "Check the API terminal for details about this run." };
}

/** Plain explanation and a concrete next step for a reason the whole run was halted. */
export function describeHalt(code: string): Advice {
  switch (code) {
    case "TOO_FEW_VALID_SAMPLES":
      return {
        message: "Fewer answers passed validation than the minimum needed to publish a score.",
        fix: "Fix the causes listed under Findings by question, then run again. Adding more questions also raises the number of valid answers.",
      };
    case "FAILURE_RATE_TOO_HIGH":
      return {
        message: "Too large a share of the questions were rejected or failed at the provider.",
        fix: "Fix the causes listed under Findings by question (most often a rate limit or a wrong model name), then run again.",
      };
    case "EGRESS_BLOCKED":
      return {
        message: "A request tried to reach a host that is not on the allowlist, so the run was stopped.",
        fix: "Find the code path that made the request. Only api.groq.com is permitted (app/egress.py).",
      };
  }
  return { message: "A fail-closed check stopped this run.", fix: "Read the detail above and check the API terminal." };
}
