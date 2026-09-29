import type { CSSProperties, ReactNode } from "react";
import { describe, parseReason } from "@/lib/advice";
import { brandsOf, colorFor, headline, leaders, mentionsOf, pct, sampleCounts, stripMarkup } from "@/lib/derive";
import type { Run, Sample } from "@/lib/types";
import { StatusBadge } from "./Status";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---- safe rendering of untrusted model text: React elements only, never innerHTML ---- */
function highlight(text: string, brands: string[], key: string): ReactNode[] {
  if (brands.length === 0) return [text];
  const escaped = [...brands].sort((a, b) => b.length - a.length).map(esc);
  const re = new RegExp(`(?<!\\w)(${escaped.join("|")})(?!\\w)`, "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const idx = brands.findIndex((b) => b.toLowerCase() === m![1].toLowerCase());
    out.push(<mark key={`${key}-${m.index}`} className="hl" style={{ "--c": colorFor(idx) } as CSSProperties}>{m[1]}</mark>);
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text: string, brands: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part, i) => {
    const bold = part.length > 4 && part.startsWith("**") && part.endsWith("**");
    const nodes = highlight(bold ? part.slice(2, -2) : part, brands, `${key}-${i}`);
    if (bold) out.push(<strong key={`${key}-b${i}`}>{nodes}</strong>);
    else out.push(...nodes);
  });
  return out;
}

function Answer({ text, brands }: { text: string; brands: string[] }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    blocks.push(list.ordered ? <ol key={`l${blocks.length}`}>{list.items}</ol> : <ul key={`l${blocks.length}`}>{list.items}</ul>);
    list = null;
  };
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    const num = /^\d+\.\s+(.*)$/.exec(t);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(<li key={i}>{inline((bullet ?? num)![1], brands, `i${i}`)}</li>);
    } else {
      flush();
      if (t) blocks.push(<p key={i}>{inline(t, brands, `p${i}`)}</p>);
    }
  });
  flush();
  return <div className="ans">{blocks}</div>;
}

/* ---- issues: what happened, where in the answer, and how to fix it ---- */
interface Issue { code: string; message: string; fix: string; where: { brands: string[]; excerpt: string }[] }

function lineIndex(lines: string[], brand: string): number | null {
  const re = new RegExp(`(?<!\\w)${esc(brand)}(?!\\w)`, "i");
  const i = lines.findIndex((l) => re.test(l));
  return i >= 0 ? i : null;
}

function excerpt(line: string): string {
  const t = stripMarkup(line).replace(/^\s*(?:[-*•]|\d+\.)\s+/, "").trim();
  return t.length > 150 ? `${t.slice(0, 150).trimEnd()}...` : t;
}

const joinNames = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

function issuesOf(sample: Sample): Issue[] {
  const lines = (sample.raw_response ?? "").split("\n");
  const groups = new Map<string, { code: string; reason: string; brands: string[] }>();
  for (const r of sample.reasons) {
    const p = parseReason(r);
    const key = p.brand ? p.code : r;
    const g = groups.get(key) ?? { code: p.code, reason: r, brands: [] };
    if (p.brand && !g.brands.includes(p.brand)) g.brands.push(p.brand);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const byLine = new Map<number, string[]>();
    if (sample.raw_response) {
      for (const b of g.brands) {
        const i = lineIndex(lines, b);
        if (i != null) byLine.set(i, [...(byLine.get(i) ?? []), b]);
      }
    }
    const where = [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([i, brands]) => ({ brands, excerpt: excerpt(lines[i]) }));
    const a = describe(g.code, g.brands, g.reason);
    return { code: g.code, message: a.message, fix: a.fix, where };
  });
}

const RESULT = {
  VALID: (n: number) => `Accepted on attempt ${n}.`,
  INVALID: (n: number) => `Rejected after ${n} ${n === 1 ? "attempt" : "attempts"}. This answer is excluded from the score because the model's claims could not be verified against the text.`,
  QUERY_FAILED: () => "No answer was received, so nothing could be checked. This question is excluded from the score.",
} as const;

