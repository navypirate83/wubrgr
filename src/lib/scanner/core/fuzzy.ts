/* =====================================================================
   FUZZY CARD NAME MATCHING (shared, plain TypeScript, no imports)
   The scanner reads the card's name from its title bar with OCR, which gets
   some letters wrong ("Lightning Boit", "Sol Rinq"). This finds the real card
   name that's closest to what was read.
   Closeness is an "edit distance": the fewest changes (swap, add or take out a
   letter) that turn one name into the other. A swap between letters OCR
   commonly mixes up (0 and o, 1 and l, 5 and s...) costs less than a swap
   between unrelated letters. The names must already be in the plain form
   from text.ts (normalizeName): lowercase, no accents, no punctuation.
   A match is only "clear" if it's close enough AND clearly closer than the
   next best different name (so "Plains" read as "Plain" isn't confused with
   something else).
   ===================================================================== */

// Pairs of characters OCR commonly mixes up: swapping them costs less
const LOOKALIKES = ['0o', '1l', '1i', 'il', '5s', '8b', '2z', 'ce', 'cg', 'ao', 'nh', 'ec', 'uv'];
const CHEAP = new Set(LOOKALIKES.flatMap((p) => [p, p[1] + p[0]]));

// The cost of turning a into b, giving up (returning more than "limit") once it can't be within it
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const same = a[i - 1] === b[j - 1];
      const swap = same ? 0 : CHEAP.has(a[i - 1] + b[j - 1]) ? 0.4 : 1;
      const cost = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + swap);
      current.push(cost);
      if (cost < rowBest) rowBest = cost;
    }
    if (rowBest > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

// How alike two names are, 0 (nothing in common) to 1 (the same)
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return Math.max(0, 1 - editDistance(a, b, longest) / longest);
}

export type NameMatch = {
  name: string;          // the real name found (as given in the list)
  similarity: number;    // 0 to 1
  clear: boolean;        // close enough, and clearly closer than any other name
};

// Find the name in the list closest to what was read. "minimum" is how alike it must be to count.
export function bestNameMatch(read: string, names: readonly string[], minimum = 0.78, margin = 0.06): NameMatch | null {
  if (!read) return null;
  let best: { name: string; score: number } | null = null;
  let runnerUp = 0;
  for (const name of names) {
    // A name much longer or shorter can't be close enough: skip the work
    if (Math.abs(name.length - read.length) > Math.max(read.length, name.length) * (1 - minimum)) continue;
    const score = similarity(read, name);
    if (score < minimum - 0.2) continue;
    if (!best || score > best.score) {
      if (best && best.name !== name) runnerUp = Math.max(runnerUp, best.score);
      best = { name, score };
    } else if (name !== best.name) {
      runnerUp = Math.max(runnerUp, score);
    }
  }
  if (!best || best.score < minimum) return null;
  return { name: best.name, similarity: best.score, clear: best.score - runnerUp >= margin };
}
