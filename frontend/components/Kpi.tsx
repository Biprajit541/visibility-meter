import type { ReactNode } from "react";
import { sampleCounts, leaders, pct, fmtPos, colorFor } from "@/lib/derive";
import type { Run } from "@/lib/types";

function Ring({ valid, total }: { valid: number; total: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const frac = total ? valid / total : 0;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${valid} of ${total} samples valid`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--grid)" strokeWidth="9" />
      {frac > 0 && (
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--good)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 44 44)" />
      )}
      <text x="44" y="49" textAnchor="middle" fontSize="18" fontWeight="750" fill="var(--ink)">{valid}/{total}</text>
    </svg>
  );
}

function Tile({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="card kpi fade">
      <span className="label">{label}</span>
      <span className="value">{children}</span>
      {note && <span className="note">{note}</span>}
    </div>
  );
}

export default function KpiRow({ run }: { run: Run }) {
  const c = sampleCounts(run);
  const lead = leaders(run);
  const me = run.score?.brands[0];
  return (
    <div className="kpis">
      <div className="card kpi row fade">
        <Ring valid={c.valid} total={c.total} />
        <div>
          <span className="label">Evidence that held up</span>
          <div className="note" style={{ marginTop: 4 }}>{c.invalid + c.failed === 0 ? "Every sample passed" : `${c.invalid} rejected · ${c.failed} failed`}</div>
        </div>
      </div>
      <Tile label={`${run.brand} mention rate`} note={me ? `average position ${fmtPos(me.mean_position)}` : "no score published"}>
        {me ? <span style={{ color: colorFor(0) }}>{pct(me.mention_rate)}</span> : <span className="muted">—</span>}
      </Tile>
      <Tile label="Most mentioned" note={lead ? `${pct(lead.rate)} of valid answers` : "no score published"}>
        {lead ? <span style={{ fontSize: lead.names.length > 1 ? 22 : 34 }}>{lead.names.join(" & ")}</span> : <span className="muted">—</span>}
      </Tile>
      <Tile label="Caught by the judge" note={c.invalid ? "answers the validator refused to trust" : "no unsupported claims found"}>
        {c.invalid}
      </Tile>
    </div>
  );
}
