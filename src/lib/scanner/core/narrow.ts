/* =====================================================================
   NARROWING DOWN WHICH PRINTING (shared, plain TypeScript, no imports)
   For a card with no readable info line (older than 2014, worn, or glare), the
   scanner reads the card's NAME, asks the catalogue for every printing of that
   name, and then uses every clue it can get, in this order, to cut the list down:
     1. the copyright year at the bottom ("© 1995")
     2. the border colour (black or white: tells Unlimited from Revised, 4th from 5th)
     3. the frame (1993, 1997, 2003, 2015...)
     4. the set symbol, compared only against the sets this card was printed in
        (a card with NO symbol at all points to Alpha through 5th Edition)
     5. the artwork, by its fingerprint, compared only against these printings
   Each clue only counts if it leaves at least one printing (a clue that would
   remove them all is more likely a misread than the truth, so it's ignored).
   If one is left, it's "likely" (and the scanner still asks you to confirm it).
   More than one: the scanner shows them for you to pick. It never adds a card by
   itself from here.
   ===================================================================== */

// What the narrowing needs to know about each possible printing
export type Candidate = {
  id: string;
  setCode: string;
  year: number;
  border: string;
  frame: string;
  symbol: Uint8Array | null;      // the set's symbol (64 x 64 bits) from the catalogue
  artHashes: Uint8Array[];        // the fingerprint of each face's art (usually one)
};

// What was learned from the photo (any of it may be missing)
export type Clues = {
  years?: { from: number; to: number } | null;   // the copyright year(s)
  border?: string | null;                        // "black" or "white"
  frame?: string | null;
  symbolFound?: boolean;                         // false: no set symbol on the card
  symbolScores?: Map<string, number>;            // by printing id: how much the symbol overlaps (0 to 1)
  artDistances?: Map<string, number>;            // by printing id: how many bits the art differs by (0 to 256)
};

// Sets whose cards have no set symbol: Alpha, Beta, Unlimited, Revised, Fourth and Fifth Edition
export const NO_SYMBOL_SETS: ReadonlySet<string> = new Set(['lea', 'leb', '2ed', '3ed', '4ed', '5ed', 'ced', 'cei']);

// A symbol must overlap this much to count, and within this much of the best one
const SYMBOL_MINIMUM = 0.35;
const SYMBOL_MARGIN = 0.08;
// The art must be this close (bits) to count, and within this much of the closest
const ART_MAXIMUM = 70;
const ART_MARGIN = 12;

export type Narrowed = {
  remaining: Candidate[];
  likely: boolean;          // exactly one is left
  steps: string[];          // what each clue did, for the "why" (testing and the scan list)
};

export function narrowCandidates(candidates: Candidate[], clues: Clues): Narrowed {
  let left = candidates;
  const steps: string[] = [];
  // Keep only the printings a clue allows, but only if at least one is allowed
  const apply = (label: string, keep: (c: Candidate) => boolean) => {
    const next = left.filter(keep);
    if (next.length > 0 && next.length < left.length) { steps.push(`${label}: ${left.length} to ${next.length}`); left = next; }
  };

  if (clues.years) {
    const { from, to } = clues.years;
    apply('copyright year', (c) => c.year >= from && c.year <= to);
  }
  if (clues.border) apply('border', (c) => c.border === clues.border);
  if (clues.frame) apply('frame', (c) => c.frame === clues.frame);

  if (clues.symbolFound === false) {
    apply('no set symbol', (c) => NO_SYMBOL_SETS.has(c.setCode));
  } else if (clues.symbolScores && clues.symbolScores.size > 0) {
    const best = Math.max(...left.map((c) => clues.symbolScores?.get(c.id) ?? 0));
    if (best >= SYMBOL_MINIMUM) apply('set symbol', (c) => (clues.symbolScores?.get(c.id) ?? 0) >= best - SYMBOL_MARGIN);
  }

  if (clues.artDistances && clues.artDistances.size > 0) {
    const closest = Math.min(...left.map((c) => clues.artDistances?.get(c.id) ?? Infinity));
    if (closest <= ART_MAXIMUM) apply('artwork', (c) => (clues.artDistances?.get(c.id) ?? Infinity) <= closest + ART_MARGIN);
  }

  return { remaining: left, likely: left.length === 1, steps };
}
