"use client";

import { useCallback, useEffect, useState } from "react";
import Quiz from "@/components/Quiz";
import CategoryPicker from "@/components/CategoryPicker";
import EloPanel from "@/components/EloPanel";
import SettingsSheet from "@/components/SettingsSheet";
import Celebration from "@/components/Celebration";
import { Category, CATEGORIES } from "@/lib/questions";
import { EloState, loadElo, saveElo, applyResult, tierFor } from "@/lib/elo";

const CATS_KEY = "norgequiz.cats.v1";
const AUTO_KEY = "norgequiz.autoadvance.v1";
const THEME_KEY = "norgequiz.theme";
const VALID = new Set(CATEGORIES.map((c) => c.key));

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
  const [autoAdvance, setAutoAdvance] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [eloOpen, setEloOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  // Hydrate device-local state after mount (SSR-safe).
  useEffect(() => {
    setElo(loadElo());
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    try {
      const cats = JSON.parse(localStorage.getItem(CATS_KEY) || "[]");
      if (Array.isArray(cats)) setSelected(new Set(cats.filter((c: string) => VALID.has(c as Category))));
      const auto = Number(localStorage.getItem(AUTO_KEY));
      if ([0, 1000, 3000, 5000].includes(auto)) setAutoAdvance(auto);
    } catch {
      /* ignore */
    }
  }, []);

  const handleResult = useCallback(
    (won: boolean, difficulty: number, cat: Category): number => {
      const prevTier = tierFor(elo.rating).index;
      const { state, delta } = applyResult(elo, won, difficulty, cat);
      const newTier = tierFor(state.rating);
      if (newTier.index > prevTier) setCelebrate(newTier.name);
      setElo(state);
      saveElo(state);
      return delta;
    },
    [elo],
  );

  const changeCats = (next: Set<Category>) => {
    setSelected(next);
    try {
      localStorage.setItem(CATS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const changeAuto = (ms: number) => {
    setAutoAdvance(ms);
    try {
      localStorage.setItem(AUTO_KEY, String(ms));
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
      <Quiz
        selected={selected}
        elo={elo}
        onResult={handleResult}
        onOpenPicker={() => setPickerOpen(true)}
        onOpenElo={() => setEloOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        autoAdvance={autoAdvance}
      />

      <footer className="px-5 pb-8 text-center text-[11px] text-ink-muted">
        Data fra Wikidata & SSB · {CATEGORIES.length} kategorier · bygd for å bli best i norsk geografi
      </footer>

      {pickerOpen && <CategoryPicker selected={selected} onChange={changeCats} onClose={() => setPickerOpen(false)} />}
      {eloOpen && <EloPanel elo={elo} onClose={() => setEloOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet
          autoAdvance={autoAdvance}
          onAutoAdvance={changeAuto}
          theme={theme}
          onTheme={changeTheme}
          onResetElo={resetElo}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {celebrate && <Celebration tierName={celebrate} onDone={() => setCelebrate(null)} />}
    </main>
  );
}
