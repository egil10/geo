"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, RotateCcw, Eye, Check, Shuffle, ArrowRight } from "lucide-react";
import TopBar from "./TopBar";
import { Mode, modeLabel } from "./ModePicker";
import { LISTS, CATEGORY_TO_LIST } from "@/lib/lists";
import { normalize, stripParen } from "@/lib/match";
import { EloState } from "@/lib/elo";
import type { Category } from "@/lib/questions";

const DONE_KEY = "norgequiz.lists.v1";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// The picker lists boards alphabetically (nb locale); "Tilfeldig" stays first.
const SORTED_LISTS = [...LISTS].sort((a, b) => a.title.localeCompare(b.title, "nb"));

export default function Lists({
  mode,
  selected,
  onOpenMode,
  exploreActive,
  onExplore,
  elo,
  onOpenElo,
  onOpenSettings,
}: {
  mode: Mode;
  selected: Set<Category>;
  onOpenMode: () => void;
  exploreActive: boolean;
  onExplore: () => void;
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
  const pickerRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => LISTS.find((l) => l.key === listKey)!, [listKey]);
  // Map every normalized form (and its paren-stripped form) to the row indices
  // that accept it, so duplicate/disambiguated names (e.g. two "Herøy") and
  // bare names both match.
  const lookup = useMemo(() => {
    const m = new Map<string, number[]>();
    const add = (key: string, i: number) => {
      if (!key) return;
      const arr = m.get(key) ?? [];
      if (!arr.includes(i)) arr.push(i);
      m.set(key, arr);
    };
    list.rows.forEach((row, i) =>
      row.answers.forEach((a) => {
        add(normalize(a), i);
        add(normalize(stripParen(a)), i);
      }),
    );
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
    // Deep-link to a specific board, e.g. ?list=kommunenummer (post-mount to avoid SSR mismatch).
    const q = new URLSearchParams(window.location.search).get("list");
    if (q && LISTS.some((l) => l.key === q)) setListKey(q);
  }, []);

  // Picking a single category in Lister mode loads that category's board.
  useEffect(() => {
    if (selected.size !== 1) return;
    const key = CATEGORY_TO_LIST[[...selected][0]];
    if (key && LISTS.some((l) => l.key === key)) setListKey(key);
  }, [selected]);

  // Keep the selected board's pill in view (it's no longer first once sorted).
  useEffect(() => {
    pickerRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [listKey]);

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
    const idxs = lookup.get(normalize(text));
    if (!idxs) return false;
    const i = idxs.find((j) => !found.has(j));
    if (i == null) return false;
    setFound((f) => new Set(f).add(i));
    setValue("");
    return true;
  };

  const restart = () => {
    setFound(new Set());
    setGaveUp(false);
    setValue("");
    setStartedAt(Date.now());
    setNow(Date.now());
  };
  const nextList = () => {
    const others = LISTS.filter((l) => l.key !== listKey);
    setListKey(others[Math.floor(Math.random() * others.length)].key);
  };

  const elapsed = Math.floor((now - startedAt) / 1000);
  const allComplete = found.size === list.rows.length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pb-10 pt-3 sm:px-5">
      <TopBar summary={modeLabel(mode)} onCustomize={onOpenMode} exploreActive={exploreActive} onExplore={onExplore} elo={elo} onOpenElo={onOpenElo} onOpenSettings={onOpenSettings} />

      {/* List picker strip */}
      <div ref={pickerRef} className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        <button
          onClick={nextList}
          className="pill shrink-0 border border-transparent bg-[var(--nordic)] text-white hover:opacity-90"
        >
          <Shuffle size={13} /> Tilfeldig
        </button>
        {SORTED_LISTS.map((l) => (
          <button
            key={l.key}
            data-active={l.key === listKey ? "true" : undefined}
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
              placeholder={list.placeholder ?? "Skriv et navn…"}
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
        {done && (
          <div className="flex gap-2">
            <button
              onClick={restart}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[var(--field-stroke)] py-2.5 text-sm font-semibold text-ink-muted transition hover:text-ink focus-ring"
            >
              <RotateCcw size={15} /> Prøv igjen
            </button>
            <button
              onClick={nextList}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-ink py-2.5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring"
            >
              Neste liste <ArrowRight size={15} />
            </button>
          </div>
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
              className={`cv-row flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition ${
                isFound ? "border-transparent bg-[var(--good)]/10 ring-1 ring-[var(--good)]/30" : gaveUp ? "border-[var(--field-stroke)] opacity-70" : "border-[var(--field-stroke)] bg-[var(--field)]"
              }`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/[0.06] text-[11px] font-bold tabular-nums text-ink-muted dark:bg-white/10">
                {i + 1}
              </span>
              {list.fill ? (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: isFound ? "var(--good)" : undefined }}>{row.prompt}</div>
                    <div className="truncate text-[11px] text-ink-muted">{row.hint}</div>
                  </div>
                  {reveal ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: isFound ? "var(--good)" : "var(--ink)" }}>{row.reveal}</span>
                  ) : (
                    <span className="shrink-0 text-base text-ink-muted/40">—</span>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
