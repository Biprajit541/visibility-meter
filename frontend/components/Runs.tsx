"use client";
import { ErrorBox } from "./Status";
import { StatusBadge } from "./Status";
import { sampleCounts } from "@/lib/derive";
import type { Run } from "@/lib/types";

interface Props {
  runs: Run[];
  error: string | null;
  onRetry: () => void;
  onSelect: (run: Run) => void;
  selectedId: string | null;
  haltedOnly: boolean;
  setHaltedOnly: (v: boolean) => void;
}

export default function Runs({ runs, error, onRetry, onSelect, selectedId, haltedOnly, setHaltedOnly }: Props) {
  if (error) return <ErrorBox message={error} onRetry={onRetry} />;
  const shown = haltedOnly ? runs.filter((r) => r.status === "HALTED") : runs;
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div><h3>Run history</h3><p className="sub">Newest first. Select a run to load it into the dashboard above.</p></div>
        <label style={{ margin: 0, display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}>
          <input type="checkbox" checked={haltedOnly} onChange={(e) => setHaltedOnly(e.target.checked)} />
          Halted runs only
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="empty">No runs to show.</div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Status</th><th>Brand</th><th>Valid samples</th><th>Why halted</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => {
                const c = sampleCounts(r);
                return (
                  <tr key={r.id} className={r.id === selectedId ? "sel" : undefined}>
                    <td><StatusBadge status={r.status} /></td>
                    <td><b>{r.brand}</b> <span className="muted">vs {r.competitors.join(", ") || "—"}</span></td>
                    <td><span className="minibar"><i style={{ width: `${c.total ? (c.valid / c.total) * 100 : 0}%` }} /></span>{c.valid} / {c.total}</td>
                    <td className="ink2">{r.halt_reasons.map((h) => h.code).join(", ") || "—"}</td>
                    <td>{r.id === selectedId ? <span className="muted">Showing</span> : <button className="linkbtn" onClick={() => onSelect(r)}>View</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
