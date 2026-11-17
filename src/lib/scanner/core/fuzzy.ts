/* =====================================================================
   FUZZY CARD NAME MATCHING (shared, plain TypeScript, no imports)
   The scanner reads the card's name from its title bar with OCR, which gets
   some letters wrong ("Lightning Boit", "Sol Rinq"). This finds the real card
   name that's closest to what was read.
   (Speed: this runs against about 30,000 names per read, so it gives up early on names that can't
   match and reuses its working rows; looksLikeAnyName is the quick yes/no version.)
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
// The same pairs as numbers (one letter's code times 65536, plus the other's), because the checking
// below runs millions of times per scan and comparing numbers is much quicker than building text
const pairKey = (x: string, y: string) => x.charCodeAt(0) * 65536 + y.charCodeAt(0);
const CHEAP = new Set(LOOKALIKES.flatMap((p) => [pairKey(p[0], p[1]), pairKey(p[1], p[0])]));

// Two reusable rows of working numbers. The calculation below needs two rows at a time, and making
// new ones for every name (30,000 names a scan) was a big part of why scans were slow.
let rowOne = new Float64Array(80);
let rowTwo = new Float64Array(80);

// The cost of turning a into b, giving up (returning more than "limit") once it can't be within it
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  if (rowOne.length < b.length + 1) { rowOne = new Float64Array(b.length * 2 + 2); rowTwo = new Float64Array(b.length * 2 + 2); }
  let previous = rowOne;
  let current = rowTwo;
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const letter = a.charCodeAt(i - 1);
    current[0] = i;
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const other = b.charCodeAt(j - 1);
      const swap = letter === other ? 0 : CHEAP.has(letter * 65536 + other) ? 0.4 : 1;
      const cost = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + swap);
      current[j] = cost;
      if (cost < rowBest) rowBest = cost;
    }
    // Every way of finishing from here costs at least this much, so stop if that's already too much
    if (rowBest > limit) return limit + 1;
    const spare = previous; previous = current; current = spare;
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
  // A name that is in the list exactly is the best there can be, so start from it. That lets every
  // other name be thrown out quickly (see "floor" below) instead of being worked out in full.
  let best: { name: string; score: number } | null = names.includes(read) ? { name: read, score: 1 } : null;
  let runnerUp = 0;
  for (const name of names) {
    // A name much longer or shorter can't be close enough: skip the work
    if (Math.abs(name.length - read.length) > Math.max(read.length, name.length) * (1 - minimum)) continue;
    if (best && name === best.name) continue;
    // A name only matters if it is at least this alike: close enough to be a runner-up at all, and (once
    // there is a best) within the "margin" of it, because anything further behind can't change the answer.
    // The editDistance call gives up early on names that can't get there.
    const longest = Math.max(read.length, name.length);
    const floor = best ? Math.max(minimum - 0.2, best.score - margin) : minimum - 0.2;
    const limit = longest * (1 - floor) + 1e-9;
    const distance = editDistance(read, name, limit);
    if (distance > limit) continue;
    const score = Math.max(0, 1 - distance / longest);
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

// Does ANY real card name come close to this? (A yes/no question, much quicker than finding the closest:
// it stops at the first name that is close enough, and gives up on each other name after a few letters.)
export function looksLikeAnyName(read: string, names: readonly string[], minimum = 0.78): boolean {
  if (!read) return false;
  for (const name of names) {
    const longest = Math.max(read.length, name.length);
    if (Math.abs(name.length - read.length) > longest * (1 - minimum)) continue;
    const limit = longest * (1 - minimum) + 1e-9;
    const distance = editDistance(read, name, limit);
    if (distance <= limit && 1 - distance / longest >= minimum) return true;
  }
  return false;
}