function Finding({ sample, n, brands }: { sample: Sample; n: number; brands: string[] }) {
  const tone = sample.status === "VALID" ? "good" : sample.status === "INVALID" ? "warn" : "crit";
  const ms = mentionsOf(sample);
  const issues = sample.status === "VALID" ? [] : issuesOf(sample);
  return (
    <article className={`finding ${tone}`}>
      <header>
        <span className="fnum">Question {n}</span>
        <h4>{sample.prompt}</h4>
        <StatusBadge status={sample.status} />
      </header>
      <div className="fcols">
        <section>
          <h5>Model answer</h5>
          {sample.raw_response ? <Answer text={sample.raw_response} brands={brands} /> : <p className="muted">No answer was returned for this question.</p>}
        </section>
        <section>
          <h5>Validator verdict</h5>
          <dl className="kv">
            <dt>Result</dt>
            <dd>{RESULT[sample.status](sample.attempts)}</dd>
            {sample.status === "VALID" && (
              <>
                <dt>Brands found</dt>
                <dd>
                  {ms.length === 0 ? "No tracked brand is named in this answer. That is a valid result and counts toward the score." : (
                    <ul className="evidence">
                      {ms.map((m) => (
                        <li key={m.brand} style={{ "--c": colorFor(brands.indexOf(m.brand)) } as CSSProperties}>
                          <div className="who">{m.brand}<span className={`sword ${m.sentiment}`}>{m.sentiment}</span></div>
                          <blockquote>{inline(stripMarkup(m.quote), brands, `q${m.brand}`)}</blockquote>
                          <span className="okline">Found word for word in the answer.</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </>
            )}
          </dl>

          {issues.length > 0 && (
            <div className="issues">
              <h5>Issues</h5>
              {issues.map((it, i) => (
                <div className="issue" key={i}>
                  <div className="in">{i + 1}.</div>
                  <dl className="kv">
                    <dt>What happened</dt><dd>{it.message}</dd>
                    {it.where.length > 0 && (
                      <>
                        <dt>Where</dt>
                        <dd>
                          {it.where.map((w, k) => (
                            <p key={k} className="where">{joinNames(w.brands)} {w.brands.length > 1 ? "appear" : "appears"} in: <q>{w.excerpt}</q></p>
                          ))}
                        </dd>
                      </>
                    )}
                    <dt>Suggested fix</dt><dd>{it.fix}</dd>
                    <dt>Check</dt><dd><code>{it.code}</code></dd>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

export default function Report({ run }: { run: Run }) {
  const brands = brandsOf(run);
  const c = sampleCounts(run);
  const lead = leaders(run);
  const key: string[] = [headline(run)];
  if (lead) key.push(`${lead.names.join(" and ")} ${lead.names.length > 1 ? "are" : "is"} named most often (${pct(lead.rate)} of valid answers).`);
  if (c.total > 0 && c.valid === c.total) key.push(`All ${c.total} answers passed verification.`);
  if (c.invalid > 0) key.push(`${c.invalid} answer${c.invalid > 1 ? "s were" : " was"} rejected by the validator and excluded from the score. The reasons and fixes are given under Findings by question.`);
  if (c.failed > 0) key.push(`${c.failed} question${c.failed > 1 ? "s" : ""} failed at the provider and produced no answer.`);
  if (run.status === "HALTED") key.push(`The run halted: ${run.halt_reasons.map((h) => h.detail).join("; ")}.`);

  return (
    <div className="card report fade" id="report">
      <div className="report-head">
        <div className="report-kicker">Measurement report</div>
        <h2>{run.brand}: visibility in AI answers</h2>
        <dl className="meta">
          <div><dt>Outcome</dt><dd><StatusBadge status={run.status} /></dd></div>
          <div><dt>Compared with</dt><dd>{run.competitors.join(", ") || "no competitors"}</dd></div>
          <div><dt>Questions asked</dt><dd>{c.total}</dd></div>
          <div><dt>Valid samples</dt><dd>{c.valid} of {c.total}</dd></div>
          <div><dt>Schema version</dt><dd>v{run.schema_version}</dd></div>
          <div><dt>Run</dt><dd><code>{run.id.slice(0, 8)}</code></dd></div>
        </dl>
      </div>

      <div className="report-body">
        <section className="rsec">
          <h3>Key findings</h3>
          <ol className="keyfind">{key.map((k, i) => <li key={i}>{k}</li>)}</ol>
        </section>

        <section className="rsec">
          <h3>Findings by question</h3>
          {run.samples.map((s, i) => <Finding key={i} sample={s} n={i + 1} brands={brands} />)}
        </section>

        <section className="method">
          <b>How to read this report.</b> The model answers each question and reports which brands it saw (the witness).
          Deterministic code then checks every quote against the answer, works out each brand&apos;s position from the text,
          computes every score, and decides whether a score may be published (the judge). Sentiment is the model&apos;s label;
          the code verifies the quote behind it, not the judgement.
        </section>
      </div>
    </div>
  );
}
