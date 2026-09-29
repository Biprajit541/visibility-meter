import type { Run } from "@/lib/types";
import { StatusBadge } from "./Status";

export default function RunDetail({ run }: { run: Run }) {
  return (
    <div className="card">
      <p>
        <StatusBadge status={run.status} /> <strong>{run.brand}</strong>{" "}
        <span className="muted">schema v{run.schema_version} · run {run.id.slice(0, 8)}</span>
      </p>

      {run.status === "SCORED" && run.score ? (
        <table>
          <thead><tr><th>Brand</th><th>Mention rate</th><th>Mean position</th><th>+ / neutral / −</th></tr></thead>
          <tbody>
            {run.score.brands.map((b) => (
              <tr key={b.brand}>
                <td>{b.brand}</td>
                <td>{(b.mention_rate * 100).toFixed(0)}% of {run.score!.valid_samples} valid</td>
                <td>{b.mean_position ?? "—"}</td>
                <td>{b.sentiment.positive} / {b.sentiment.neutral} / {b.sentiment.negative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="alert" className="error">
          <strong>No defensible score.</strong>
          <ul>
            {run.halt_reasons.map((r) => <li key={r.code}><code>{r.code}</code>: {r.detail}</li>)}
          </ul>
        </div>
      )}

      <h2>Samples</h2>
      {run.samples.map((s, i) => (
        <details key={i}>
          <summary><StatusBadge status={s.status} /> {s.prompt} <span className="muted">(attempts: {s.attempts})</span></summary>
          {s.reasons.length > 0 && <ul>{s.reasons.map((r, j) => <li key={j} className="bad">{r}</li>)}</ul>}
          {s.raw_response && <pre>{s.raw_response}</pre>}
        </details>
      ))}
    </div>
  );
}
