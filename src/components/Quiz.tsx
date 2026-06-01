"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Check, X, ArrowRight, Flame, ChevronUp, ChevronDown, GripVertical, SkipForward, MinusCircle } from "lucide-react";
import {
  Round,
  OrderRound,
  nextRound,
  nextOrderRound,
  activeGenerators,
  Category,
  CATEGORIES,
} from "@/lib/questions";
import { EloState } from "@/lib/elo";
import { imgAt, heroProps, preloadImage, Quality } from "@/lib/images";
import { matchesAnswer } from "@/lib/match";
import QImage from "./QImage";
import NorwayMap from "./NorwayMap";
import TopBar from "./TopBar";
import { Mode } from "./ModePicker";

type AnyRound = Round | OrderRound;
const isOrder = (r: AnyRound): r is OrderRound => "items" in r;
const subjectId = (r: AnyRound) => (isOrder(r) ? r.correctIds[0] : r.subject.id);
const answerKeyOf = (r: AnyRound) => (isOrder(r) ? r.cat : r.answerKey);

const nf = new Intl.NumberFormat("nb-NO");
const fmtVal = (v: number, unit: string) => `${nf.format(Math.round(v))} ${unit}`.trim();

interface State {
  round: AnyRound | null;
  queue: AnyRound[];
  phase: "idle" | "answered";
  picked: number | null;
  typed: string | null;
  submittedOrder: string[] | null;
  skipped: boolean;
  won: boolean | null;
  delta: number | null;
  total: number;
  correct: number;
  streak: number;
  best: number;
  recentSubjects: string[];
  recentAnswers: string[];
  lastGen: string | null;
}

type Action =
  | { type: "init"; rounds: AnyRound[] }
  | { type: "answer"; won: boolean; delta: number; picked?: number; typed?: string; order?: string[]; skipped?: boolean }
  | { type: "next"; newRound: AnyRound };

const initial: State = {
  round: null,
  queue: [],
  phase: "idle",
  picked: null,
  typed: null,
  submittedOrder: null,
  skipped: false,
  won: null,
  delta: null,
  total: 0,
  correct: 0,
  streak: 0,
  best: 0,
  recentSubjects: [],
  recentAnswers: [],
  lastGen: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "init":
      return {
        ...state,
        round: action.rounds[0] ?? null,
        queue: action.rounds.slice(1),
        phase: "idle",
        picked: null,
        typed: null,
        submittedOrder: null,
        skipped: false,
        won: null,
        delta: null,
        recentSubjects: action.rounds.map(subjectId),
        recentAnswers: action.rounds.map(answerKeyOf),
        lastGen: action.rounds.at(-1) && !isOrder(action.rounds.at(-1)!) ? (action.rounds.at(-1) as Round).genKey : null,
      };
    case "answer": {
      const streak = action.won ? state.streak + 1 : 0;
      return {
        ...state,
        phase: "answered",
        won: action.won,
        delta: action.delta,
        picked: action.picked ?? null,
        typed: action.typed ?? null,
        submittedOrder: action.order ?? null,
        skipped: action.skipped ?? false,
        total: state.total + 1,
        correct: state.correct + (action.won ? 1 : 0),
        streak,
        best: Math.max(state.best, streak),
      };
    }
    case "next": {
      const round = state.queue[0] ?? action.newRound;
      const queue = state.queue.length ? [...state.queue.slice(1), action.newRound] : [action.newRound];
      return {
        ...state,
        round,
        queue,
        phase: "idle",
        picked: null,
        typed: null,
        submittedOrder: null,
        skipped: false,
        won: null,
        delta: null,
        streak: state.streak >= 10 ? 0 : state.streak,
        recentSubjects: [...state.recentSubjects, subjectId(round)].slice(-30),
        recentAnswers: [...state.recentAnswers, answerKeyOf(round)].slice(-14),
        lastGen: isOrder(round) ? state.lastGen : round.genKey,
      };
    }
  }
}

