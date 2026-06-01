"use client";

import { Layers, Settings, ChevronRight, Gamepad2 } from "lucide-react";
import Wordmark from "./Wordmark";
import EloBadge from "./EloBadge";
import { EloState } from "@/lib/elo";
import { Mode, modeLabel } from "./ModePicker";

export default function TopBar({
  mode,
  onOpenMode,
  catLabel,
  onOpenPicker,
  elo,
  onOpenElo,
  onOpenSettings,
}: {
  mode: Mode;
  onOpenMode: () => void;
  catLabel?: string;
  onOpenPicker?: () => void;
  elo: EloState;
  onOpenElo: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar -my-1 py-1">
        <Wordmark />
        <button onClick={onOpenMode} className="pill-glass shrink-0 focus-ring" aria-label="Velg spillemodus">
          <Gamepad2 size={14} />
          <span>{modeLabel(mode)}</span>
          <ChevronRight size={13} className="text-ink-muted" />
        </button>
        {catLabel && onOpenPicker && (
          <button onClick={onOpenPicker} className="pill-glass shrink-0 focus-ring" aria-label="Velg kategorier">
            <Layers size={14} />
            <span className="max-w-[8rem] truncate">{catLabel}</span>
            <ChevronRight size={13} className="text-ink-muted" />
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
