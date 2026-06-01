"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { Check, X, ArrowRight, Flame, Settings, Layers, ChevronRight } from "lucide-react";
import { Round, nextRound, activeGenerators, Category, CATEGORIES } from "@/lib/questions";
import { Place, fmtMetric, fmtInt } from "@/lib/data";
import { EloState, tierFor } from "@/lib/elo";
import { imgAt, photoSrcSet, coaSrcSet, PHOTO_SIZES, COA_SIZES, preloadImage } from "@/lib/images";
import QImage from "./QImage";
import EloBadge from "./EloBadge";
import Wordmark from "./Wordmark";

interface State {
  round: Round | null;
  queue: Round[];
  picked: number | null;
  phase: "idle" | "answered";
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
  | { type: "init"; rounds: Round[] }
  | { type: "answer"; index: number; won: boolean; delta: number }
  | { type: "next"; newRound: Round };

const initial: State = {
  round: null,
  queue: [],
  picked: null,
  phase: "idle",
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
        delta: null,
        recentSubjects: action.rounds.map((r) => r.subject.id),
        recentAnswers: action.rounds.map((r) => r.answerKey),
        lastGen: action.rounds.at(-1)?.genKey ?? null,
      };
    case "answer": {
      const streak = action.won ? state.streak + 1 : 0;
      return {
        ...state,
        phase: "answered",
        picked: action.index,
        delta: action.delta,
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
        delta: null,
        recentSubjects: [...state.recentSubjects, round.subject.id].slice(-30),
        recentAnswers: [...state.recentAnswers, round.answerKey].slice(-14),
        lastGen: round.genKey,
      };
    }
  }
}

function buildInitial(gens: ReturnType<typeof activeGenerators>): Round[] {
  const recentSubjects: string[] = [];
  const recentAnswers: string[] = [];
  let lastGen: string | null = null;
  const rounds: Round[] = [];
  for (let i = 0; i < 3; i++) {
    const r = nextRound(gens, { recentSubjects: new Set(recentSubjects), recentAnswers, lastGen });
    rounds.push(r);
    recentSubjects.push(r.subject.id);
    recentAnswers.push(r.answerKey);
    lastGen = r.genKey;
  }
  return rounds;
}

const diffLevel = (d: number) => (d < 950 ? 1 : d < 1320 ? 2 : 3);

