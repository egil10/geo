"use client";

import { useCallback, useEffect, useState } from "react";
import Quiz from "@/components/Quiz";
import CategoryPicker from "@/components/CategoryPicker";
import EloPanel from "@/components/EloPanel";
import SettingsSheet from "@/components/SettingsSheet";
import Celebration from "@/components/Celebration";
import { Category, CATEGORIES } from "@/lib/questions";
import { EloState, loadElo, saveElo, applyResult, tierFor } from "@/lib/elo";
import { Quality } from "@/lib/images";

const CATS_KEY = "norgequiz.cats.v1";
const AUTO_KEY = "norgequiz.autoadvance.v1";
const THEME_KEY = "norgequiz.theme";
const QUALITY_KEY = "norgequiz.quality.v1";
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
  const [quality, setQuality] = useState<Quality>("hd");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [eloOpen, setEloOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<{ title: string; sub: string } | null>(null);

  // Hydrate device-local state after mount (SSR-safe).
  useEffect(() => {
    setElo(loadElo());
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    try {
      const cats = JSON.parse(localStorage.getItem(CATS_KEY) || "[]");
      if (Array.isArray(cats)) setSelected(new Set(cats.filter((c: string) => VALID.has(c as Category))));
      const auto = Number(localStorage.getItem(AUTO_KEY));
      if ([0, 1000, 3000, 5000].includes(auto)) setAutoAdvance(auto);
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
      const prevTier = tierFor(elo.rating).index;
      const { state, delta } = applyResult(elo, won, difficulty, cat);
      const newTier = tierFor(state.rating);
      if (newTier.index > prevTier) setCelebrate({ title: newTier.name, sub: "Ny rang" });
      setElo(state);
      saveElo(state);
      return delta;
    },
    [elo],
  );

  // Fired by the quiz when the streak hits a perfect 10 (takes celebration
  // precedence over a tier-up on the same answer).
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
      <Quiz
        selected={selected}
        elo={elo}
        onResult={handleResult}
        onPerfectStreak={handlePerfect}
        onOpenPicker={() => setPickerOpen(true)}
        onOpenElo={() => setEloOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        autoAdvance={autoAdvance}
        quality={quality}
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
          quality={quality}
          onQuality={changeQuality}
          theme={theme}
          onTheme={changeTheme}
          onResetElo={resetElo}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {celebrate && <Celebration title={celebrate.title} sub={celebrate.sub} onDone={() => setCelebrate(null)} />}
    </main>
  );
}
