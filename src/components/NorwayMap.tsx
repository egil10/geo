"use client";

import { GEO_VIEWBOX, fylkerBase } from "@/lib/geo";
import { SVALBARD_VIEWBOX, svalbardOutline } from "@/lib/svalbard";

// Rough centroid + extent of a path, so small regions can get a locator ring.
function pathStats(d: string) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sx += x; sy += y; n++;
  }
  return { cx: sx / n, cy: sy / n, span: Math.max(maxX - minX, maxY - minY) };
}

// Renders Norway (fylke outlines) with one region highlighted, a route/river
// traced (line), or a point pinned. For Svalbard subjects, renders the Svalbard
// archipelago inset (its own viewBox) with the point pinned there instead.
export default function NorwayMap({ region, pin, line, svalbard }: { region?: string; pin?: { x: number; y: number }; line?: string; svalbard?: { x: number; y: number } }) {
  const rs = region ? pathStats(region) : null;
  if (svalbard) {
    return (
      <svg viewBox={SVALBARD_VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kart over Svalbard">
        <text x="50%" y="22" textAnchor="middle" className="fill-ink-muted text-[15px] font-semibold">Svalbard</text>
        <g className="fill-black/[0.09] stroke-white/70 dark:fill-white/[0.14] dark:stroke-black/30" strokeWidth="0.8">
          {svalbardOutline.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <circle cx={svalbard.x} cy={svalbard.y} r="11" fill="#e11d48" opacity="0.22" />
        <circle cx={svalbard.x} cy={svalbard.y} r="5" fill="#e11d48" stroke="#fff" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox={GEO_VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kart over Norge">
      <g className="fill-black/[0.09] stroke-white/70 dark:fill-white/[0.14] dark:stroke-black/30" strokeWidth="0.6">
        {fylkerBase.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {line && (
        <path d={line} fill="none" stroke="#e11d48" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {region && rs && (
        <>
          {rs.span < 70 && <circle cx={rs.cx} cy={rs.cy} r={Math.max(48, rs.span * 1.6)} fill="none" stroke="#e11d48" strokeWidth="2.5" opacity="0.55" />}
          <path d={region} fill="#e11d48" stroke="#fff" strokeWidth={rs.span < 70 ? 1.4 : 0.8} />
        </>
      )}
      {pin && (
        <g>
          <circle cx={pin.x} cy={pin.y} r="26" fill="#e11d48" opacity="0.22" />
          <circle cx={pin.x} cy={pin.y} r="12" fill="#e11d48" stroke="#fff" strokeWidth="3.5" />
        </g>
      )}
    </svg>
  );
}
