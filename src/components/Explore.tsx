"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, LayoutGrid, Table2, ArrowUp, ArrowDown, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import TopBar from "./TopBar";
import { EloState } from "@/lib/elo";
import { kommuner, fylker, fjell, elver, innsjoer, fjorder, oyer, fossefall, isbreer, tunneler, klubber, aviser, byer, stasjoner, lufthavner, baner, stavkirker, verdensarv, nasjonalparker, alpinanlegg, fyr, dnthytter, vidder, forsvar, universiteter, turistveger, flagg, dyr, distrikter, landsdeler, veier, Place, fmtInt, fmtMetric } from "@/lib/data";
import { imgAt } from "@/lib/images";
import { normalize } from "@/lib/match";

type Col = { k: keyof Place; h: string; num?: boolean };
interface Group {
  key: string;
  label: string;
  list: Place[];
  img: "coa" | "photo";
  cols: Col[];
  sort: keyof Place;
}

const GROUPS: Group[] = [
  { key: "kommuner", label: "Kommuner", list: kommuner, img: "coa", sort: "population", cols: [{ k: "name", h: "Kommune" }, { k: "county", h: "Fylke" }, { k: "number", h: "Nr." }, { k: "admin", h: "Senter" }, { k: "population", h: "Innb.", num: true }] },
  { key: "fylker", label: "Fylker", list: fylker, img: "coa", sort: "population", cols: [{ k: "name", h: "Fylke" }, { k: "number", h: "Nr." }, { k: "admin", h: "Senter" }, { k: "population", h: "Innb.", num: true }] },
  { key: "fjell", label: "Fjell", list: fjell, img: "photo", sort: "elevation", cols: [{ k: "name", h: "Fjell" }, { k: "county", h: "Fylke" }, { k: "elevation", h: "Moh.", num: true }] },
  { key: "elver", label: "Elver", list: elver, img: "photo", sort: "length", cols: [{ k: "name", h: "Elv" }, { k: "county", h: "Fylke" }, { k: "length", h: "Lengde (km)", num: true }] },
  { key: "innsjoer", label: "Innsjøer", list: innsjoer, img: "photo", sort: "area", cols: [{ k: "name", h: "Innsjø" }, { k: "county", h: "Fylke" }, { k: "area", h: "Areal (km²)", num: true }] },
  { key: "fjorder", label: "Fjorder", list: fjorder, img: "photo", sort: "length", cols: [{ k: "name", h: "Fjord" }, { k: "county", h: "Fylke" }, { k: "length", h: "Lengde (km)", num: true }] },
  { key: "oyer", label: "Øyer", list: oyer, img: "photo", sort: "area", cols: [{ k: "name", h: "Øy" }, { k: "county", h: "Fylke" }, { k: "area", h: "Areal (km²)", num: true }] },
  { key: "fossefall", label: "Fossefall", list: fossefall, img: "photo", sort: "height", cols: [{ k: "name", h: "Foss" }, { k: "county", h: "Fylke" }, { k: "height", h: "Høyde (m)", num: true }] },
  { key: "isbreer", label: "Isbreer", list: isbreer, img: "photo", sort: "area", cols: [{ k: "name", h: "Isbre" }, { k: "county", h: "Fylke" }, { k: "area", h: "Areal (km²)", num: true }] },
  { key: "tunneler", label: "Tunneler", list: tunneler, img: "photo", sort: "length", cols: [{ k: "name", h: "Tunnel" }, { k: "county", h: "Fylke" }, { k: "length", h: "Lengde (km)", num: true }] },
  { key: "klubber", label: "Fotball", list: klubber, img: "photo", sort: "name", cols: [{ k: "name", h: "Klubb" }, { k: "county", h: "Sted" }, { k: "tag", h: "Divisjon" }] },
  { key: "aviser", label: "Aviser", list: aviser, img: "photo", sort: "name", cols: [{ k: "name", h: "Avis" }, { k: "county", h: "Sted" }, { k: "tag", h: "Type" }] },
  { key: "byer", label: "Byer", list: byer, img: "photo", sort: "population", cols: [{ k: "name", h: "By" }, { k: "county", h: "Fylke" }, { k: "population", h: "Innb.", num: true }] },
  { key: "stasjoner", label: "Stasjoner", list: stasjoner, img: "photo", sort: "name", cols: [{ k: "name", h: "Stasjon" }, { k: "tag", h: "Bane" }, { k: "county", h: "Fylke" }] },
  { key: "lufthavner", label: "Lufthavner", list: lufthavner, img: "photo", sort: "name", cols: [{ k: "name", h: "Lufthavn" }, { k: "tag", h: "IATA" }, { k: "county", h: "Fylke" }] },
  { key: "baner", label: "Baner", list: baner, img: "photo", sort: "length", cols: [{ k: "name", h: "Bane" }, { k: "length", h: "Lengde (km)", num: true }] },
  { key: "stavkirker", label: "Stavkirker", list: stavkirker, img: "photo", sort: "name", cols: [{ k: "name", h: "Stavkirke" }, { k: "county", h: "Fylke" }] },
  { key: "verdensarv", label: "Verdensarv", list: verdensarv, img: "photo", sort: "name", cols: [{ k: "name", h: "Sted" }, { k: "county", h: "Fylke" }, { k: "tag", h: "Innskrevet" }] },
  { key: "nasjonalparker", label: "Nasjonalparker", list: nasjonalparker, img: "photo", sort: "metric", cols: [{ k: "name", h: "Park" }, { k: "county", h: "Fylke" }, { k: "metric", h: "Areal (km²)", num: true }] },
  { key: "alpinanlegg", label: "Alpinanlegg", list: alpinanlegg, img: "photo", sort: "name", cols: [{ k: "name", h: "Anlegg" }, { k: "county", h: "Fylke" }, { k: "metric", h: "Fallhøyde (m)", num: true }] },
  { key: "fyr", label: "Fyr", list: fyr, img: "photo", sort: "name", cols: [{ k: "name", h: "Fyr" }, { k: "county", h: "Fylke" }] },
  { key: "dnthytter", label: "DNT-hytter", list: dnthytter, img: "photo", sort: "name", cols: [{ k: "name", h: "Hytte" }, { k: "tag", h: "Region" }, { k: "county", h: "Fylke" }] },
  { key: "vidder", label: "Vidder", list: vidder, img: "photo", sort: "name", cols: [{ k: "name", h: "Vidde" }, { k: "county", h: "Fylke" }] },
  { key: "forsvar", label: "Forsvaret", list: forsvar, img: "photo", sort: "name", cols: [{ k: "name", h: "Base" }, { k: "tag", h: "Gren" }, { k: "county", h: "Fylke" }] },
  { key: "universiteter", label: "Universiteter", list: universiteter, img: "photo", sort: "name", cols: [{ k: "name", h: "Lærested" }, { k: "tag", h: "Type" }, { k: "county", h: "Fylke" }] },
  { key: "turistveger", label: "Turistveger", list: turistveger, img: "photo", sort: "metric", cols: [{ k: "name", h: "Turistveg" }, { k: "county", h: "Fylke" }, { k: "metric", h: "Lengde (km)", num: true }] },
  { key: "flagg", label: "Flagg", list: flagg, img: "photo", sort: "name", cols: [{ k: "name", h: "Flagg" }, { k: "tag", h: "Periode" }] },
  { key: "dyr", label: "Dyr", list: dyr, img: "photo", sort: "name", cols: [{ k: "name", h: "Dyr" }, { k: "latin", h: "Vitenskapelig" }, { k: "tag", h: "Familie" }] },
  { key: "distrikter", label: "Distrikter", list: distrikter, img: "photo", sort: "metric", cols: [{ k: "name", h: "Distrikt" }, { k: "tag", h: "Landsdel" }, { k: "metric", h: "Innb.", num: true }, { k: "admin", h: "Største by" }] },
  { key: "landsdeler", label: "Landsdeler", list: landsdeler, img: "photo", sort: "metric", cols: [{ k: "name", h: "Landsdel" }, { k: "metric", h: "Innb.", num: true }, { k: "admin", h: "Største by" }] },
  { key: "veier", label: "Veier", list: veier, img: "photo", sort: "metric", cols: [{ k: "name", h: "Veg" }, { k: "tag", h: "Type" }, { k: "metric", h: "Lengde (km)", num: true }, { k: "from", h: "Fra" }, { k: "to", h: "Til" }] },
];

