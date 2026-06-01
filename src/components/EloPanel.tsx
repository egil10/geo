"use client";

import Modal from "./Modal";
import { EloState, tierFor, accuracy, TIERS } from "@/lib/elo";
import { CATEGORIES } from "@/lib/questions";

// A "nice" axis step (1 / 2 / 5 × 10ⁿ) so ticks land on round numbers.
function niceStep(range: number, target: number): number {
  const raw = Math.max(1, range) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n <= 1.5 ? 1 : n <= 3 ? 2 : n <= 7 ? 5 : 10;
  return s * mag;
}

function HistoryChart({ history, games }: { history: number[]; games: number }) {
  const data = history.length > 1 ? history : [history[0] ?? 800, history[0] ?? 800];
  const n = data.length;
  const w = 520;
  const h = 162;
  const pad = { t: 12, r: 10, b: 24, l: 40 };
  const min = Math.min(...data);
  const max = Math.max(...data);

  // Y axis: snap the visible range to round gridlines.
  const yStep = niceStep(Math.max(30, max - min), 4);
  const lo = Math.floor(min / yStep) * yStep;
  const hi = Math.max(lo + yStep, Math.ceil(max / yStep) * yStep);
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 0.5; v += yStep) yTicks.push(v);

  // X axis: absolute question numbers at round intervals.
  const firstGame = Math.max(0, games - (n - 1));
  const lastGame = firstGame + (n - 1);
  const xStep = niceStep(Math.max(1, lastGame - firstGame), 5);
  const xTicks: number[] = [];
  for (let g = Math.ceil(firstGame / xStep) * xStep; g <= lastGame; g += xStep) xTicks.push(g);

  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const net = data[n - 1] - data[0];
  const stroke = net >= 0 ? "var(--good)" : "var(--bad)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Elo-historikk">
      {yTicks.map((v) => (
        <g key={"y" + v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--hairline)" strokeWidth="1" />
          <text x={pad.l - 5} y={y(v) + 3} fontSize="9" textAnchor="end" fill="var(--ink-muted)" className="tabular-nums">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((g) => {
        const px = x(g - firstGame);
        return (
          <g key={"x" + g}>
            <line x1={px} x2={px} y1={h - pad.b} y2={h - pad.b + 3} stroke="var(--hairline)" strokeWidth="1" />
            <text x={px} y={h - pad.b + 14} fontSize="9" textAnchor="middle" fill="var(--ink-muted)" className="tabular-nums">
              {g}
            </text>
          </g>
        );
      })}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(data[n - 1])} r="3" fill={stroke} />
    </svg>
  );
}

export default function EloPanel({ elo, onClose }: { elo: EloState; onClose: () => void }) {
  const tier = tierFor(elo.rating);
  const catStats = CATEGORIES.map((c) => ({ ...c, s: elo.perCat[c.key] })).filter((c) => c.s && c.s.games > 0);

  return (
    <Modal onClose={onClose} title="Din rangering" size="lg">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Rang</div>
          <div className="font-display text-2xl font-bold tracking-tight">{tier.name}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-bold tabular-nums leading-none">{elo.rating}</div>
          <div className="text-[11px] text-ink-muted">Elo</div>
        </div>
      </div>

      {/* progress to next tier */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.round(tier.progress * 100)}%`, background: "var(--nordic)" }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-muted">
          <span>{tier.name}</span>
          <span>{tier.next ? `→ ${tier.next} (${tier.ceil})` : "Toppen nådd"}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Topp", value: elo.peak },
          { label: "Treff", value: `${accuracy(elo)}%` },
          { label: "Spurt", value: elo.games },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl px-3 py-2.5 text-center">
            <div className="font-display text-xl font-bold tabular-nums">{s.value}</div>
            <div className="text-[11px] text-ink-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {elo.history.length > 2 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Utvikling</div>
          <div className="glass rounded-2xl p-2">
            <HistoryChart history={elo.history} games={elo.games} />
          </div>
        </div>
      )}

      {catStats.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Per kategori</div>
          <div className="space-y-1.5">
            {catStats.map((c) => {
              const acc = Math.round((c.s!.wins / c.s!.games) * 100);
              return (
                <div key={c.key} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-sm">{c.label}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${acc}%`, background: "var(--nordic)" }} />
                  </div>
                  <div className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                    {acc}% · {c.s!.games}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-ink-muted">
        Elo lagres på denne enheten. Vanskelige spørsmål gir mer uttelling.
      </p>
    </Modal>
  );
}
