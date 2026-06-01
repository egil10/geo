"use client";

import { ListChecks, ArrowDownUp, PenLine, ListOrdered, Compass, Check } from "lucide-react";
import Modal from "./Modal";

export type Mode = "velg" | "sorter" | "skriv" | "lister" | "utforsk";

export const MODES: { key: Mode; label: string; icon: React.ComponentType<{ size?: number }>; hint: string }[] = [
  { key: "velg", label: "Velg", icon: ListChecks, hint: "Fire svaralternativer" },
  { key: "sorter", label: "Sortér", icon: ArrowDownUp, hint: "Ranger fire fra størst til minst" },
  { key: "skriv", label: "Skriv", icon: PenLine, hint: "Skriv inn svaret selv" },
  { key: "lister", label: "Lister", icon: ListOrdered, hint: "Fyll inn topp-lister & ekstremer" },
  { key: "utforsk", label: "Utforsk", icon: Compass, hint: "Bla gjennom alle data & fasiter" },
];

export const modeLabel = (m: Mode) => MODES.find((x) => x.key === m)?.label ?? "Velg";

export default function ModePicker({
  mode,
  onChange,
  onClose,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Spillemodus" size="lg">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => {
                onChange(m.key);
                onClose();
              }}
              className={`relative flex items-start gap-3 rounded-2xl border p-3.5 text-left transition focus-ring ${
                active
                  ? "border-transparent bg-ink text-canvas"
                  : "border-[var(--field-stroke)] bg-[var(--field)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={20} />
              <div className="flex-1">
                <div className="text-sm font-semibold leading-tight">{m.label}</div>
                <div className={`text-[11px] leading-tight ${active ? "text-canvas/70" : "text-ink-muted"}`}>{m.hint}</div>
              </div>
              {active && <Check size={16} className="absolute right-3 top-3" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
