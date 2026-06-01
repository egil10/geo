// Forgiving text matching for the "Skriv" (type the answer) and "Lister" modes.
// Normalizes case, Norwegian letters (æøå), and punctuation/space so users don't
// have to be pixel-perfect.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]/g, "");
}

export function stripParen(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Accept the answer, and (for disambiguated names like "Herøy (Nordland)") the
// bare form too.
export function matchesAnswer(input: string, answer: string): boolean {
  const n = normalize(input);
  if (!n) return false;
  return n === normalize(answer) || n === normalize(stripParen(answer));
}

export function matchesAny(input: string, answers: string[]): number {
  const n = normalize(input);
  if (!n) return -1;
  return answers.findIndex((a) => n === normalize(a) || n === normalize(stripParen(a)));
}
