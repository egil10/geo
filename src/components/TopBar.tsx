"use client";

import { Settings, ChevronRight, Compass, Play, SlidersHorizontal } from "lucide-react";
import Wordmark from "./Wordmark";
import EloBadge from "./EloBadge";
import { EloState } from "@/lib/elo";

// A single "Tilpass" pill summarises mode · category · type and opens the full
// customization sheet — one control instead of three that did the same thing.
export default function TopBar({
  summary,
  onCustomize,
  exploreActive,
  onExplore,
  elo,
  onOpenElo,
  onOpenSettings,
}: {
  summary?: string;
  onCustomize?: () => void;
  exploreActive: boolean;
  onExplore: () => void;
  elo: EloState;
  onOpenElo: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex items-center gap-2">
      <Wordmark />
      {exploreActive ? (
        <button onClick={onExplore} className="pill-solid shrink-0 focus-ring" aria-label="Tilbake til quizen">
          <Play size={14} />
          <span>Spill</span>
        </button>
      ) : (
        summary &&
        onCustomize && (
          <button onClick={onCustomize} className="pill-glass min-w-0 shrink focus-ring" aria-label="Tilpass quizen">
            <SlidersHorizontal size={14} className="shrink-0" />
            <span className="truncate">{summary}</span>
            <ChevronRight size={13} className="shrink-0 text-ink-muted" />
          </button>
        )
      )}
      {/* Spacer pushes the controls to the right; collapses first when tight. */}
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-1.5">
        {!exploreActive && (
          <button onClick={onExplore} aria-label="Utforsk datasettet" title="Utforsk" className="pill pill-glass shrink-0 focus-ring">
            <Compass size={15} />
            <span className="hidden sm:inline">Utforsk</span>
          </button>
        )}
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
  );
}
