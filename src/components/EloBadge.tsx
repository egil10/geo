"use client";

import { Trophy, Anchor, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { EloState, eloStatus, tierFor } from "@/lib/elo";

const ICONS = {
  trophy: Trophy,
  anchor: Anchor,
  up: TrendingUp,
  down: TrendingDown,
  steady: Minus,
} as const;

export default function EloBadge({ elo, onOpen }: { elo: EloState; onOpen: () => void }) {
  const Icon = ICONS[eloStatus(elo)];
  const tier = tierFor(elo.rating);
  return (
    <button
      onClick={onOpen}
      className="pill-glass shrink-0 px-3 focus-ring sm:px-4"
      aria-label={`Elo ${elo.rating}, ${tier.name}. Åpne statistikk`}
      title={`${tier.name} · ${elo.rating} Elo`}
    >
      <Icon size={15} strokeWidth={2.2} className="text-amber-600 dark:text-amber-400" />
      <span className="tabular-nums font-semibold">{elo.rating}</span>
      <span className="hidden text-ink-muted sm:inline">{tier.name}</span>
    </button>
  );
}
