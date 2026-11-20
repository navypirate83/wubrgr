/* =====================================================================
   RANKING THE PRINTINGS OF A CARD (shared, plain TypeScript, no imports)
   For a card with no readable info line (older than 2014, worn, or glare), the scanner reads the
   card's NAME, asks the catalogue for every printing of that name, and then uses every clue it can
   get to put the printings in order, most likely first:
     - the ARTWORK (the strongest clue: how close the photo's art is to each printing's stored fingerprint)
       There are two ways to measure this, and either or both can be used: the ART HASH (a small black-and-white
       sketch of the art, compared bit by bit) and the AI FINGERPRINT (a list of numbers from an AI model,
       compared by "cosine similarity": 1 means the same shape of numbers, 0 means unrelated)
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
  aiScores?: Map<string, number>;                // by printing id: AI fingerprint closeness (cosine, -1 to 1, higher is closer)
  numberScores?: Map<string, number>;            // by printing id: a bonus when the collector number (and set) read from the card fit it (see numberClue.ts)
};

// How much each clue counts (found by trying them on real scans)
const ART_WEIGHT = 3;           // a printing whose art is 256 bits off (nothing alike) loses this much
const SYMBOL_WEIGHT = 0.6;      // times the symbol overlap (0 to 1)
const BORDER_WEIGHT = 0.15;     // up for the right border colour, down for the wrong one
const YEAR_WEIGHT = 0.2;        // up if the copyright year fits, down if it doesn't
// The AI fingerprint's weights. Where they come from: scripts/catalogue/embed/blend-tune.mjs ran the real
// rankCandidates on the real phone photos whose file names give a set and number and whose card has 2 or
// more artworks (13 photos), and tried a grid of weights. Results (right artwork first): art hash alone 12 of
// 13, AI alone 13 of 13 (any weight 2 to 12), every blend 13 of 13. "Likely" answers with the chosen weights:
// 13 right, 0 wrong (art hash alone: 8 right, 0 wrong). Because every setting tied on the rate, the weights were
// chosen by SAFETY MARGIN (how far the right artwork stays ahead of the best wrong one): with these weights the
// smallest margin was 0.57, well above LIKELY_LEAD (0.25), and the blend was never worse than either clue alone.
// CAVEAT: 13 photos is a small sample and the weights were picked on those same photos, so treat them as a
// sensible starting point, not a proven setting. Re-tune when more photos are collected.
//   AI_WEIGHT: the AI closeness (-1 to 1) is multiplied by this and added. Kept near the art hash's own weight
//     (3) so the AI clue is the leader without drowning the small year, border and symbol clues.
//   HASH_SHARE_WITH_AI: when BOTH clues exist, the art-hash part is multiplied by this (less than 1) because
//     the AI was right more often than the hash; the hash still helps break doubts.
export const AI_WEIGHT = 4;
export const HASH_SHARE_WITH_AI = 0.75;
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

// The two blend weights, so an experiment can try other values (the app just uses the defaults)
export type BlendWeights = { ai: number; hashShare: number };

export function rankCandidates(
  candidates: Candidate[], clues: Clues, weights: BlendWeights = { ai: AI_WEIGHT, hashShare: HASH_SHARE_WITH_AI },
): Ranked {
  const artRead = !!clues.artDistances && clues.artDistances.size > 0;
  const aiRead = !!clues.aiScores && clues.aiScores.size > 0;
  // With both art clues the hash counts for a share of its usual weight; alone it keeps its full weight
  const hashWeight = aiRead ? ART_WEIGHT * weights.hashShare : ART_WEIGHT;
  const symbolRead = !!clues.symbolScores && clues.symbolScores.size > 0;
  const scores = new Map<string, number>();
  for (const c of candidates) {
    let score = 0;
    if (artRead) {
      const distance = clues.artDistances!.get(c.id);
      // A printing with no stored art counts as having art that's nothing like the photo's
      score -= ((distance ?? 256) / 256) * hashWeight;
    }
    if (aiRead) {
      // A printing with no stored AI fingerprint counts as unrelated to the photo (closeness 0)
      score += (clues.aiScores!.get(c.id) ?? 0) * weights.ai;
    }
    const symbolPart = symbolRead ? (clues.symbolScores!.get(c.id) ?? 0) * SYMBOL_WEIGHT : 0;
    if (clues.border) score += c.border === clues.border ? BORDER_WEIGHT : -BORDER_WEIGHT;
    if (clues.years) score += c.year >= clues.years.from && c.year <= clues.years.to ? YEAR_WEIGHT : -YEAR_WEIGHT;
    // The collector number and set read from the card: the one clue that can tell apart printings sharing a picture
    const numberPart = clues.numberScores?.get(c.id) ?? 0;
    scores.set(c.id, score + symbolPart + numberPart);
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
  const ai = clues.aiScores?.get(best.id);
  if (ai !== undefined && aiRead) bits.push(`AI fingerprint ${ai >= 0.8 ? 'matches' : ai >= 0.65 ? 'is close' : 'is far off'} (${Math.round(ai * 100)}% alike)`);
  const numberBonus = clues.numberScores?.get(best.id);
  if (numberBonus !== undefined && numberBonus > 0) bits.push(numberBonus >= 2 ? 'collector number matches' : 'collector number is close');
  const symbol = clues.symbolScores?.get(best.id);
  if (symbol !== undefined && symbolRead) bits.push(`symbol ${Math.round(symbol * 100)}% alike`);
  if (clues.border && best.border === clues.border) bits.push(`${clues.border} border`);
  if (clues.years && best.year >= clues.years.from && best.year <= clues.years.to) bits.push('copyright year fits');
  const why = bits.length ? bits.join('; ') : 'No clue could tell them apart';
  return { ordered, scores, lead, likely: lead >= LIKELY_LEAD, fits, why };
}
