/* =====================================================================
   RANKING THE PRINTINGS OF A CARD (shared, plain TypeScript, no imports)
   For a card with no readable info line (older than 2014, worn, or glare), the scanner reads the
   card's NAME, asks the catalogue for every printing of that name, and then uses every clue it can
   get to put the printings in order, most likely first:
     - the ARTWORK (the strongest clue: how close the photo's art is to each printing's stored fingerprint)
     - the SET SYMBOL (how much the photo's symbol overlaps each set's symbol)
     - the BORDER colour (black or white: tells Unlimited from Revised, 4th from 5th)
     - the COPYRIGHT YEAR ("© 1995")
   Each clue ADDS to a printing's score (or takes from it), instead of cutting the list down step by step.
   That matters: with the old step-by-step way, one misread clue could throw the right printing out for good
   (on real scans the right one was thrown out about 4 times in 10). Now a misread clue only costs it some points.
   The weights were tried on real card scans (about 200 cards, 68 printings each on average): the right printing
   came first about 65% of the time and in the top 3 about 85% of the time (the step-by-step way: 29% and 53%).
   Cards lined up badly (moved or resized on purpose) still did much better than the old way did lined up perfectly.
   The scanner only says "likely" (one answer, still to be confirmed) when the best printing is clearly ahead
   of the best DIFFERENT one: at a lead of 0.25 that was right 96% to 100% of the time in every test, for about
   a quarter of the cards. Otherwise the person chooses, with the most likely ones first. A wrong "likely" is
   worse than a short ordered list, so the bar is high. It never adds a card by itself from here.
   The set symbol is the weakest clue (on real scans the right set came first only about 1 time in 4), so it
   only carries a small weight. Old cards from Alpha through Fifth Edition have no symbol at all, and
   the scanner can't tell that from a symbol it just couldn't find, so there's no rule about it.
   Printings of the same set with the same artwork (a foil and a non-foil, say) can't be told apart by any
   of these clues, so they share a "group" and don't count as rivals to each other.
   ===================================================================== */

// What the ranking needs to know about each possible printing
export type Candidate = {
  id: string;
  setCode: string;
  year: number;
  border: string;
  group: string;                  // printings with the same set and artwork share one (they look alike in a photo)
};

// What was learned from the photo (any of it may be missing)
export type Clues = {
  years?: { from: number; to: number } | null;   // the copyright year(s)
  border?: string | null;                        // "black" or "white"
  symbolScores?: Map<string, number>;            // by printing id: how much the symbol overlaps (0 to 1)
  artDistances?: Map<string, number>;            // by printing id: how many bits the art differs by (0 to 256)
};

// How much each clue counts (found by trying them on real scans)
const ART_WEIGHT = 3;           // a printing whose art is 256 bits off (nothing alike) loses this much
const SYMBOL_WEIGHT = 0.6;      // times the symbol overlap (0 to 1)
const BORDER_WEIGHT = 0.15;     // up for the right border colour, down for the wrong one
const YEAR_WEIGHT = 0.2;        // up if the copyright year fits, down if it doesn't
// "Likely" needs this much lead over the best different printing
export const LIKELY_LEAD = 0.25;
// Printings within this much of the best one "fit" (are shown first in the list to choose from)
export const FIT_WINDOW = 0.15;

export type Ranked = {
  ordered: Candidate[];     // every candidate, most likely first
  scores: Map<string, number>;
  lead: number;             // how far the best one is ahead of the best DIFFERENT one
  likely: boolean;          // the best one is clearly ahead of every different one
  fits: number;             // how many are within the fit window of the best (at least 1)
  why: string;              // the clues that counted, in plain words
};

export function rankCandidates(candidates: Candidate[], clues: Clues): Ranked {
  const artRead = !!clues.artDistances && clues.artDistances.size > 0;
  const symbolRead = !!clues.symbolScores && clues.symbolScores.size > 0;
  const scores = new Map<string, number>();
  for (const c of candidates) {
    let score = 0;
    if (artRead) {
      const distance = clues.artDistances!.get(c.id);
      // A printing with no stored art counts as having art that's nothing like the photo's
      score -= ((distance ?? 256) / 256) * ART_WEIGHT;
    }
    const symbolPart = symbolRead ? (clues.symbolScores!.get(c.id) ?? 0) * SYMBOL_WEIGHT : 0;
    if (clues.border) score += c.border === clues.border ? BORDER_WEIGHT : -BORDER_WEIGHT;
    if (clues.years) score += c.year >= clues.years.from && c.year <= clues.years.to ? YEAR_WEIGHT : -YEAR_WEIGHT;
    scores.set(c.id, score + symbolPart);
  }
  // Highest score first; printings with equal scores stay in the order the catalogue gave (oldest first)
  const ordered = candidates.map((c, i) => ({ c, i })).sort((a, b) => scores.get(b.c.id)! - scores.get(a.c.id)! || a.i - b.i).map((x) => x.c);
  const best = ordered[0];
  if (!best) return { ordered, scores, lead: 0, likely: false, fits: 0, why: 'No printings' };
  const bestScore = scores.get(best.id)!;
  const rival = ordered.find((c) => c.group !== best.group);
  const lead = rival ? bestScore - scores.get(rival.id)! : Infinity;
  const fits = Math.max(1, ordered.filter((c) => bestScore - scores.get(c.id)! < FIT_WINDOW).length);

  // The clues that counted for the best one, in plain words
  const bits: string[] = [];
  const art = clues.artDistances?.get(best.id);
  if (art !== undefined) bits.push(`art ${art < 40 ? 'matches' : art < 70 ? 'is close' : 'is far off'} (${art} bits)`);
  const symbol = clues.symbolScores?.get(best.id);
  if (symbol !== undefined && symbolRead) bits.push(`symbol ${Math.round(symbol * 100)}% alike`);
  if (clues.border && best.border === clues.border) bits.push(`${clues.border} border`);
  if (clues.years && best.year >= clues.years.from && best.year <= clues.years.to) bits.push('copyright year fits');
  const why = bits.length ? bits.join('; ') : 'No clue could tell them apart';
  return { ordered, scores, lead, likely: lead >= LIKELY_LEAD, fits, why };
}
