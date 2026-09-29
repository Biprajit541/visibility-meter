export function StatusBadge({ status }: { status: string }) {
  const tone = status === "SCORED" || status === "VALID" ? "good" : status === "INVALID" ? "warn" : "crit";
  return <span className={`badge ${tone}`}>{status.replace(/_/g, " ")}</span>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="error">
      {message}{" "}
      {onRetry && <button className="linkbtn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "grid", gap: 16 }}>
      <span className="muted">Loading runs…</span>
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 110 }} />)}</div>
      <div className="grid-2">{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 260 }} />)}</div>
    </div>
  );
}
