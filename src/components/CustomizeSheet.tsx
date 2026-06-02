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
  Trophy,
  Newspaper,
  Users,
  Hash,
  Building,
  TrainFront,
  Plane,
  TrainTrack,
  MapPin,
  Image as ImageIcon,
  Type as TypeIcon,
  LayoutGrid,
  Shapes,
} from "lucide-react";
import Modal from "./Modal";
import { CATEGORIES, Category, QUIZ_TYPES, QuizType, availableTypesFor, availableCatsFor } from "@/lib/questions";
import { CATEGORY_TO_LIST } from "@/lib/lists";
import { Mode, MODES } from "./ModePicker";

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
  Trophy,
  Newspaper,
  Users,
  Hash,
  Building,
  TrainFront,
  Plane,
  TrainTrack,
  MapPin,
  Image: ImageIcon,
  Type: TypeIcon,
};

// Category chips are listed alphabetically (nb locale → æ, ø, å sort last); the
// canonical CATEGORIES order is kept for question generation elsewhere.
const SORTED_CATEGORIES = [...CATEGORIES].sort((a, b) => a.label.localeCompare(b.label, "nb"));

// Toggle a key in a multi-select set where "empty" and "full" both mean "Alt".
function multiToggle<T>(set: Set<T>, key: T, all: T[]): Set<T> {
  const isAll = set.size === 0 || set.size === all.length;
  if (isAll) return new Set<T>([key]); // narrow from "everything" to just this one
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  if (next.size === 0 || next.size === all.length) return new Set<T>();
  return next;
}

function Chip({
  active,
  disabled,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Ikke tilgjengelig med dette utvalget" : undefined}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition focus-ring ${
        active
          ? "border-transparent bg-ink text-canvas"
          : disabled
            ? "cursor-not-allowed border-[var(--field-stroke)] bg-transparent text-ink-muted opacity-40"
            : "border-[var(--field-stroke)] bg-[var(--field)] text-ink hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
      }`}
    >
      <Icon size={15} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h3>
        {sub && <span className="text-[11px] text-ink-muted/80">{sub}</span>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export default function CustomizeSheet({
  mode,
  onMode,
  selected,
  onCats,
  types,
  onTypes,
  onClose,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  selected: Set<Category>;
  onCats: (next: Set<Category>) => void;
  types: Set<QuizType>;
  onTypes: (next: Set<QuizType>) => void;
  onClose: () => void;
}) {
  const catKeys = CATEGORIES.map((c) => c.key);
  const typeKeys = QUIZ_TYPES.map((t) => t.key);
  const catsAll = selected.size === 0 || selected.size === catKeys.length;
  const typesAll = types.size === 0 || types.size === typeKeys.length;
  const showTypes = mode === "velg" || mode === "skriv";
  // Cross-filter availability: each dimension's options depend on the other's
  // current pick, so impossible combinations are greyed out.
  const availTypes = availableTypesFor(selected);
  const availCats = availableCatsFor(showTypes ? types : new Set());

  return (
    <Modal onClose={onClose} title="Tilpass quizen" size="lg">
      <Section title="Spillemodus">
        {MODES.map((m) => (
          <Chip key={m.key} active={mode === m.key} Icon={m.icon} label={m.label} onClick={() => onMode(m.key)} />
        ))}
      </Section>

      <Section title="Kategori" sub="hva spørsmålene handler om">
        <Chip active={catsAll} Icon={LayoutGrid} label="Alt" onClick={() => onCats(new Set())} />
        {SORTED_CATEGORIES.map((c) => {
          const active = !catsAll && selected.has(c.key);
          // In Lister mode only categories with a board are selectable, and the pick is single.
          const noList = mode === "lister" && !CATEGORY_TO_LIST[c.key];
          return (
            <Chip
              key={c.key}
              active={active}
              disabled={!active && (!availCats.has(c.key) || noList)}
              Icon={ICONS[c.icon] ?? Map}
              label={c.label}
              onClick={() => onCats(mode === "lister" ? new Set([c.key]) : multiToggle(selected, c.key, catKeys))}
            />
          );
        })}
      </Section>

      {showTypes && (
        <Section title="Spørsmålstype" sub="hvordan de stilles">
          <Chip active={typesAll} Icon={Shapes} label="Alle typer" onClick={() => onTypes(new Set())} />
          {QUIZ_TYPES.map((t) => {
            const active = !typesAll && types.has(t.key);
            return (
              <Chip
                key={t.key}
                active={active}
                disabled={!active && !availTypes.has(t.key)}
                Icon={ICONS[t.icon] ?? Shapes}
                label={t.label}
                onClick={() => onTypes(multiToggle(types, t.key, typeKeys))}
              />
            );
          })}
        </Section>
      )}

      <button onClick={onClose} className="mt-1 w-full rounded-2xl bg-ink py-3 text-sm font-semibold text-canvas transition hover:opacity-90 focus-ring">
        Ferdig
      </button>
    </Modal>
  );
}
