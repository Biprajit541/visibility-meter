"use client";
import type { ReactElement } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brandsOf, colorFor, fmtPos, pct } from "@/lib/derive";
import type { Run, Stats } from "@/lib/types";

const tick = { fill: "var(--muted)", fontSize: 12 };
const valueLabel = { fill: "var(--ink)", fontSize: 13, fontWeight: 650 } as const;

function Empty({ children }: { children: string }) {
  return <div className="empty">{children}</div>;
}

/** One key for every chart: a brand keeps its colour everywhere. */
export function BrandKey({ run }: { run: Run }) {
  return (
    <div className="brand-key">
      <span className="lead">Brands</span>
      {brandsOf(run).map((b, i) => (
        <span key={b} className="b"><i className="sw" style={{ background: colorFor(i) }} />{b}{i === 0 ? <span className="muted" style={{ fontWeight: 400 }}>(yours)</span> : null}</span>
      ))}
    </div>
  );
}

export function KeyLegend({ items, line = false }: { items: { name: string; color: string }[]; line?: boolean }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name}><i className={line ? "swl" : "sw"} style={{ background: i.color }} />{i.name}</span>
      ))}
    </div>
  );
}

/** Axis label with the brand's colour beside it. */
function brandTick(brands: string[]) {
  return function BrandTick(props: { x?: number | string; y?: number | string; payload?: { value: string } }): ReactElement {
    const x = Number(props.x ?? 0), y = Number(props.y ?? 0), payload = props.payload;
    const name = payload?.value ?? "";
    const i = brands.indexOf(name);
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-14} y={-6} width={10} height={12} rx={3} fill={colorFor(i)} />
        <text x={-22} y={0} dy={4} textAnchor="end" fill="var(--ink)" fontSize={13.5}>{name}</text>
      </g>
    );
  };
}

/** How often each brand is named. Higher is better. */
export function MentionRateChart({ run }: { run: Run }) {
  if (!run.score) return null;
  const brands = run.score.brands.map((b) => b.brand);
  const data = run.score.brands.map((b, i) => ({
    brand: b.brand, rate: Math.round(b.mention_rate * 100), text: pct(b.mention_rate), color: colorFor(i),
    n: Math.round(b.mention_rate * run.score!.valid_samples),
  }));
  const Tick = brandTick(brands);
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 58 + 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 0, left: 8 }} barCategoryGap={18}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="brand" width={128} tick={(p) => <Tick {...p} />} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "var(--hover)" }} content={({ active, payload }) => {
          const d = active && payload?.length ? (payload[0].payload as (typeof data)[number]) : null;
          return d ? <div className="tip"><b>{d.text}</b><div>{d.brand} is named in {d.n} of {run.score!.valid_samples} valid answers</div></div> : null;
        }} />
        <Bar dataKey="rate" radius={[0, 6, 6, 0]} maxBarSize={26} stroke="var(--surface)" strokeWidth={2}>
          {data.map((d) => <Cell key={d.brand} fill={d.color} />)}
          <LabelList dataKey="text" position="right" style={valueLabel} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const ord = (n: number) => { const v = n % 100; if (v >= 11 && v <= 13) return `${n}th`; return `${n}${["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]}`; };
const mentionsIn = (b: { sentiment: Record<"positive" | "neutral" | "negative", number> }) => b.sentiment.positive + b.sentiment.neutral + b.sentiment.negative;

