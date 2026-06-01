"use client";

import { useMemo, useState } from "react";
import { Search, LayoutGrid, Table2, ArrowUp, ArrowDown, MapPin } from "lucide-react";
import TopBar from "./TopBar";
import { Mode } from "./ModePicker";
import { EloState } from "@/lib/elo";
import { kommuner, fylker, fjell, elver, innsjoer, fjorder, oyer, fossefall, isbreer, tunneler, klubber, aviser, Place, fmtInt, fmtMetric } from "@/lib/data";
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
];

const cell = (p: Place, k: keyof Place): string => {
  const v = p[k];
  if (v == null) return "–";
  if (k === "population") return fmtInt(v as number);
  if (typeof v === "number") return new Intl.NumberFormat("nb-NO").format(Math.round(v));
  return String(v);
};

function Thumb({ p, img, big }: { p: Place; img: "coa" | "photo"; big?: boolean }) {
  const url = img === "coa" ? p.coa : p.photo;
  const w = big ? 320 : 96;
  if (!url) {
    return (
      <div className={`grid shrink-0 place-items-center bg-black/[0.04] text-ink-muted dark:bg-white/[0.05] ${big ? "h-full w-full" : "h-10 w-10 rounded-lg"}`}>
        <MapPin size={big ? 22 : 15} />
      </div>
    );
  }
  if (img === "coa") {
    return (
      <div className={`grid shrink-0 place-items-center overflow-hidden bg-white ${big ? "h-full w-full p-3" : "h-10 w-10 rounded-lg p-1"}`}>
        <img src={imgAt(url, w)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  return (
    <img
      src={imgAt(url, w)}
      alt=""
      loading="lazy"
      className={`shrink-0 object-contain ${big ? "h-full w-full" : "h-10 w-10 rounded-lg bg-black/[0.04] dark:bg-white/[0.05]"}`}
    />
  );
}

export default function Explore({
  mode,
  onOpenMode,
  elo,
  onOpenElo,
  onOpenSettings,
}: {
  mode: Mode;
  onOpenMode: () => void;
  elo: EloState;
  onOpenElo: () => void;
  onOpenSettings: () => void;
}) {
  const [groupKey, setGroupKey] = useState(GROUPS[0].key);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"tabell" | "galleri">("tabell");
  const [sortKey, setSortKey] = useState<keyof Place>("population");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
    const q = normalize(query);
    const col = group.cols.find((c) => c.k === sortKey);
    const filtered = group.list.filter((p) => !q || normalize(p.name).includes(q) || (p.county && normalize(p.county).includes(q)));
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let r: number;
      if (col?.num) r = (Number(av) || -Infinity) - (Number(bv) || -Infinity);
      else r = String(av ?? "").localeCompare(String(bv ?? ""), "nb");
      return sortDir === "asc" ? r : -r;
    });
    return filtered;
  }, [group, query, sortKey, sortDir]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 pb-12 pt-3 sm:px-5">
      <TopBar mode={mode} onOpenMode={onOpenMode} elo={elo} onOpenElo={onOpenElo} onOpenSettings={onOpenSettings} />

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Datasett</h1>
        <p className="text-sm text-ink-muted">Bla gjennom alle fasitene — lær navn, tall og våpen før du tar quizen.</p>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => selectGroup(g)}
            className={`pill shrink-0 border ${g.key === groupKey ? "border-transparent bg-ink text-canvas" : "border-[var(--field-stroke)] bg-[var(--field)] text-ink/80 hover:text-ink"}`}
          >
            {g.label}
          </button>
        ))}
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
            <div key={p.id} className="glass overflow-hidden rounded-2xl">
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
