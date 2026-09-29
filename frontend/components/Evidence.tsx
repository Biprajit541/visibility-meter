import { describeHalt } from "@/lib/advice";
import { brandsOf, colorFor, mentionsOf, sampleCounts, stripMarkup } from "@/lib/derive";
import type { Run } from "@/lib/types";

const WORD = { positive: "Positive", neutral: "Neutral", negative: "Negative" } as const;

/** Question x brand table. Each pill is a mention whose quote the validator found verbatim in the raw answer. */
export function EvidenceList({ run }: { run: Run }) {
  const brands = brandsOf(run);
  const cols = `minmax(220px, 1.8fr) repeat(${brands.length}, minmax(112px, 1fr))`;
  const valid = run.samples.filter((s) => s.status === "VALID");
  const namedCount = (b: string) => valid.filter((s) => mentionsOf(s).some((m) => m.brand === b)).length;
  return (
    <div className="ev-scroll">
      <div className="ev" role="table">
        <div className="ev-row ev-head" style={{ gridTemplateColumns: cols }} role="row">
          <span role="columnheader">Buyer question</span>
          {brands.map((b, i) => (
            <span key={b} className="bh" role="columnheader"><i className="sw" style={{ background: colorFor(i) }} />{b}</span>
          ))}
        </div>
        {run.samples.map((s, idx) => {
          const ms = s.status === "VALID" ? mentionsOf(s) : [];
          return (
            <div className="ev-row body" style={{ gridTemplateColumns: cols }} role="row" key={idx}>
              <div className="ev-q" role="cell"><span className="n">Q{idx + 1}</span><span className="t">{s.prompt}</span></div>
              {s.status !== "VALID" ? (
                <div className="ev-rej" role="cell">
                  Not counted
                  <span>{s.status === "INVALID" ? "Rejected by the validator" : "The provider call failed"}. See Findings by question below.</span>
                </div>
              ) : brands.map((b) => {
                const m = ms.find((x) => x.brand === b);
                return (
                  <div className="ev-cell" role="cell" key={b}>
                    {m ? (
                      <span className={`pill ${m.sentiment}`} tabIndex={0}>
                        {WORD[m.sentiment]}
                        <span className="pop"><b>{b}</b>{stripMarkup(m.quote)}</span>
                      </span>
                    ) : <span className="ev-none" role="img" aria-label="not named" title="Not named">&ndash;</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="ev-row ev-foot" style={{ gridTemplateColumns: cols }} role="row">
          <span role="cell">Named in</span>
          {brands.map((b) => <span key={b} role="cell"><b>{namedCount(b)}</b> of {valid.length}</span>)}
        </div>
      </div>
    </div>
  );
}

/** One segmented bar: how the run's samples ended. Every segment is also named in words. */
export function OutcomeBar({ run }: { run: Run }) {
  const c = sampleCounts(run);
  const parts = [
    { n: c.valid, name: "valid", color: "var(--good)", tone: "var(--good-text)" },
    { n: c.invalid, name: "rejected by the validator", color: "var(--warn)", tone: "var(--warn-text)" },
    { n: c.failed, name: "provider errors", color: "var(--crit)", tone: "var(--crit-text)" },
  ];
  return (
    <>
      <div className="outcome" role="img" aria-label={parts.map((p) => `${p.n} ${p.name}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => <div key={p.name} style={{ flex: p.n, background: p.color }} />)}
      </div>
      <div className="outcome-legend">
        {parts.map((p) => (
          <span key={p.name}><strong style={{ color: p.n ? p.tone : "var(--muted)" }}>{p.n}</strong>{p.name}</span>
        ))}
      </div>
    </>
  );
}

export function HaltPanel({ run }: { run: Run }) {
  return (
    <div className="card halt fade" role="alert">
      <h2>No defensible score</h2>
      <p className="ink2" style={{ marginTop: 6, maxWidth: "64ch" }}>
        The pipeline failed closed. It would rather publish nothing than a number the evidence cannot support.
      </p>
      <div className="halt-items">
        {run.halt_reasons.map((r, i) => {
          const a = describeHalt(r.code);
          return (
            <div key={r.code} className="halt-item">
              <span className="hn">{i + 1}.</span>
              <div>
                <div className="ht">{r.detail}</div>
                <dl className="kv">
                  <dt>Check</dt><dd><code>{r.code}</code></dd>
                  <dt>Meaning</dt><dd>{a.message}</dd>
                  <dt>Suggested fix</dt><dd>{a.fix}</dd>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
