"use client";

import {
  Map,
  Building2,
  Shield,
  Mountain,
  Waves,
  Droplet,
  Ship,
  Sailboat,
  ArrowDownWideNarrow,
  Snowflake,
  Route,
  Users,
  Hash,
  Check,
  LayoutGrid,
} from "lucide-react";
import Modal from "./Modal";
import { CATEGORIES, Category } from "@/lib/questions";

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  Map,
  Building2,
  Shield,
  Mountain,
  Waves,
  Droplet,
  Ship,
  Sailboat,
  ArrowDownWideNarrow,
  Snowflake,
  Route,
  Users,
  Hash,
};

export default function CategoryPicker({
  selected,
  onChange,
  onClose,
}: {
  selected: Set<Category>;
  onChange: (next: Set<Category>) => void;
  onClose: () => void;
}) {
  const allKeys = CATEGORIES.map((c) => c.key);
  const isAll = selected.size === 0 || selected.size === allKeys.length;

  const toggle = (key: Category) => {
    // From "Alt" (everything), clicking a single category narrows to just it.
    if (isAll) {
      onChange(new Set([key]));
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Empty (deselected the last) or full again both mean "Alt".
    if (next.size === 0 || next.size === allKeys.length) onChange(new Set());
    else onChange(next);
  };

  return (
    <Modal onClose={onClose} title="Velg kategorier" size="lg">
      <button
        onClick={() => onChange(new Set())}
        className={`mb-3 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-ring ${
          isAll ? "border-transparent bg-ink text-canvas" : "border-[var(--field-stroke)] bg-[var(--field)] hover:bg-black/[0.03]"
        }`}
      >
        <LayoutGrid size={18} />
        <div className="flex-1">
          <div className="text-sm font-semibold">Alt om norsk geografi</div>
          <div className={`text-xs ${isAll ? "text-canvas/70" : "text-ink-muted"}`}>Alle kategorier i miks</div>
        </div>
        {isAll && <Check size={18} />}
      </button>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CATEGORIES.map((c) => {
          const Icon = ICONS[c.icon] ?? Map;
          const active = !isAll && selected.has(c.key);
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              className={`relative flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition focus-ring ${
                active
                  ? "border-transparent bg-ink text-canvas"
                  : "border-[var(--field-stroke)] bg-[var(--field)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              <div className="text-sm font-semibold leading-tight">{c.label}</div>
              <div className={`text-[11px] leading-tight ${active ? "text-canvas/70" : "text-ink-muted"}`}>{c.hint}</div>
              {active && <Check size={15} className="absolute right-2.5 top-2.5" />}
            </button>
          );
        })}
      </div>

      <button onClick={onClose} className="mt-4 w-full rounded-2xl bg-ink py-3 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring">
        Ferdig
      </button>
    </Modal>
  );
}