// Pills are shown alphabetically (nb locale); the order above only drives the default.
const SORTED_GROUPS = [...GROUPS].sort((a, b) => a.label.localeCompare(b.label, "nb"));

// Per-group search index, built once on first use instead of re-normalizing
// every row's fields on every keystroke. Aligned by index with group.list.
const searchIndex = new Map<string, string[]>();
function searchableOf(g: Group): string[] {
  let s = searchIndex.get(g.key);
  if (!s) {
    s = g.list.map((p) => normalize(p.name) + "\n" + (p.county ? normalize(p.county) : ""));
    searchIndex.set(g.key, s);
  }
  return s;
}

const cell = (p: Place, k: keyof Place): string => {
  const v = p[k];
  if (v == null) return "–";
  if (k === "population") return fmtInt(v as number);
  if (typeof v === "number") return new Intl.NumberFormat("nb-NO").format(Math.round(v));
  return String(v);
};

function Thumb({ p, img, big }: { p: Place; img: "coa" | "photo"; big?: boolean }) {
  const url = img === "coa" ? p.coa : p.photo;
  const w = big ? 320 : 120;
  const box = big ? "h-full w-full" : "h-12 w-12 shrink-0 rounded-lg";
  if (!url) {
    return (
      <div className={`grid place-items-center bg-black/[0.04] text-ink-muted dark:bg-white/[0.05] ${box}`}>
        <MapPin size={big ? 22 : 16} />
      </div>
    );
  }
  // Image is its own box; object-contain scales the whole image inside the
  // padding so nothing (esp. shield-shaped coats of arms) is ever cropped.
  return (
    <img
      src={imgAt(url, w)}
      alt=""
      loading="lazy"
      className={`object-contain ${box} ${img === "coa" ? `bg-white ${big ? "p-4" : "p-1.5"}` : big ? "" : "bg-black/[0.04] p-0.5 dark:bg-white/[0.05]"}`}
    />
  );
}