export default function Quiz({
  selected,
  elo,
  onResult,
  onOpenPicker,
  onOpenElo,
  onOpenSettings,
  autoAdvance,
}: {
  selected: Set<Category>;
  elo: EloState;
  onResult: (won: boolean, difficulty: number, cat: Category) => number;
  onOpenPicker: () => void;
  onOpenElo: () => void;
  onOpenSettings: () => void;
  autoAdvance: number;
}) {
  const gens = useMemo(() => activeGenerators(selected), [selected]);
  const [state, dispatch] = useReducer(reducer, initial);

  // (Re)build the round stream when the selected categories change.
  useEffect(() => {
    dispatch({ type: "init", rounds: buildInitial(gens) });
  }, [gens]);

  const handleNext = useCallback(() => {
    const r = nextRound(gens, {
      recentSubjects: new Set(state.recentSubjects),
      recentAnswers: state.recentAnswers,
      lastGen: state.lastGen,
    });
    dispatch({ type: "next", newRound: r });
  }, [gens, state.recentSubjects, state.recentAnswers, state.lastGen]);

  const handleAnswer = useCallback(
    (i: number) => {
      if (state.phase !== "idle" || !state.round) return;
      const won = i === state.round.answerIndex;
      const delta = onResult(won, state.round.difficulty, state.round.cat);
      dispatch({ type: "answer", index: i, won, delta });
    },
    [state.phase, state.round, onResult],
  );

  // Keyboard: 1–4 to answer, Enter/Space/→ to advance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (/INPUT|TEXTAREA/.test(tag)) return;
      if (state.phase === "idle") {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 4) handleAnswer(n - 1);
      } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, handleAnswer, handleNext]);

  // Optional auto-advance.
  useEffect(() => {
    if (state.phase === "answered" && autoAdvance > 0) {
      const t = setTimeout(handleNext, autoAdvance);
      return () => clearTimeout(t);
    }
  }, [state.phase, autoAdvance, handleNext]);

  // Preload upcoming images (prompt + reveal photo), matching displayed variants.
  useEffect(() => {
    for (const r of state.queue) {
      if (r.prompt.kind === "image") {
        const ss = r.prompt.variant === "photo" ? photoSrcSet(r.prompt.src) : coaSrcSet(r.prompt.src);
        const sizes = r.prompt.variant === "photo" ? PHOTO_SIZES : COA_SIZES;
        preloadImage(imgAt(r.prompt.src, 720), ss, sizes);
      }
      if (r.subject.photo) preloadImage(imgAt(r.subject.photo, 540), photoSrcSet(r.subject.photo), PHOTO_SIZES);
    }
  }, [state.queue]);

  const tier = tierFor(elo.rating);
  const catLabel = useMemo(() => {
    if (selected.size === 0 || selected.size === CATEGORIES.length) return "Alt";
    if (selected.size === 1) return CATEGORIES.find((c) => selected.has(c.key))?.label ?? "Alt";
    return `${selected.size} kategorier`;
  }, [selected]);

  const round = state.round;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pb-10 pt-3 sm:px-5">
      {/* Header */}
      <header className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar -my-1 py-1">
          <Wordmark />
          <button onClick={onOpenPicker} className="pill-glass shrink-0 focus-ring" aria-label="Velg kategorier">
            <Layers size={14} />
            <span className="max-w-[9rem] truncate">{catLabel}</span>
            <ChevronRight size={13} className="text-ink-muted" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="pill-glass tabular-nums" title="Rekke / beste rekke">
            <Flame size={14} className={state.streak > 0 ? "text-amber-500" : "text-ink-muted"} />
            <span className="font-semibold">{state.streak}</span>
          </div>
          <EloBadge elo={elo} onOpen={onOpenElo} />
          <button
            onClick={onOpenSettings}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full glass text-ink-muted transition hover:text-ink focus-ring"
            aria-label="Innstillinger"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Tier progress */}
      <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-ink-muted">
        <span className="shrink-0">{tier.name}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.round(tier.progress * 100)}%`, background: "var(--nordic)" }}
          />
        </div>
        <span className="shrink-0">{tier.next ?? "Maks"}</span>
      </div>

      {round && <QuestionCard key={round.uid} round={round} state={state} onAnswer={handleAnswer} />}

      {/* Reveal / status strip — fixed height so layout never jumps. */}
      <div className="h-[104px]">
        {state.phase === "answered" && round ? (
          <Reveal round={round} won={state.picked === round.answerIndex} delta={state.delta} onNext={handleNext} />
        ) : (
          <div className="animate-fade-in flex h-full items-center justify-center gap-2 text-sm text-ink-muted">
            <span>
              Spørsmål {state.total + 1} · velg et svar
            </span>
            <kbd className="rounded-md border border-[var(--field-stroke)] px-1.5 py-0.5 text-[11px]">1–4</kbd>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  round,
  state,
  onAnswer,
}: {
  round: Round;
  state: State;
  onAnswer: (i: number) => void;
}) {
  const answered = state.phase === "answered";
  const level = diffLevel(round.difficulty);
  const catLabel = CATEGORIES.find((c) => c.key === round.cat)?.label ?? "";

  return (
    <div className="animate-pop flex flex-col gap-3">
      {/* Prompt card — fixed height so every question has the same footprint. */}
      <div className="glass-strong flex h-[320px] flex-col overflow-hidden rounded-[28px] sm:h-[360px]">
        <div className="flex shrink-0 items-center justify-between px-5 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{catLabel}</span>
          <span className="flex items-center gap-1" aria-label={`Vanskelighet ${level} av 3`}>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: i <= level ? "var(--nordic)" : "var(--hairline)" }}
              />
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
                  <QImage
                    idKey={round.uid}
                    src={round.prompt.src}
                    srcSet={coaSrcSet(round.prompt.src)}
                    sizes={COA_SIZES}
                    alt={round.prompt.alt}
                    variant="coa"
                  />
                </div>
              ) : (
                <QImage
                  idKey={round.uid}
                  src={round.prompt.src}
                  srcSet={photoSrcSet(round.prompt.src)}
                  sizes={PHOTO_SIZES}
                  alt={round.prompt.alt}
                  variant="photo"
                />
              )}
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

      {/* Answers */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {round.choices.map((choice, i) => {
          const isAnswer = i === round.answerIndex;
          const isPicked = i === state.picked;
          let cls =
            "border-[var(--field-stroke)] bg-[var(--field)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]";
          if (answered) {
            if (isAnswer) cls = "border-transparent bg-[var(--good)]/12 text-[var(--good)] ring-1 ring-[var(--good)]/40";
            else if (isPicked) cls = "border-transparent bg-[var(--bad)]/10 text-[var(--bad)] ring-1 ring-[var(--bad)]/40";
            else cls = "border-[var(--field-stroke)] opacity-50";
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => onAnswer(i)}
              className={`group flex min-h-[3.5rem] items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition duration-150 focus-ring ${cls}`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums ${
                  answered && isAnswer
                    ? "bg-[var(--good)] text-white"
                    : answered && isPicked
                      ? "bg-[var(--bad)] text-white"
                      : "bg-black/[0.06] text-ink-muted dark:bg-white/10"
                }`}
              >
                {answered && isAnswer ? <Check size={14} /> : answered && isPicked ? <X size={14} /> : i + 1}
              </span>
              <span className="line-clamp-2 flex-1 font-medium leading-snug">{choice}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Reveal({
  round,
  won,
  delta,
  onNext,
}: {
  round: Round;
  won: boolean;
  delta: number | null;
  onNext: () => void;
}) {
  const subject = round.subject;
  const showPhoto = round.prompt.kind === "text" || round.prompt.variant === "coa";
  return (
    <div className="animate-fade-up glass flex h-full items-center gap-3 rounded-[24px] p-3">
      {showPhoto && subject.photo && (
        <div className="hidden h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl sm:block">
          <img src={imgAt(subject.photo, 200)} alt={subject.name} className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 text-sm font-bold"
            style={{ color: won ? "var(--good)" : "var(--bad)" }}
          >
            {won ? <Check size={16} /> : <X size={16} />}
            {won ? "Riktig" : "Feil"}
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
        <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{round.explanation}</p>
      </div>
      <button
        onClick={onNext}
        className="flex shrink-0 items-center gap-1.5 self-center rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring"
      >
        Neste
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
