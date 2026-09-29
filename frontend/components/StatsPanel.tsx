"use client";
import type { Stats } from "@/lib/types";
import { ErrorBox, Loading } from "./Status";

export default function StatsPanel({ stats, error, onRetry }: { stats: Stats | null; error: string | null; onRetry: () => void }) {
  if (error) return <ErrorBox message={error} onRetry={onRetry} />;
  if (!stats) return <Loading what="stats" />;
  if (stats.outcomes.length === 0) return <p className="muted">No data yet.</p>;
  return (
    <div className="card">
      <table>
        <thead><tr><th>Brand</th><th>Sample status</th><th>Samples</th><th>Avg attempts</th></tr></thead>
        <tbody>
          {stats.outcomes.map((o) => (
            <tr key={`${o.brand}-${o.status}`}><td>{o.brand}</td><td>{o.status}</td><td>{o.samples}</td><td>{o.avg_attempts}</td></tr>
          ))}
        </tbody>
      </table>
      {stats.rejections.length > 0 && (
        <>
          <h2>Rejection reasons</h2>
          <table>
            <thead><tr><th>Check</th><th>Count</th></tr></thead>
            <tbody>{stats.rejections.map((r) => <tr key={r.code}><td><code>{r.code}</code></td><td>{r.count}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
