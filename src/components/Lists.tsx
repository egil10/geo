"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, RotateCcw, Eye, Check } from "lucide-react";
import TopBar from "./TopBar";
import { Mode } from "./ModePicker";
import { LISTS } from "@/lib/lists";
import { normalize } from "@/lib/match";
import { EloState } from "@/lib/elo";

const DONE_KEY = "norgequiz.lists.v1";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Lists({
  mode,
  onOpenMode,
  elo,
  onOpenElo,
  onOpenSettings,
}: {
  mode: Mode;
  onOpenMode: () => void;
  elo: EloState;
  onOpenElo: () => void;
  onOpenSettings: () => void;
}) {
  const [listKey, setListKey] = useState(LISTS[0].key);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [gaveUp, setGaveUp] = useState(false);
  const [value, setValue] = useState("");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const list = useMemo(() => LISTS.find((l) => l.key === listKey)!, [listKey]);
  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    list.rows.forEach((row, i) => row.answers.forEach((a) => m.set(normalize(a), i)));
    return m;
  }, [list]);

  const done = gaveUp || found.size === list.rows.length;

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
      if (Array.isArray(raw)) setCompleted(new Set(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Reset board when switching lists.
  useEffect(() => {
    setFound(new Set());
    setGaveUp(false);
    setValue("");
    setStartedAt(Date.now());
    setNow(Date.now());
  }, [listKey]);

  // Count-up timer (stops when the board is done).
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [done, listKey]);

  // Persist completion (all found).
  useEffect(() => {
    if (found.size === list.rows.length && !completed.has(list.key)) {
      const next = new Set(completed).add(list.key);
      setCompleted(next);
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
    }
  }, [found, list, completed]);

  const tryMatch = (text: string) => {
    const i = lookup.get(normalize(text));
    if (i != null && !found.has(i)) {
      setFound((f) => new Set(f).add(i));
      setValue("");
      return true;
    }
    return false;
  };

  const elapsed = Math.floor((now - startedAt) / 1000);
  const allComplete = found.size === list.rows.length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pb-10 pt-3 sm:px-5">
      <TopBar mode={mode} onOpenMode={onOpenMode} elo={elo} onOpenElo={onOpenElo} onOpenSettings={onOpenSettings} />

      {/* List picker strip */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {LISTS.map((l) => (
          <button
            key={l.key}
            onClick={() => setListKey(l.key)}
            className={`pill shrink-0 border ${
              l.key === listKey ? "border-transparent bg-ink text-canvas" : "border-[var(--field-stroke)] bg-[var(--field)] text-ink/80 hover:text-ink"
            }`}
          >
            {completed.has(l.key) && <Check size={13} className={l.key === listKey ? "" : "text-[var(--good)]"} />}
            {l.title}
          </button>
        ))}
      </div>

      {/* Header card */}
      <div className="glass-strong flex flex-col gap-3 rounded-[28px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{list.title}</h1>
            <p className="text-sm text-ink-muted">{list.blurb}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-2xl font-bold tabular-nums leading-none">
              {found.size}
              <span className="text-ink-muted">/{list.rows.length}</span>
            </div>
            <div className="text-[11px] tabular-nums text-ink-muted">{fmtTime(elapsed)}</div>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(found.size / list.rows.length) * 100}%`, background: "var(--nordic)" }} />
        </div>

        {allComplete ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--good)]/12 px-4 py-3 text-sm font-semibold" style={{ color: "var(--good)" }}>
            <Trophy size={16} /> Alle {list.rows.length} på {fmtTime(elapsed)}! Godt jobba.
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={value}
              disabled={gaveUp}
              onChange={(e) => {
                const t = e.target.value;
                setValue(t);
                tryMatch(t);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  tryMatch(value);
                }
              }}
              placeholder="Skriv et navn…"
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              className="min-h-[3rem] flex-1 rounded-2xl border border-[var(--field-stroke)] bg-[var(--field)] px-4 font-medium outline-none placeholder:text-ink-muted focus:border-[var(--nordic)]"
            />
            <button
              onClick={() => setGaveUp(true)}
              className="flex min-h-[3rem] shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--field-stroke)] px-4 text-sm font-medium text-ink-muted transition hover:text-ink focus-ring"
            >
              <Eye size={15} /> Gi opp
            </button>
          </div>
        )}
        {(done) && (
          <button
            onClick={() => {
              setFound(new Set());
              setGaveUp(false);
              setValue("");
              setStartedAt(Date.now());
              setNow(Date.now());
            }}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-ink py-2.5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring"
          >
            <RotateCcw size={15} /> Prøv igjen
          </button>
        )}
      </div>

      {/* Rows */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {list.rows.map((row, i) => {
          const isFound = found.has(i);
          const reveal = isFound || gaveUp;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition ${
                isFound ? "border-transparent bg-[var(--good)]/10 ring-1 ring-[var(--good)]/30" : gaveUp ? "border-[var(--field-stroke)] opacity-70" : "border-[var(--field-stroke)] bg-[var(--field)]"
              }`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/[0.06] text-[11px] font-bold tabular-nums text-ink-muted dark:bg-white/10">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {reveal ? (
                  <div className="truncate text-sm font-semibold" style={{ color: isFound ? "var(--good)" : undefined }}>
                    {row.reveal}
                  </div>
                ) : (
                  <div className="text-sm font-medium tracking-wider text-ink-muted">• • • • •</div>
                )}
                <div className="truncate text-[11px] text-ink-muted">{row.hint}</div>
              </div>
              {isFound && <Check size={15} className="shrink-0" style={{ color: "var(--good)" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
