"use client";

// Clicking the wordmark is a "take me home" reset: clear the saved category /
// type / mode filters so we land on a fresh quiz over all categories. Elo,
// theme and other preferences are left untouched.
const FILTER_KEYS = ["norgequiz.cats.v1", "norgequiz.types.v1", "norgequiz.mode.v1", "norgequiz.explore.v1"];

export default function Wordmark() {
  const reset = (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      FILTER_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    if (window.location.pathname === "/" && !window.location.search) window.location.reload();
    else window.location.href = "/";
  };

  return (
    <a
      href="/"
      onClick={reset}
      className="shrink-0 font-display text-[17px] font-bold tracking-tight leading-none focus-ring rounded-lg sm:text-[19px]"
      aria-label="NorgesQuiz — til forsiden"
    >
      <span className="text-ink">norges</span>
      <span className="text-ink-muted">quiz</span>
    </a>
  );
}
