"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtPos, headline, pct } from "@/lib/derive";
import type { Run, Stats } from "@/lib/types";
import RunForm from "@/components/RunForm";
import Runs from "@/components/Runs";
import KpiRow from "@/components/Kpi";
import ThemeToggle from "@/components/Theme";
import { DashboardSkeleton, ErrorBox, StatusBadge } from "@/components/Status";
import { EvidenceList, HaltPanel, OutcomeBar } from "@/components/Evidence";
import Report from "@/components/Report";
import { BrandKey, MentionRateChart, PositionTrack, RejectionChart, SentimentChart, ShareOfVoiceChart, TrendChart } from "@/components/Charts";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Unexpected error");

function ScoreTable({ run }: { run: Run }) {
  if (!run.score) return null;
  return (
    <details>
      <summary>View the numbers as a table</summary>
      <div className="table-scroll">
        <table className="data">
          <thead><tr><th>Brand</th><th>Mention rate</th><th>Mean position</th><th>Positive</th><th>Neutral</th><th>Negative</th></tr></thead>
          <tbody>
            {run.score.brands.map((b) => (
              <tr key={b.brand}>
                <td>{b.brand}</td><td>{pct(b.mention_rate)}</td><td>{fmtPos(b.mean_position)}</td>
                <td>{b.sentiment.positive}</td><td>{b.sentiment.neutral}</td><td>{b.sentiment.negative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function RunView({ run, runs }: { run: Run; runs: Run[] }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <StatusBadge status={run.status} />
        <span className="ink2"><b>{run.brand}</b> vs {run.competitors.join(", ") || "no competitors"}</span>
        <span className="muted">schema v{run.schema_version} · run {run.id.slice(0, 8)}</span>
      </div>
      <p className="ink2" style={{ fontSize: 17, maxWidth: "70ch" }}>{headline(run)}</p>

      <KpiRow run={run} />

      {run.status === "HALTED" ? <HaltPanel run={run} /> : (
        <>
          <div className="card fade"><BrandKey run={run} /></div>
          <div className="grid-2">
            <div className="card fade">
              <h3>Visibility Score</h3>
              <p className="sub">Share of valid answers that name the brand. Longer bar is better.</p>
              <MentionRateChart run={run} />
              <ScoreTable run={run} />
            </div>
            <div className="card fade">
              <h3>Share of Voice</h3>
              <p className="sub">Each brand&apos;s share of all brand mentions. A larger slice means more of the conversation.</p>
              <ShareOfVoiceChart run={run} />
            </div>
          </div>
          <div className="grid-2">
            <div className="card fade">
              <h3>Recommendation Position</h3>
              <p className="sub">Average rank when the brand is named. Closer to 1st is better.</p>
              <PositionTrack run={run} />
            </div>
            <div className="card fade">
              <h3>Sentiment Quality</h3>
              <p className="sub">How the answers describe each brand when they name it.</p>
              <SentimentChart run={run} />
            </div>
          </div>
          <div className="card fade">
            <h3>Change between runs</h3>
            <p className="sub">Visibility Score for the same brand set, oldest run on the left</p>
            <TrendChart run={run} runs={runs} />
          </div>
        </>
      )}

      <div className="card fade">
        <h3>How the samples ended</h3>
        <p className="sub">Every answer is checked before it may count.</p>
        <OutcomeBar run={run} />
      </div>

      {run.status === "SCORED" && (
        <div className="card fade">
          <h3>Evidence by question</h3>
          <p className="sub">Each label is a mention whose quote was found word for word in the raw answer. Hover a label to read the quote.</p>
          <EvidenceList run={run} />
        </div>
      )}

      <Report run={run} />
    </>
  );
}

export default function Page() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [created, setCreated] = useState<Run | null>(null);
  const [haltedOnly, setHaltedOnly] = useState(false);

  const loadRuns = useCallback(async () => {
    setRunsError(null);
    try { setRuns(await api.listRuns()); } catch (e) { setRunsError(msg(e)); }
  }, []);
  const loadStats = useCallback(async () => {
    setStatsError(null);
    try { setStats(await api.stats()); } catch (e) { setStatsError(msg(e)); }
  }, []);
  useEffect(() => { void loadRuns(); void loadStats(); }, [loadRuns, loadStats]);

  const list = runs ?? [];
  const selected = list.find((r) => r.id === pickedId) ?? (pickedId && created?.id === pickedId ? created : null) ?? list[0] ?? null;
  const apiState = runsError ? "bad" : runs ? "ok" : "";

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brandmark">
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
              <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--s1)" /><stop offset="1" stopColor="var(--s7)" /></linearGradient></defs>
              <rect width="26" height="26" rx="7" fill="url(#lg)" />
              <path d="M6 16.5 10 12l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Visibility Meter
          </div>
          <span className="chip hide-sm">fail-closed</span>
          <span className="spacer" />
          <span className={`api-dot ${apiState}`}><i /><span className="api-text">{apiState === "ok" ? "API connected" : apiState === "bad" ? "API unreachable" : "Connecting…"}</span></span>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <section className="hero">
          <h1>Is AI recommending your brand? <em>Only if the evidence holds.</em></h1>
          <p>
            An LLM answers buyer questions and reports what it saw. Deterministic code checks every quote, computes every number,
            and refuses to publish a score it cannot defend.
          </p>
        </section>

        <RunForm onDone={(run) => { setCreated(run); setPickedId(run.id); void loadRuns(); void loadStats(); }} />

        <div className="section-label">Result</div>
        {runsError ? <ErrorBox message={runsError} onRetry={loadRuns} /> :
          !runs ? <DashboardSkeleton /> :
          selected ? <RunView run={selected} runs={list} /> :
          <div className="card empty">Run your first measurement above to see the dashboard.</div>}

        {runs && runs.length > 0 && (
          <>
            <div className="section-label">Across all runs</div>
            <div className="card fade">
              <h3>Why samples get rejected</h3>
              <p className="sub">Counted with a SQL aggregate over every stored sample</p>
              {statsError ? <ErrorBox message={statsError} onRetry={loadStats} /> :
                !stats ? <div className="skel" style={{ height: 150, marginTop: 12 }} /> :
                <RejectionChart stats={stats} />}
            </div>
            <Runs runs={list} error={null} onRetry={loadRuns} onSelect={(r) => setPickedId(r.id)}
              selectedId={selected?.id ?? null} haltedOnly={haltedOnly} setHaltedOnly={setHaltedOnly} />
          </>
        )}

      </main>
    </>
  );
}
