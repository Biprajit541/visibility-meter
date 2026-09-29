"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Run } from "@/lib/types";
import { ErrorBox } from "./Status";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function RunForm({ onDone }: { onDone: (run: Run) => void }) {
  const [brand, setBrand] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [prompts, setPrompts] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun({
        brand: brand.trim(),
        competitors: competitors.split(",").map((c) => c.trim()).filter(Boolean),
        prompts: lines(prompts),
      });
      onDone(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" autoComplete="off">
      <h3>New measurement</h3>
      <p className="sub">Ask an LLM buyer-style questions. Code checks every claim before anything is scored.</p>
      <div className="form-grid">
        <div>
          <label htmlFor="brand">Your brand</label>
          <input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} required maxLength={100} autoComplete="off" spellCheck={false} />
          <label htmlFor="comp">Competitors (comma separated, up to 10)</label>
          <input id="comp" value={competitors} onChange={(e) => setCompetitors(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor="prompts">Buyer questions (one per line, 1–20)</label>
          <textarea id="prompts" rows={5} value={prompts} onChange={(e) => setPrompts(e.target.value)} required autoComplete="off" spellCheck={false} />
        </div>
      </div>
      <div className="form-foot">
        <button type="submit" className="btn" disabled={busy}>{busy ? "Measuring…" : "Run measurement"}</button>
        {busy && <span className="muted" aria-live="polite">This can take a minute or two: each question is answered, then checked.</span>}
      </div>
      {error && <div style={{ marginTop: 12 }}><ErrorBox message={error} /></div>}
    </form>
  );
}