function makeRound(
  mode: Mode,
  gens: ReturnType<typeof activeGenerators>,
  selected: Set<Category>,
  ctx: { recentSubjects: Set<string>; recentAnswers: string[]; lastGen: string | null },
): AnyRound {
  return mode === "sorter" ? nextOrderRound(selected) : nextRound(gens, ctx);
}

function buildInitial(mode: Mode, gens: ReturnType<typeof activeGenerators>, selected: Set<Category>): AnyRound[] {
  const recentSubjects: string[] = [];
  const recentAnswers: string[] = [];
  let lastGen: string | null = null;
  const rounds: AnyRound[] = [];
  for (let i = 0; i < 3; i++) {
    const r = makeRound(mode, gens, selected, { recentSubjects: new Set(recentSubjects), recentAnswers, lastGen });
    rounds.push(r);
    recentSubjects.push(subjectId(r));
    recentAnswers.push(answerKeyOf(r));
    if (!isOrder(r)) lastGen = r.genKey;
  }
  return rounds;
}

const diffLevel = (d: number) => (d < 950 ? 1 : d < 1320 ? 2 : 3);

export default function Quiz({
  mode,
  selected,
  elo,
  onResult,
  onPerfectStreak,
  onOpenPicker,
  onOpenMode,
  exploreActive,
  onExplore,
  onOpenElo,
  onOpenSettings,
  autoAdvance,
  quality,
}: {
  mode: Mode;
  selected: Set<Category>;
  elo: EloState;
  onResult: (won: boolean, difficulty: number, cat: Category) => number;
  onPerfectStreak: () => void;
  onOpenPicker: () => void;
  onOpenMode: () => void;
  exploreActive: boolean;
  onExplore: () => void;
  onOpenElo: () => void;
  onOpenSettings: () => void;
  autoAdvance: number;
  quality: Quality;
}) {
  const gens = useMemo(() => activeGenerators(selected, mode === "skriv"), [selected, mode]);
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    dispatch({ type: "init", rounds: buildInitial(mode, gens, selected) });
  }, [mode, gens, selected]);

  const handleNext = useCallback(() => {
    const r = makeRound(mode, gens, selected, {
      recentSubjects: new Set(state.recentSubjects),
      recentAnswers: state.recentAnswers,
      lastGen: state.lastGen,
    });
    dispatch({ type: "next", newRound: r });
  }, [mode, gens, selected, state.recentSubjects, state.recentAnswers, state.lastGen]);

  const score = useCallback(
    (won: boolean, extra: { picked?: number; typed?: string; order?: string[]; skipped?: boolean }) => {
      const r = state.round!;
      const delta = onResult(won, r.difficulty, r.cat);
      if (won && state.streak + 1 === 10) onPerfectStreak();
      dispatch({ type: "answer", won, delta, ...extra });
    },
    [state.round, state.streak, onResult, onPerfectStreak],
  );

  // Skip the current question: counts as wrong, reveals the answer.
  const handleSkip = useCallback(() => {
    if (state.phase !== "idle" || !state.round) return;
    score(false, { skipped: true });
  }, [state.phase, state.round, score]);

  const answerChoose = useCallback(
    (i: number) => {
      if (state.phase !== "idle" || !state.round || isOrder(state.round)) return;
      score(i === state.round.answerIndex, { picked: i });
    },
    [state.phase, state.round, score],
  );

  const answerWrite = useCallback(
    (text: string) => {
      if (state.phase !== "idle" || !state.round || isOrder(state.round)) return;
      score(matchesAnswer(text, state.round.answerKey), { typed: text });
    },
    [state.phase, state.round, score],
  );

  const answerOrder = useCallback(
    (orderIds: string[]) => {
      if (state.phase !== "idle" || !state.round || !isOrder(state.round)) return;
      const correctIds = state.round.correctIds;
      const allRight = orderIds.every((id, i) => id === correctIds[i]);
      score(allRight, { order: orderIds });
    },
    [state.phase, state.round, score],
  );

  // Keyboard: digits answer (Velg), Enter advances after answering.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (/INPUT|TEXTAREA/.test(tag)) return;
      if (state.phase === "answered") {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
          e.preventDefault();
          handleNext();
        }
      } else if (mode === "velg") {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 4) answerChoose(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, mode, answerChoose, handleNext]);

  // Optional auto-advance.
  useEffect(() => {
    if (state.phase === "answered" && autoAdvance > 0) {
      const t = setTimeout(handleNext, autoAdvance);
      return () => clearTimeout(t);
    }
  }, [state.phase, autoAdvance, handleNext]);

  // Preload upcoming prompt/reveal images (Velg/Skriv only).
  useEffect(() => {
    for (const r of state.queue) {
      if (isOrder(r)) continue;
      if (r.prompt.kind === "image") {
        const p = heroProps(r.prompt.src, r.prompt.variant, quality);
        preloadImage(p.src, p.srcSet, p.sizes);
      }
      if (r.subject.photo) {
        const p = heroProps(r.subject.photo, "photo", quality);
        preloadImage(p.src, p.srcSet, p.sizes);
      }
    }
  }, [state.queue, quality]);

  const catLabel = useMemo(() => {
    if (selected.size === 0 || selected.size === CATEGORIES.length) return "Alt";
    if (selected.size === 1) return CATEGORIES.find((c) => selected.has(c.key))?.label ?? "Alt";
    return `${selected.size} kategorier`;
  }, [selected]);

  const round = state.round;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pb-10 pt-3 sm:px-5">
      <TopBar
        mode={mode}
        onOpenMode={onOpenMode}
        catLabel={catLabel}
        onOpenPicker={onOpenPicker}
        exploreActive={exploreActive}
        onExplore={onExplore}
        elo={elo}
        onOpenElo={onOpenElo}
        onOpenSettings={onOpenSettings}
      />

      {/* Streak — 10 in a row triggers a celebration, then resets. */}
      <div className="flex items-center gap-2 px-1">
        <Flame size={14} className={state.streak > 0 ? "text-amber-500" : "text-ink-muted"} />
        <div className="flex flex-1 items-center gap-1" aria-label={`Rekke ${state.streak} av 10`}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors duration-300"
              style={{ background: i < state.streak ? "var(--nordic)" : "var(--hairline)" }}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-ink-muted">{state.streak}/10</span>
      </div>

      {round &&
        (isOrder(round) ? (
          <OrderBoard key={round.uid} round={round} phase={state.phase} submitted={state.submittedOrder} onCheck={answerOrder} />
        ) : (
          <QuestionCard
            key={round.uid}
            round={round}
            mode={mode}
            phase={state.phase}
            picked={state.picked}
            quality={quality}
            onChoose={answerChoose}
            onWrite={answerWrite}
          />
        ))}

      {/* Reveal / status strip — fixed height so layout never jumps. */}
      <div className="min-h-[104px]">
        {state.phase === "answered" && round ? (
          <RevealBar round={round} won={!!state.won} skipped={state.skipped} delta={state.delta} typed={state.typed} onNext={handleNext} />
        ) : (
          <div className="animate-fade-in flex h-[104px] flex-col items-center justify-center gap-2 text-sm text-ink-muted">
            <span>Spørsmål {state.total + 1}</span>
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 rounded-full border border-[var(--field-stroke)] px-3.5 py-1.5 text-xs font-medium text-ink-muted transition hover:text-ink focus-ring"
            >
              <SkipForward size={13} /> Hopp over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Velg / Skriv card ----------------------------------------------------
function QuestionCard({
  round,
  mode,
  phase,
  picked,
  quality,
  onChoose,
  onWrite,
}: {
  round: Round;
  mode: Mode;
  phase: "idle" | "answered";
  picked: number | null;
  quality: Quality;
  onChoose: (i: number) => void;
  onWrite: (s: string) => void;
}) {
  const answered = phase === "answered";
  const level = diffLevel(round.difficulty);
  const catLabel = CATEGORIES.find((c) => c.key === round.cat)?.label ?? "";

  return (
    <div className="animate-pop flex flex-col gap-3">
      <div className="glass-strong flex h-[320px] flex-col overflow-hidden rounded-[28px] sm:h-[360px]">
        <div className="flex shrink-0 items-center justify-between px-5 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{catLabel}</span>
          <span className="flex items-center gap-1" aria-label={`Vanskelighet ${level} av 3`}>
            {[1, 2, 3].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i <= level ? "var(--nordic)" : "var(--hairline)" }} />
            ))}
          </span>
        </div>

        {round.prompt.kind === "image" ? (
          <>
            <div className="flex h-[3.5rem] shrink-0 items-center justify-center px-5 pb-2 pt-1">
              <p className="line-clamp-2 text-center text-base font-semibold leading-snug sm:text-lg">{round.prompt.text}</p>
            </div>
            <div className="relative flex-1">
              {round.prompt.variant === "coa" ? (
                <div className="absolute inset-3 overflow-hidden rounded-2xl bg-white">
                  <QImage idKey={round.uid} {...heroProps(round.prompt.src, "coa", quality)} alt={round.prompt.alt} variant="coa" />
                </div>
              ) : (
                <QImage idKey={round.uid} {...heroProps(round.prompt.src, "photo", quality)} alt={round.prompt.alt} variant="photo" />
              )}
            </div>
          </>
        ) : round.prompt.kind === "map" ? (
          <>
            <div className="flex h-[3.5rem] shrink-0 items-center justify-center px-5 pb-2 pt-1">
              <p className="line-clamp-2 text-center text-base font-semibold leading-snug sm:text-lg">{round.prompt.text}</p>
            </div>
            <div className="relative flex-1 pb-2">
              <NorwayMap region={round.prompt.region} pin={round.prompt.pin} />
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-6 py-6">
            <h1 className="line-clamp-5 text-balance text-center font-display text-2xl font-bold leading-tight tracking-tight sm:text-[30px]">
              {round.prompt.text}
            </h1>
          </div>
        )}
      </div>

      {mode === "skriv" ? (
        <WriteAnswer round={round} answered={answered} onWrite={onWrite} />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {round.choices.map((choice, i) => {
            const isAnswer = i === round.answerIndex;
            const isPicked = i === picked;
            let cls = "border-[var(--field-stroke)] bg-[var(--field)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]";
            if (answered) {
              if (isAnswer) cls = "border-transparent bg-[var(--good)]/12 text-[var(--good)] ring-1 ring-[var(--good)]/40";
              else if (isPicked) cls = "border-transparent bg-[var(--bad)]/10 text-[var(--bad)] ring-1 ring-[var(--bad)]/40";
              else cls = "border-[var(--field-stroke)] opacity-50";
            }
            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => onChoose(i)}
                className={`group flex min-h-[3.5rem] items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition duration-150 focus-ring ${cls}`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums ${
                    answered && isAnswer ? "bg-[var(--good)] text-white" : answered && isPicked ? "bg-[var(--bad)] text-white" : "bg-black/[0.06] text-ink-muted dark:bg-white/10"
                  }`}
                >
                  {answered && isAnswer ? <Check size={14} /> : answered && isPicked ? <X size={14} /> : i + 1}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 font-medium leading-snug">{choice}</span>
                {answered && round.choiceInfo?.[i] && (
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">{round.choiceInfo[i]}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WriteAnswer({ round, answered, onWrite }: { round: Round; answered: boolean; onWrite: (s: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue("");
    ref.current?.focus();
  }, [round.uid]);

  const submit = () => {
    if (!answered && value.trim()) onWrite(value.trim());
  };

  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        value={value}
        disabled={answered}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Skriv svaret…"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        className="min-h-[3.5rem] flex-1 rounded-2xl border border-[var(--field-stroke)] bg-[var(--field)] px-4 text-base font-medium outline-none placeholder:text-ink-muted focus:border-[var(--nordic)]"
      />
      <button
        onClick={submit}
        disabled={answered || !value.trim()}
        className="min-h-[3.5rem] shrink-0 rounded-2xl bg-ink px-5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring disabled:opacity-40"
      >
        Svar
      </button>
    </div>
  );
}

// ---- Sortér board ---------------------------------------------------------
function reorder(arr: string[], from: number, to: number): string[] {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

function OrderBoard({
  round,
  phase,
  submitted,
  onCheck,
}: {
  round: OrderRound;
  phase: "idle" | "answered";
  submitted: string[] | null;
  onCheck: (ids: string[]) => void;
}) {
  const [order, setOrder] = useState<string[]>(round.items.map((i) => i.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dy, setDy] = useState(0);
  const [overIndex, setOverIndex] = useState(0);
  const [rowH, setRowH] = useState(64);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setOrder(round.items.map((i) => i.id));
    setDragId(null);
    setDy(0);
  }, [round.uid]);

  const answered = phase === "answered";
  const byId = useMemo(() => Object.fromEntries(round.items.map((i) => [i.id, i])), [round]);
  const level = diffLevel(round.difficulty);

  const move = (idx: number, dir: -1 | 1) => {
    if (answered) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    setOrder(reorder(order, idx, ni));
  };

  // Pointer drag-and-drop (mouse + touch). Window listeners + a movement
  // threshold avoid setPointerCapture eating the chevron clicks (BLUEPRINT §11).
  const startDrag = (e: React.PointerEvent, index: number) => {
    if (answered) return;
    const r0 = rowRefs.current[0]?.getBoundingClientRect();
    const r1 = rowRefs.current[1]?.getBoundingClientRect();
    const h = r0 && r1 ? Math.abs(r1.top - r0.top) : 64;
    const from = index;
    const startY = e.clientY;
    const cur = order;
    let active = false;
    let over = from;
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY;
      if (!active) {
        if (Math.abs(delta) < 5) return;
        active = true;
        setRowH(h);
        setDragId(cur[from]);
      }
      over = Math.max(0, Math.min(cur.length - 1, from + Math.round(delta / h)));
      setDy(delta);
      setOverIndex(over);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (active) setOrder(reorder(cur, from, over));
      setDragId(null);
      setDy(0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const fromIdx = dragId ? order.indexOf(dragId) : -1;
  const visualOrder = dragId ? reorder(order, fromIdx, overIndex) : order;
  const rows = answered && submitted ? submitted : order;

  return (
    <div className="animate-pop flex flex-col gap-3">
      <div className="glass-strong flex min-h-[88px] flex-col justify-center rounded-[28px] px-6 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Sortér</span>
          <span className="flex items-center gap-1">
            {[1, 2, 3].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i <= level ? "var(--nordic)" : "var(--hairline)" }} />
            ))}
          </span>
        </div>
        <h1 className="mt-1 text-balance font-display text-xl font-bold leading-tight tracking-tight sm:text-2xl">{round.prompt}</h1>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((id, pos) => {
          const item = byId[id];
          const dragging = id === dragId;
          // Live position number + transform while dragging.
          const number = answered ? pos + 1 : visualOrder.indexOf(id) + 1;
          let translate = 0;
          if (!answered && dragId) {
            if (dragging) translate = dy;
            else if (overIndex > fromIdx && pos > fromIdx && pos <= overIndex) translate = -rowH;
            else if (overIndex < fromIdx && pos >= overIndex && pos < fromIdx) translate = rowH;
          }
          let cls = "border-[var(--field-stroke)] bg-[var(--field)]";
          if (answered) cls = round.correctIds[pos] === id ? "border-transparent bg-[var(--good)]/12 ring-1 ring-[var(--good)]/40" : "border-transparent bg-[var(--bad)]/10 ring-1 ring-[var(--bad)]/40";
          else if (dragging) cls = "border-transparent bg-[var(--glass-bg-strong)] shadow-lg ring-1 ring-[var(--nordic)]/40";
          return (
            <div
              key={id}
              ref={(el) => {
                if (!answered) rowRefs.current[pos] = el;
              }}
              onPointerDown={(e) => startDrag(e, pos)}
              className={`relative flex h-14 items-center gap-2 rounded-2xl border px-2.5 ${cls}`}
              style={{
                transform: translate ? `translateY(${translate}px)` : undefined,
                transition: dragging ? "none" : "transform .18s ease",
                zIndex: dragging ? 20 : undefined,
                touchAction: answered ? undefined : "none",
                cursor: answered ? undefined : dragging ? "grabbing" : "grab",
              }}
            >
              {!answered && <GripVertical size={16} className="shrink-0 text-ink-muted/60" />}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/[0.06] text-xs font-bold tabular-nums text-ink-muted dark:bg-white/10">
                {number}
              </span>
              <span className="flex-1 truncate font-medium">{item?.name}</span>
              {answered ? (
                <span className="shrink-0 pr-1 text-xs tabular-nums text-ink-muted">{fmtVal(item.value, round.unit)}</span>
              ) : (
                <span className="flex shrink-0 flex-col" onPointerDown={(e) => e.stopPropagation()}>
                  <button onClick={() => move(pos, -1)} disabled={pos === 0} className="grid h-5 w-7 place-items-center rounded text-ink-muted transition hover:text-ink disabled:opacity-25 focus-ring" aria-label="Flytt opp">
                    <ChevronUp size={16} />
                  </button>
                  <button onClick={() => move(pos, 1)} disabled={pos === rows.length - 1} className="grid h-5 w-7 place-items-center rounded text-ink-muted transition hover:text-ink disabled:opacity-25 focus-ring" aria-label="Flytt ned">
                    <ChevronDown size={16} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!answered && (
        <button onClick={() => onCheck(order)} className="rounded-2xl bg-ink py-3 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring">
          Sjekk rekkefølgen
        </button>
      )}
    </div>
  );
}

// ---- Reveal bar -----------------------------------------------------------
function RevealBar({
  round,
  won,
  skipped,
  delta,
  typed,
  onNext,
}: {
  round: AnyRound;
  won: boolean;
  skipped: boolean;
  delta: number | null;
  typed: string | null;
  onNext: () => void;
}) {
  const order = isOrder(round);
  // Show the subject's photo on reveal unless the prompt already was that photo.
  const promptIsPhoto = !order && round.prompt.kind === "image" && round.prompt.variant === "photo";
  const thumb = !order && !promptIsPhoto ? round.subject.photo : undefined;

  let detail: React.ReactNode;
  if (order) {
    const names = round.correctIds.map((id) => round.items.find((it) => it.id === id)?.name).join(" › ");
    detail = (
      <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
        <span className="font-semibold">Riktig:</span> {names}
      </p>
    );
  } else if (skipped || (typed != null && !won)) {
    detail = (
      <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
        Riktig svar: <span className="font-semibold">{round.answerKey}</span>. {round.explanation}
      </p>
    );
  } else {
    detail = <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{round.explanation}</p>;
  }

  return (
    <div className="animate-fade-up glass flex h-full items-center gap-3 rounded-[24px] p-3">
      {thumb && (
        <div className="hidden h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl bg-black/[0.04] sm:block dark:bg-white/[0.05]">
          <img src={imgAt(thumb, 200)} alt="" className="h-full w-full object-contain" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 text-sm font-bold"
            style={{ color: skipped ? "var(--amber)" : won ? "var(--good)" : "var(--bad)" }}
          >
            {skipped ? <MinusCircle size={16} /> : won ? <Check size={16} /> : <X size={16} />}
            {skipped ? "Hoppet over" : won ? "Riktig" : "Feil"}
          </span>
          {delta != null && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
              style={{
                color: delta >= 0 ? "var(--good)" : "var(--bad)",
                background: delta >= 0 ? "color-mix(in srgb, var(--good) 12%, transparent)" : "color-mix(in srgb, var(--bad) 12%, transparent)",
              }}
            >
              {delta >= 0 ? `+${delta}` : delta} Elo
            </span>
          )}
        </div>
        {detail}
      </div>
      <button onClick={onNext} className="flex shrink-0 items-center gap-1.5 self-center rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring">
        Neste
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
