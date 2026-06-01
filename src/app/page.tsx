"use client";

import { useCallback, useEffect, useState } from "react";
import Quiz from "@/components/Quiz";
import Lists from "@/components/Lists";
import Explore from "@/components/Explore";
import CustomizeSheet from "@/components/CustomizeSheet";
import { Mode } from "@/components/ModePicker";
import EloPanel from "@/components/EloPanel";
import SettingsSheet from "@/components/SettingsSheet";
import Celebration from "@/components/Celebration";
import RankToast from "@/components/RankToast";
import { Category, CATEGORIES, QuizType, QUIZ_TYPES } from "@/lib/questions";
import { EloState, loadElo, saveElo, applyResult, tierFor } from "@/lib/elo";
import { Quality } from "@/lib/images";

const CATS_KEY = "norgequiz.cats.v1";
const TYPES_KEY = "norgequiz.types.v1";
const AUTO_KEY = "norgequiz.autoadvance.v1";
const THEME_KEY = "norgequiz.theme";
const QUALITY_KEY = "norgequiz.quality.v1";
const MODE_KEY = "norgequiz.mode.v1";
const EXPLORE_KEY = "norgequiz.explore.v1";
const VALID = new Set(CATEGORIES.map((c) => c.key));
const VALID_TYPES = new Set(QUIZ_TYPES.map((t) => t.key));
const MODES = new Set<Mode>(["velg", "sorter", "skriv", "lister"]);

export default function Home() {
  const [elo, setElo] = useState<EloState>(() => ({
    rating: 800,
    peak: 800,
    low: 800,
    games: 0,
    wins: 0,
    history: [800],
    perCat: {},
    updatedAt: 0,
  }));
  const [selected, setSelected] = useState<Set<Category>>(new Set());
  const [types, setTypes] = useState<Set<QuizType>>(new Set());
  const [mode, setMode] = useState<Mode>("velg");
  const [explore, setExplore] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(0);
  const [quality, setQuality] = useState<Quality>("hd");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [eloOpen, setEloOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<{ title: string; sub: string } | null>(null);
  const [rankToast, setRankToast] = useState<string | null>(null);

  // Hydrate device-local state after mount (SSR-safe).
  useEffect(() => {
    setElo(loadElo());
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    try {
      const urlCats = new URLSearchParams(window.location.search).get("cat");
      const cats = urlCats ? urlCats.split(",") : JSON.parse(localStorage.getItem(CATS_KEY) || "[]");
      if (Array.isArray(cats)) setSelected(new Set(cats.filter((c: string) => VALID.has(c as Category))));
      const urlTypes = new URLSearchParams(window.location.search).get("type");
      const tps = urlTypes ? urlTypes.split(",") : JSON.parse(localStorage.getItem(TYPES_KEY) || "[]");
      if (Array.isArray(tps)) setTypes(new Set(tps.filter((t: string) => VALID_TYPES.has(t as QuizType))));
      const auto = Number(localStorage.getItem(AUTO_KEY));
      if ([0, 1000, 3000, 5000].includes(auto)) setAutoAdvance(auto);
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get("mode") as Mode | null;
      const m = urlMode && MODES.has(urlMode) ? urlMode : (localStorage.getItem(MODE_KEY) as Mode | null);
      if (m && MODES.has(m)) setMode(m);
      // Utforsk is a separate view, toggled from the header (not a game mode).
      const wantExplore =
        params.get("view") === "utforsk" || params.get("mode") === "utforsk" || localStorage.getItem(EXPLORE_KEY) === "1";
      if (wantExplore) setExplore(true);
      if (params.get("sheet") === "1") setCustomizeOpen(true); // dev: open Tilpass on load
      const q = localStorage.getItem(QUALITY_KEY);
      if (q === "hd" || q === "lett") setQuality(q);
      else {
        // No explicit choice: default to "lett" on slow/data-saver connections.
        const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        if (c && (c.saveData || ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? ""))) setQuality("lett");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleResult = useCallback(
    (won: boolean, difficulty: number, cat: Category): number => {
      // Reaching a new all-time-best rank shows a small, non-blocking toast.
      const prevPeakTier = tierFor(elo.peak).index;
      const { state, delta } = applyResult(elo, won, difficulty, cat);
      const newTier = tierFor(state.rating);
      if (newTier.index > prevPeakTier) setRankToast(newTier.name);
      setElo(state);
      saveElo(state);
      return delta;
    },
    [elo],
  );

  // The big celebration is reserved for completing a perfect 10-in-a-row streak.
  const handlePerfect = useCallback(() => {
    setCelebrate({ title: "10 på rad!", sub: "Perfekt rekke" });
  }, []);

  const changeCats = (next: Set<Category>) => {
    setSelected(next);
    try {
      localStorage.setItem(CATS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const changeTypes = (next: Set<QuizType>) => {
    setTypes(next);
    try {
      localStorage.setItem(TYPES_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const setExploreP = (v: boolean) => {
    setExplore(v);
    try {
      localStorage.setItem(EXPLORE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    setExploreP(false); // picking a game mode leaves Utforsk
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const toggleExplore = () => setExploreP(!explore);

  const changeAuto = (ms: number) => {
    setAutoAdvance(ms);
    try {
      localStorage.setItem(AUTO_KEY, String(ms));
    } catch {
      /* ignore */
    }
  };

  const changeQuality = (q: Quality) => {
    setQuality(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* ignore */
    }
  };

  const changeTheme = (t: "light" | "dark") => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
    setTheme(t);
  };

  const resetElo = () => {
    const fresh = loadElo();
    const blank: EloState = {
      rating: 800,
      peak: 800,
      low: 800,
      games: 0,
      wins: 0,
      history: [800],
      perCat: {},
      updatedAt: Date.now(),
    };
    void fresh;
    setElo(blank);
    saveElo(blank);
    setSettingsOpen(false);
  };

  return (
    <main className="relative min-h-dvh">
      {explore ? (
        <Explore
          exploreActive
          onExplore={toggleExplore}
          elo={elo}
          onOpenElo={() => setEloOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : mode === "lister" ? (
        <Lists
          mode={mode}
          onOpenMode={() => setCustomizeOpen(true)}
          exploreActive={false}
          onExplore={toggleExplore}
          elo={elo}
          onOpenElo={() => setEloOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <Quiz
          mode={mode}
          selected={selected}
          types={types}
          elo={elo}
          onResult={handleResult}
          onPerfectStreak={handlePerfect}
          onCustomize={() => setCustomizeOpen(true)}
          exploreActive={false}
          onExplore={toggleExplore}
          onOpenElo={() => setEloOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          autoAdvance={autoAdvance}
          quality={quality}
        />
      )}

      <footer className="px-5 pb-8 text-center text-[11px] text-ink-muted">
        Data fra Wikidata & SSB · 4 spillemoduser + Utforsk · bygd for å bli best i norsk geografi
      </footer>

      {customizeOpen && (
        <CustomizeSheet
          mode={mode}
          onMode={changeMode}
          selected={selected}
          onCats={changeCats}
          types={types}
          onTypes={changeTypes}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
      {eloOpen && <EloPanel elo={elo} onClose={() => setEloOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet
          autoAdvance={autoAdvance}
          onAutoAdvance={changeAuto}
          quality={quality}
          onQuality={changeQuality}
          theme={theme}
          onTheme={changeTheme}
          onResetElo={resetElo}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {celebrate && <Celebration title={celebrate.title} sub={celebrate.sub} onDone={() => setCelebrate(null)} />}
      {rankToast && <RankToast name={rankToast} onDone={() => setRankToast(null)} />}
    </main>
  );
}
