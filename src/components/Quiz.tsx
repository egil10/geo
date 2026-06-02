"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Check, X, ArrowRight, Flame, ChevronUp, ChevronDown, GripVertical, SkipForward, MinusCircle, SearchX, ExternalLink } from "lucide-react";
import {
  Round,
  OrderRound,
  nextRound,
  nextOrderRound,
  activeGenerators,
  Category,
  CATEGORIES,
  QuizType,
  QUIZ_TYPES,
} from "@/lib/questions";
import { EloState } from "@/lib/elo";
import { imgAt, heroProps, preloadImage, Quality } from "@/lib/images";
import { matchesAnswer } from "@/lib/match";
import { fylkePathByNumber, kommunePathByNumber, projectPin, onMainland } from "@/lib/geo";
import { onSvalbard, projectSvalbard } from "@/lib/svalbard";
import QImage from "./QImage";
import NorwayMap from "./NorwayMap";
import TopBar from "./TopBar";
import { Mode, modeLabel } from "./ModePicker";

// A Wikipedia link for the answer. Wikidata Q-ids resolve straight to the
// Norwegian article via GoToLinkedPage; anything else falls back to title.
function wikiHref(id: string, name: string): string {
  if (/^Q\d+$/.test(id)) return `https://www.wikidata.org/wiki/Special:GoToLinkedPage/nowiki/${id}`;
  return `https://no.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`;
}

// Locate a place on the Norway map: highlight a fylke/kommune by its number,
// otherwise drop a pin at its coordinates. Returns nothing if not locatable.
function locate(subject: { number?: string; lat?: number; lon?: number }): { region?: string; pin?: { x: number; y: number }; svalbard?: { x: number; y: number } } | null {
  if (subject.number && fylkePathByNumber.has(subject.number)) return { region: fylkePathByNumber.get(subject.number) };
  if (subject.number && kommunePathByNumber.has(subject.number)) return { region: kommunePathByNumber.get(subject.number) };
  if (subject.lat != null && subject.lon != null) {
    if (onMainland(subject.lat, subject.lon)) return { pin: projectPin(subject.lat, subject.lon) };
    if (onSvalbard(subject.lat, subject.lon)) return { svalbard: projectSvalbard(subject.lat, subject.lon) };
  }
  return null;
}

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
  const forceGen = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("gen") : null;
  return mode === "sorter" ? nextOrderRound(selected) : nextRound(gens, { ...ctx, forceGen });
}

function buildInitial(mode: Mode, gens: ReturnType<typeof activeGenerators>, selected: Set<Category>): AnyRound[] {
  if (mode !== "sorter" && !gens.length) return []; // filters exclude everything → empty state
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

// A worded difficulty badge — clearer than the old abstract dots.
function DifficultyTag({ level }: { level: number }) {
  const label = level >= 3 ? "Vanskelig" : level === 2 ? "Middels" : "Lett";
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--nordic)" }}
      aria-label={`Vanskelighet: ${label}`}
    >
      {label}
    </span>
  );
}

