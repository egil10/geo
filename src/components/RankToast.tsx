"use client";

import { useEffect, useMemo } from "react";
import { Medal } from "lucide-react";

const COLORS = ["#ba0c2f", "#1d4ed8", "#d97706", "#16a34a"];

// A small, non-blocking rank-up notification: a toast that slides in at the top
// with a brief confetti sprinkle, then fades. It never covers or pauses the quiz.
export default function RankToast({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: 40 + Math.random() * 20,
        bg: COLORS[i % COLORS.length],
        delay: Math.random() * 0.3,
        dur: 1.3 + Math.random() * 0.9,
        rot: Math.random() * 360,
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center" aria-live="polite">
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
      <div className="glass-strong animate-fade-up flex items-center gap-2 rounded-full px-4 py-2">
        <Medal size={16} className="text-amber-500" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Ny rang</span>
        <span className="font-display text-sm font-bold tracking-tight">{name}</span>
      </div>
    </div>
  );
}