export default function Explore({
  exploreActive,
  onExplore,
  elo,
  onOpenElo,
  onOpenSettings,
}: {
  exploreActive: boolean;
  onExplore: () => void;
  elo: EloState;
  onOpenElo: () => void;
  onOpenSettings: () => void;
}) {
  const [groupKey, setGroupKey] = useState(GROUPS[0].key);
  const [query, setQuery] = useState("");
  // Keep the input snappy: the (heavier) filtered table may lag a keystroke.
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<"tabell" | "galleri">("tabell");
  const [sortKey, setSortKey] = useState<keyof Place>("population");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Horizontal pill scroller: arrow buttons for mouse users (no swipe/trackpad).
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateScrollArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    updateScrollArrows();
    window.addEventListener("resize", updateScrollArrows);
    return () => window.removeEventListener("resize", updateScrollArrows);
  }, [updateScrollArrows]);
  // Pills are alphabetical, so the default selection sits mid-list — bring it into view on open.
  useEffect(() => {
    scrollerRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);
  const scrollPills = (dir: -1 | 1) => scrollerRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  const group = useMemo(() => GROUPS.find((g) => g.key === groupKey)!, [groupKey]);

  const selectGroup = (g: Group) => {
    setGroupKey(g.key);
    setSortKey(g.sort);
    setSortDir(g.cols.find((c) => c.k === g.sort)?.num ? "desc" : "asc");
    setQuery("");
  };

  const toggleSort = (k: keyof Place, num?: boolean) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(num ? "desc" : "asc");
    }
  };

  const rows = useMemo(() => {
    const q = normalize(deferredQuery);
    const col = group.cols.find((c) => c.k === sortKey);
    const searchable = searchableOf(group);
    const filtered = group.list.filter((_, i) => !q || searchable[i].includes(q));
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let r: number;
      if (col?.num) r = (Number(av) || -Infinity) - (Number(bv) || -Infinity);
      else r = String(av ?? "").localeCompare(String(bv ?? ""), "nb");
      return sortDir === "asc" ? r : -r;
    });
    return filtered;
  }, [group, deferredQuery, sortKey, sortDir]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 pb-12 pt-3 sm:px-5">
      <TopBar exploreActive={exploreActive} onExplore={onExplore} elo={elo} onOpenElo={onOpenElo} onOpenSettings={onOpenSettings} />

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Datasett</h1>
        <p className="text-sm text-ink-muted">Bla gjennom alle fasitene — lær navn, tall og våpen før du tar quizen.</p>
      </div>

      {/* Category pills — scrollable, with arrow buttons for mouse users. */}
      <div className="relative -mx-1">
        {canScrollLeft && (
          // Opaque-edge fade so pills disappear before they reach the arrow.
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-20 items-center bg-gradient-to-r from-canvas via-canvas to-transparent pl-1 pb-1">
            <button
              onClick={() => scrollPills(-1)}
              aria-label="Bla til venstre"
              className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full border border-[var(--field-stroke)] bg-[var(--glass-bg)] text-ink shadow-sm transition hover:bg-black/[0.04] focus-ring dark:hover:bg-white/[0.06]"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        )}
        <div ref={scrollerRef} onScroll={updateScrollArrows} className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
          {SORTED_GROUPS.map((g) => (
            <button
              key={g.key}
              data-active={g.key === groupKey ? "true" : undefined}
              onClick={() => selectGroup(g)}
              className={`pill shrink-0 border ${g.key === groupKey ? "border-transparent bg-ink text-canvas" : "border-[var(--field-stroke)] bg-[var(--field)] text-ink/80 hover:text-ink"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        {canScrollRight && (
          // Opaque-edge fade so pills disappear before they reach the arrow.
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-20 items-center justify-end bg-gradient-to-l from-canvas via-canvas to-transparent pr-1 pb-1">
            <button
              onClick={() => scrollPills(1)}
              aria-label="Bla til høyre"
              className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full border border-[var(--field-stroke)] bg-[var(--glass-bg)] text-ink shadow-sm transition hover:bg-black/[0.04] focus-ring dark:hover:bg-white/[0.06]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="flex min-h-[2.75rem] flex-1 items-center gap-2 rounded-2xl border border-[var(--field-stroke)] bg-[var(--field)] px-3">
          <Search size={16} className="shrink-0 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Søk i ${rows.length} ${group.label.toLowerCase()}…`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-2xl border border-[var(--field-stroke)]">
          {([
            ["tabell", Table2],
            ["galleri", LayoutGrid],
          ] as const).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-label={v}
              className={`grid h-11 w-11 place-items-center transition ${view === v ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"}`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </div>

      {view === "tabell" ? (
        <div className="glass-strong overflow-x-auto rounded-[20px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-left">
                <th className="w-12 px-2 py-2.5" />
                {group.cols.map((c) => {
                  const active = c.k === sortKey;
                  return (
                    <th key={String(c.k)} className={`whitespace-nowrap px-2 py-2.5 font-semibold ${c.num ? "text-right" : ""}`}>
                      <button onClick={() => toggleSort(c.k, c.num)} className={`inline-flex items-center gap-1 transition hover:text-ink ${active ? "text-ink" : "text-ink-muted"}`}>
                        {c.h}
                        {active && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-[var(--hairline)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <td className="px-2 py-1.5">
                    <Thumb p={p} img={group.img} />
                  </td>
                  {group.cols.map((c, i) => (
                    <td key={String(c.k)} className={`px-2 py-1.5 ${c.num ? "text-right tabular-nums" : ""} ${i === 0 ? "font-medium" : "text-ink-muted"}`}>
                      {cell(p, c.k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-ink-muted">Ingen treff</div>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {rows.map((p) => (
            <div key={p.id} className="card cv-card overflow-hidden rounded-2xl">
              <div className="relative h-28 w-full bg-black/[0.03] dark:bg-white/[0.04]">
                <Thumb p={p} img={group.img} big />
              </div>
              <div className="px-2.5 py-2">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="truncate text-[11px] text-ink-muted">{[p.county, fmtMetric(p) || p.tag].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm text-ink-muted">Ingen treff</div>}
        </div>
      )}
    </div>
  );
}