export default function Quiz({
  mode,
  selected,
  types,
  elo,
  onResult,
  onPerfectStreak,
  onCustomize,
  exploreActive,
  onExplore,
  onOpenElo,
  onOpenSettings,
  autoAdvance,
  quality,
}: {
  mode: Mode;
  selected: Set<Category>;
  types: Set<QuizType>;
  elo: EloState;
  onResult: (won: boolean, difficulty: number, cat: Category) => number;
  onPerfectStreak: () => void;
  onCustomize: () => void;
  exploreActive: boolean;
  onExplore: () => void;
  onOpenElo: () => void;
  onOpenSettings: () => void;
  autoAdvance: number;
  quality: Quality;
}) {
  const gens = useMemo(() => activeGenerators(selected, types, mode === "skriv"), [selected, types, mode]);
  // The quiz-type filter only applies to the option/typing modes (Sortér builds
  // its own rounds); an empty result there means the filters exclude everything.
  const genMode = mode === "velg" || mode === "skriv";
  const noGens = genMode && gens.length === 0;
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

  // Dev hook: ?reveal=1 auto-answers the round so the feedback card shows on a
  // plain load (screenshot verification). Deferred so it fires on the *settled*
  // round — async hydration re-inits the queue a couple times on mount.
  const autoRevealed = useRef(false);
  useEffect(() => {
    if (autoRevealed.current || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("reveal") !== "1") return;
    if (state.phase !== "idle" || !state.round || isOrder(state.round)) return;
    const r = state.round;
    const t = setTimeout(() => {
      autoRevealed.current = true;
      answerChoose(r.answerIndex);
    }, 350);
    return () => clearTimeout(t);
  }, [state.phase, state.round, answerChoose]);

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

  const typeLabel = useMemo(() => {
    if (types.size === 0 || types.size === QUIZ_TYPES.length) return "Alle typer";
    if (types.size === 1) return QUIZ_TYPES.find((t) => types.has(t.key))?.label ?? "Alle typer";
    return `${types.size} typer`;
  }, [types]);

  // One pill summarises the whole setup: mode, then category/type if narrowed.
  const summary = useMemo(
    () =>
      [modeLabel(mode), catLabel !== "Alt" ? catLabel : null, genMode && typeLabel !== "Alle typer" ? typeLabel : null]
        .filter(Boolean)
        .join(" · "),
    [mode, catLabel, typeLabel, genMode],
  );

  const round = state.round;
  const answered = state.phase === "answered";

  // Verdict-or-status block: the side column in Velg/Skriv, stacked below in Sortér.
  const statusSlot = (
    <div className="h-full min-h-[104px]">
      {answered && round ? (
        <RevealBar round={round} won={!!state.won} skipped={state.skipped} delta={state.delta} typed={state.typed} onNext={handleNext} />
      ) : (
        <div className="animate-fade-in flex h-full min-h-[104px] flex-col items-center justify-center gap-2 text-sm text-ink-muted">
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
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pb-10 pt-3 sm:px-5 lg:max-w-5xl">
      <TopBar
        summary={summary}
        onCustomize={onCustomize}
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
              // Filled segments ramp from light to dark green as the streak grows.
              style={{ background: i < state.streak ? `hsl(146 68% ${62 - i * 3.4}%)` : "var(--hairline)" }}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-ink-muted">{state.streak}/10</span>
      </div>

      {noGens ? (
        <EmptyFilters onAdjust={onCustomize} />
      ) : round && isOrder(round) ? (
        // Sortér: the order board with its verdict stacked below.
        <div className="flex flex-col gap-3">
          <OrderBoard key={round.uid} round={round} phase={state.phase} submitted={state.submittedOrder} onCheck={answerOrder} />
          {statusSlot}
        </div>
      ) : round ? (
        // Velg / Skriv: prompt and feedback share the top row; choices sit below.
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
          <div className="lg:col-start-1 lg:row-start-1">
            <PromptCard key={round.uid} round={round} quality={quality} />
          </div>
          <div className="lg:col-start-1 lg:row-start-2">
            <AnswerArea round={round} mode={mode} answered={answered} picked={state.picked} onChoose={answerChoose} onWrite={answerWrite} />
          </div>
          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-stretch">{statusSlot}</div>
        </div>
      ) : null}
    </div>
  );
}

// Shown when the chosen category × question-type combination has no questions.
function EmptyFilters({ onAdjust }: { onAdjust: () => void }) {
  return (
    <div className="animate-pop glass-strong flex h-[380px] flex-col items-center justify-center gap-3 rounded-[28px] px-8 text-center sm:h-[440px]">
      <SearchX size={30} className="text-ink-muted" />
      <div>
        <p className="font-display text-lg font-bold">Ingen spørsmål her</p>
        <p className="mt-1 text-sm text-ink-soft">Denne miksen av kategori og type gir ingen spørsmål. Prøv noe annet.</p>
      </div>
      <button onClick={onAdjust} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring">
        Endre utvalg
      </button>
    </div>
  );
}

// ---- Prompt card (the question itself) ------------------------------------
function PromptCard({ round, quality }: { round: Round; quality: Quality }) {
  const level = diffLevel(round.difficulty);
  const catLabel = CATEGORIES.find((c) => c.key === round.cat)?.label ?? "";
  // One fixed size for every prompt card, regardless of category or media, with
  // enough room that contained images/maps fill it instead of looking cropped.
  const cardH = "h-[380px] sm:h-[440px]";

  return (
    <div className={`animate-pop glass-strong flex ${cardH} flex-col overflow-hidden rounded-[28px]`}>
        <div className="flex shrink-0 items-center justify-between px-5 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{catLabel}</span>
          <DifficultyTag level={level} />
        </div>

        {round.prompt.kind === "image" ? (
          <>
            <div className="flex h-[3.5rem] shrink-0 items-center justify-center px-5 pb-2 pt-1">
              <p className="line-clamp-2 text-center text-base font-semibold leading-snug sm:text-lg">{round.prompt.text}</p>
            </div>
            <div className="relative flex-1">
              {round.prompt.variant === "coa" ? (
                <div className="absolute inset-3 overflow-hidden rounded-2xl bg-white">
                  <QImage idKey={round.uid} {...heroProps(round.prompt.src, "coa", quality)} alt={round.prompt.alt} />
                </div>
              ) : (
                <QImage idKey={round.uid} {...heroProps(round.prompt.src, "photo", quality)} alt={round.prompt.alt} />
              )}
            </div>
          </>
        ) : round.prompt.kind === "map" ? (
          <>
            <div className="flex h-[3.5rem] shrink-0 items-center justify-center px-5 pb-2 pt-1">
              <p className="line-clamp-2 text-center text-base font-semibold leading-snug sm:text-lg">{round.prompt.text}</p>
            </div>
            <div className="relative flex-1 pb-2">
              <NorwayMap region={round.prompt.region} pin={round.prompt.pin} line={round.prompt.line} svalbard={round.prompt.svalbard} />
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
  );
}

// ---- Answer area (four options for Velg, a text field for Skriv) -----------
function AnswerArea({
  round,
  mode,
  answered,
  picked,
  onChoose,
  onWrite,
}: {
  round: Round;
  mode: Mode;
  answered: boolean;
  picked: number | null;
  onChoose: (i: number) => void;
  onWrite: (s: string) => void;
}) {
  if (mode === "skriv") return <WriteAnswer round={round} answered={answered} onWrite={onWrite} />;
  return (
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
                className={`group flex h-16 items-center gap-3 rounded-2xl border px-4 text-left transition duration-150 focus-ring ${cls}`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums ${
                    answered && isAnswer ? "bg-[var(--good)] text-white" : answered && isPicked ? "bg-[var(--bad)] text-white" : "bg-black/[0.06] text-ink-muted dark:bg-white/10"
                  }`}
                >
                  {answered && isAnswer ? <Check size={14} /> : answered && isPicked ? <X size={14} /> : i + 1}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 font-medium leading-snug">{choice}</span>
                {round.choiceInfo?.[i] && (
                  <span className={`shrink-0 text-[11px] tabular-nums text-ink-muted transition-opacity duration-150 ${answered ? "opacity-100" : "opacity-0"}`}>
                    {round.choiceInfo[i]}
                  </span>
                )}
              </button>
            );
          })}
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
          <DifficultyTag level={level} />
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
  const subject = order ? null : round.subject;
  // Show the subject's photo on reveal unless the prompt already was that photo.
  const promptIsPhoto = !order && round.prompt.kind === "image" && round.prompt.variant === "photo";
  const promptIsMap = !order && round.prompt.kind === "map";
  const thumb = !order && !promptIsPhoto ? round.subject.photo : undefined;
  // Skip the locator map when the question itself was a map — no point repeating it.
  const loc = subject && !promptIsMap ? locate(subject) : null;

  let detail: React.ReactNode;
  if (order) {
    const names = round.correctIds.map((id) => round.items.find((it) => it.id === id)?.name).join(" › ");
    detail = (
      <p className="text-sm leading-snug text-ink-soft">
        <span className="font-semibold">Riktig rekkefølge:</span> {names}
      </p>
    );
  } else if (skipped || (typed != null && !won)) {
    detail = (
      <p className="text-sm leading-snug text-ink-soft">
        Riktig svar: <span className="font-semibold text-ink">{round.answerKey}</span>. {round.explanation}
      </p>
    );
  } else {
    detail = <p className="text-sm leading-snug text-ink-soft">{round.explanation}</p>;
  }

  const hasMedia = !!(loc || thumb);

  return (
    <div className="animate-fade-up glass rounded-[24px] p-3 lg:flex lg:h-full lg:flex-col">
      {/* Header: verdict + Elo on the left, Neste on the right. */}
      <div className="flex items-center gap-2 lg:shrink-0">
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
        <div className="flex-1" />
        <button onClick={onNext} className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring">
          Neste
          <ArrowRight size={16} />
        </button>
      </div>

      {/* Body: a locator map and/or photo, the explanation, and a wiki link.
          On wide screens the card fills the column beside the choices, so the
          media stacks above the text and the block centres in the tall card. */}
      <div className={`flex gap-3 ${hasMedia ? "mt-3" : "mt-2"} lg:flex-1 lg:flex-col`}>
        {hasMedia && (
          <div className="flex gap-3 lg:min-h-0 lg:flex-1 lg:flex-col">
            {loc && (
              <div className="relative h-[124px] w-[100px] shrink-0 overflow-hidden rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] lg:h-auto lg:w-full lg:flex-1 lg:min-h-0">
                <NorwayMap region={loc.region} pin={loc.pin} svalbard={loc.svalbard} />
              </div>
            )}
            {thumb && (
              <div className="hidden h-[124px] w-[100px] shrink-0 overflow-hidden rounded-2xl bg-black/[0.04] sm:block dark:bg-white/[0.05] lg:h-auto lg:w-full lg:flex-1 lg:min-h-0">
                <img src={imgAt(thumb, 240)} alt="" className="h-full w-full object-contain" />
              </div>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col lg:flex-none lg:shrink-0">
          {detail}
          {subject && (
            <a
              href={wikiHref(subject.id, subject.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--field-stroke)] bg-[var(--field)] px-3 py-1.5 text-xs font-semibold text-ink/90 transition hover:text-ink hover:bg-black/[0.03] focus-ring dark:hover:bg-white/[0.05]"
            >
              <ExternalLink size={13} />
              Les mer på Wikipedia
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
