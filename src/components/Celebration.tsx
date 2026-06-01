"use client";

import { useEffect, useMemo } from "react";
import { Award } from "lucide-react";

const COLORS = ["#ba0c2f", "#1d4ed8", "#d97706", "#16a34a", "#0a0a0a"];

export default function Celebration({
  title,
  sub,
  onDone,
}: {
  title: string;
  sub: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        left: Math.random() * 100,
        bg: COLORS[i % COLORS.length],
        delay: Math.random() * 0.6,
        dur: 2 + Math.random() * 1.4,
        rot: Math.random() * 360,
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.bg,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
      <div className="frost animate-diploma flex flex-col items-center gap-2 rounded-[28px] px-8 py-7 text-center">
        <Award size={34} className="text-amber-500" strokeWidth={1.8} />
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{sub}</div>
        <div className="font-display text-2xl font-bold tracking-tight">{title}</div>
      </div>
    </div>
  );
}