/** Each brand's slice of all brand mentions across the valid answers. */
export function ShareOfVoiceChart({ run }: { run: Run }) {
  if (!run.score) return null;
  const rows = run.score.brands.map((b, i) => ({ brand: b.brand, n: mentionsIn(b), color: colorFor(i) }));
  const total = rows.reduce((n, r) => n + r.n, 0);
  if (total === 0) return <Empty>No brand was named, so there is no share to show.</Empty>;
  const sorted = [...rows].sort((x, y) => y.n - x.n);
  return (
    <div className="sov">
      <div className="sov-bar" role="img" aria-label={sorted.map((r) => `${r.brand} ${pct(r.n / total)}`).join(", ")}>
        {rows.filter((r) => r.n > 0).map((r) => (
          <div key={r.brand} style={{ flex: r.n, background: r.color }} title={`${r.brand}: ${r.n} of ${total} mentions`} />
        ))}
      </div>
      <div className="sov-list">
        {sorted.map((r) => (
          <div className="sov-row" key={r.brand}>
            <span className="nm"><i className="sw" style={{ background: r.color }} />{r.brand}</span>
            <span className="ct">{r.n} of {total} mentions</span>
            <strong>{pct(r.n / total)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Average rank among the tracked brands, best first. A stem runs from 1st to the brand's average rank, so a short stem is good. */
export function PositionTrack({ run }: { run: Run }) {
  if (!run.score) return null;
  const idx = run.score.brands.map((b, i) => ({ b, i }));
  const named = idx.filter((x) => x.b.mean_position != null).sort((x, y) => x.b.mean_position! - y.b.mean_position!);
  const unnamed = idx.filter((x) => x.b.mean_position == null);
  const maxPos = Math.max(run.score.brands.length, Math.ceil(Math.max(1, ...named.map((x) => x.b.mean_position!))));
  const ranks = Array.from({ length: maxPos }, (_, i) => i + 1);
  const at = (pos: number) => `${maxPos === 1 ? 0 : ((pos - 1) / (maxPos - 1)) * 100}%`;
  return (
    <div className="pos">
      {named.map(({ b, i }) => (
        <div className="pos-row" key={b.brand}>
          <span className="pos-name"><i className="sw" style={{ background: colorFor(i) }} />{b.brand}</span>
          <div className="pos-plot" role="img" aria-label={`${b.brand}: average rank ${fmtPos(b.mean_position)}`}>
            {ranks.map((r) => <span className="pos-grid" key={r} style={{ left: at(r) }} />)}
            <span className="pos-stem" style={{ width: at(b.mean_position!), background: colorFor(i) }} />
            <span className="pos-dot" style={{ left: at(b.mean_position!), background: colorFor(i) }} />
          </div>
          <strong className="pos-val">{fmtPos(b.mean_position)}</strong>
        </div>
      ))}
      {unnamed.map(({ b, i }) => (
        <div className="pos-row" key={b.brand}>
          <span className="pos-name"><i className="sw" style={{ background: colorFor(i) }} />{b.brand}</span>
          <div className="pos-plot none">Never named, so it has no position</div>
          <strong className="pos-val na">none</strong>
        </div>
      ))}
      <div className="pos-row axis" aria-hidden>
        <span />
        <div className="pos-plot ax">{ranks.map((r) => <span key={r} style={{ left: at(r) }}>{ord(r)}</span>)}</div>
        <span />
      </div>
    </div>
  );
}

/** Sentiment of each brand's mentions, with one net score per brand: (positive - negative) / mentions. */
export function SentimentChart({ run }: { run: Run }) {
  if (!run.score) return null;
  const rows = run.score.brands.map((b, i) => ({ brand: b.brand, s: b.sentiment, n: mentionsIn(b), color: colorFor(i) }));
  if (rows.every((r) => r.n === 0)) return <Empty>No mentions to classify.</Empty>;
  const seg = [
    { k: "positive", name: "Positive", cls: "p" },
    { k: "neutral", name: "Neutral", cls: "u" },
    { k: "negative", name: "Negative", cls: "n" },
  ] as const;
  return (
    <div className="sq">
      <div className="legend">
        {seg.map((x) => <span key={x.k}><i className={`sw sq-${x.cls}`} />{x.name}</span>)}
      </div>
      {rows.map((r) => {
        const net = r.n === 0 ? null : Math.round(((r.s.positive - r.s.negative) / r.n) * 100);
        return (
          <div className="sq-row" key={r.brand}>
            <span className="sq-name"><i className="sw" style={{ background: r.color }} />{r.brand}</span>
            {r.n === 0 ? <div className="sq-none">Never named</div> : (
              <div className="sq-bar" role="img" aria-label={`${r.brand}: ${r.s.positive} positive, ${r.s.neutral} neutral, ${r.s.negative} negative`}>
                {seg.map((x) => r.s[x.k] > 0 && <div key={x.k} className={`sq-${x.cls}`} style={{ flex: r.s[x.k] }}>{r.s[x.k]}</div>)}
              </div>
            )}
            <div className="sq-net"><strong className={net == null ? "na" : net > 0 ? "pos" : net < 0 ? "neg" : ""}>{net == null ? "none" : `${net > 0 ? "+" : ""}${net}`}</strong><span>net</span></div>
          </div>
        );
      })}
      <p className="sq-note">Net score runs from -100 (all negative) to +100 (all positive). Numbers inside the bars are mention counts.</p>
    </div>
  );
}

/** Mention rate per brand across scored runs that share the selected run's primary brand. */
export function TrendChart({ run, runs }: { run: Run; runs: Run[] }) {
  const scored = runs.filter((r) => r.status === "SCORED" && r.score && r.brand === run.brand).reverse();
  if (scored.length < 2) return <Empty>Run this brand again to see how its visibility moves between runs.</Empty>;
  const brands = brandsOf(run);
  const data = scored.map((r, i) => {
    const row: Record<string, string | number | null> = { run: `Run ${i + 1}` };
    brands.forEach((b, j) => {
      const s = r.score!.brands.find((x) => x.brand === b);
      row[`b${j}`] = s ? Math.round(s.mention_rate * 100) : null;
    });
    return row;
  });
  const last = data.length - 1;
  return (
    <>
      <KeyLegend line items={brands.map((b, i) => ({ name: b, color: colorFor(i) }))} />
      <ResponsiveContainer width="100%" height={Math.max(200, brands.length * 56 + 40)}>
        <LineChart data={data} margin={{ top: 12, right: 110, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="run" tick={tick} axisLine={{ stroke: "var(--axis)" }} tickLine={false} padding={{ left: 16, right: 8 }} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ stroke: "var(--axis)" }} content={({ active, payload, label }) => active && payload?.length ? (
            <div className="tip"><b>{label}</b>
              {payload.map((p) => <div key={String(p.dataKey)} className="k"><i style={{ background: p.color }} />{String(p.name)}: {String(p.value)}%</div>)}
            </div>
          ) : null} />
          {brands.map((b, i) => (
            <Line key={b} name={b} dataKey={`b${i}`} type="linear" stroke={colorFor(i)} strokeWidth={2.5} connectNulls
              dot={{ r: 5, fill: colorFor(i), stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 7, stroke: "var(--surface)", strokeWidth: 2 }}
              label={(p: { x?: number | string; y?: number | string; index?: number; value?: unknown }): ReactElement => {
                if (p.index !== last || p.x == null || p.y == null) return <g />;
                const ties = brands.slice(0, i).filter((_, j) => data[last][`b${j}`] === data[last][`b${i}`]).length;
                return <text x={Number(p.x) + 10} y={Number(p.y) + ties * 15} dy={4} fill="var(--ink)" fontSize={12.5} fontWeight={650}>{b} {String(p.value)}%</text>;
              }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

/** Why samples were refused, counted in SQL across every run. */
export function RejectionChart({ stats }: { stats: Stats }) {
  if (stats.rejections.length === 0) return <Empty>Nothing has been rejected yet.</Empty>;
  const data = stats.rejections.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 44 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 0 }} barCategoryGap={12}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="code" width={224} tick={{ fill: "var(--ink-2)", fontSize: 12.5 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
        <Tooltip cursor={{ fill: "var(--hover)" }} content={({ active, payload }) => active && payload?.length ? (
          <div className="tip"><b>{String(payload[0].value)}</b><div>{String(payload[0].payload.code)}</div></div>
        ) : null} />
        <Bar dataKey="count" fill="var(--muted)" radius={[0, 5, 5, 0]} maxBarSize={20} stroke="var(--surface)" strokeWidth={2}>
          <LabelList dataKey="count" position="right" style={valueLabel} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
