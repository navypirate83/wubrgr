/* =====================================================================
   IS THE AI WORTH RUNNING FOR THIS CARD? (shared, plain TypeScript, no imports)
   The AI art matching is slow (it runs a model on the photo). It only helps when two things are true:
     1. The card has printings with DIFFERENT artwork. The AI only compares artwork, so printings
        that share one picture (a reprint in another set, a foil and a non-foil) all get exactly the
        same AI score, and the AI can never put one ahead of another.
     2. The art hash (the quick, cheap artwork check the scanner already did) has NOT already settled
        which artwork it is. If the best artwork is far ahead of every other artwork, the AI would only
        confirm it.
   scanResolve.ts asks this BEFORE any of the slow work (finding the card for the AI, running the model).
   HOW FAR AHEAD IS "FAR ENOUGH" (AI_SKIP_LEAD): measured on the 32 real phone photos with
   scripts/catalogue/embed/ai-fewer-runs.mjs, ranking with the art hash only. Where the hash's best
   artwork was right, the lead over the best other artwork was 1.13, 0.82, 0.77 (3 photos), 0.47, 0.26,
   0.16, 0.14, 0.00 and 0.00 (the others); where it was wrong, 0.05. So any bar between 0.14 and 0.77
   separates the groups; 0.5 is chosen: twice the 0.25 that rank.ts already needs for "likely" (right 96% to
   100% of the time in every earlier test), and above every right-but-unsure photo. With only 10
   photos with a known answer this is a sensible bar, not a proven one: re-check with more photos.
   Skipping the AI never changes the order of printings that share one artwork (the AI could not have
   changed it), and when it is skipped for a decisive lead the answer is the same one the art hash gave.
   ===================================================================== */

// How far ahead (in ranking points) the best artwork must be of the best OTHER artwork to skip the AI
export const AI_SKIP_LEAD = 0.5;

// What is needed to know about each printing: its id and a key for its artwork (printings with the same
// key look the same to the AI; give each printing with no artwork information a key of its own)
export type ArtKeyed = { id: string; art: string };

// How far ahead the best-scoring printing is of the best-scoring printing with DIFFERENT artwork
// (Infinity if every printing has the same artwork)
export function artworkLead(printings: readonly ArtKeyed[], scores: ReadonlyMap<string, number>): number {
  let best: ArtKeyed | null = null;
  for (const p of printings) if (!best || (scores.get(p.id) ?? -Infinity) > (scores.get(best.id) ?? -Infinity)) best = p;
  if (!best) return Infinity;
  let rival = -Infinity;
  for (const p of printings) if (p.art !== best.art) rival = Math.max(rival, scores.get(p.id) ?? -Infinity);
  return rival === -Infinity ? Infinity : (scores.get(best.id) ?? 0) - rival;
}

// Should the AI run? "scores" are the ranking scores worked out WITHOUT the AI.
export function aiIsNeeded(printings: readonly ArtKeyed[], scores: ReadonlyMap<string, number>): boolean {
  // Only one artwork among the printings: the AI cannot tell them apart
  if (new Set(printings.map((p) => p.art)).size < 2) return false;
  // The art hash (with the other clues) already puts one artwork far ahead of all the others
  return artworkLead(printings, scores) < AI_SKIP_LEAD;
}
