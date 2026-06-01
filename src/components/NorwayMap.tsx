"use client";

import { GEO_VIEWBOX, fylkerBase } from "@/lib/geo";

// Renders Norway (fylke outlines) with one region highlighted or a point pinned.
export default function NorwayMap({ region, pin }: { region?: string; pin?: { x: number; y: number } }) {
  return (
    <svg viewBox={GEO_VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kart over Norge">
      <g className="fill-black/[0.09] stroke-white/70 dark:fill-white/[0.14] dark:stroke-black/30" strokeWidth="0.6">
        {fylkerBase.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {region && <path d={region} fill="#e11d48" stroke="#fff" strokeWidth="0.8" />}
      {pin && (
        <g>
          <circle cx={pin.x} cy={pin.y} r="26" fill="#e11d48" opacity="0.22" />
          <circle cx={pin.x} cy={pin.y} r="12" fill="#e11d48" stroke="#fff" strokeWidth="3.5" />
        </g>
      )}
    </svg>
  );
}
