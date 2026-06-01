"use client";

import { Sun, Moon, RotateCcw } from "lucide-react";
import Modal from "./Modal";

const SPEEDS: { label: string; ms: number }[] = [
  { label: "Manuell", ms: 0 },
  { label: "1s", ms: 1000 },
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
];

function Segmented<T>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.06]">
      {options.map((o, i) => (
        <button
          key={i}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition focus-ring ${
            value === o.value ? "bg-ink text-canvas shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsSheet({
  autoAdvance,
  onAutoAdvance,
  theme,
  onTheme,
  onResetElo,
  onClose,
}: {
  autoAdvance: number;
  onAutoAdvance: (ms: number) => void;
  theme: "light" | "dark";
  onTheme: (t: "light" | "dark") => void;
  onResetElo: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Innstillinger">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Auto-neste</div>
          <Segmented options={SPEEDS.map((s) => ({ label: s.label, value: s.ms }))} value={autoAdvance} onChange={onAutoAdvance} />
          <p className="mt-1.5 text-[11px] text-ink-muted">Gå automatisk videre etter at du har svart.</p>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Tema</div>
          <Segmented
            options={[
              { label: "Lys", value: "light", icon: <Sun size={14} /> },
              { label: "Mørk", value: "dark", icon: <Moon size={14} /> },
            ]}
            value={theme}
            onChange={onTheme}
          />
        </div>

        <button
          onClick={onResetElo}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--field-stroke)] py-2.5 text-sm font-medium text-ink-muted transition hover:text-[var(--bad)] focus-ring"
        >
          <RotateCcw size={15} />
          Nullstill Elo & statistikk
        </button>
      </div>
    </Modal>
  );
}
