/* =====================================================================
   THE AI CLUE: HOW ALIKE IS THE PHOTO'S ART TO EACH PRINTING'S ART?
   (plain TypeScript; the model and the saved fingerprints are handed in, so
   tests can use made-up ones)
   Once the scanner has the card's name and a list of its printings, this
   works out one number per printing: how close the artwork in the photo is
   to that printing's saved artwork fingerprint (1 = the same, near 0 =
   unrelated). rankCandidates (core/rank.ts) blends that into the score.
   The steps, like the test script (scripts/catalogue/embed/real-photos-test.mjs):
     1. You hand over one or more straightened card pictures: the card found
        by the outline finder (and its "larger" twin), and the plain crop the
        camera made. We don't know which one is the real card, so all are tried.
     2. For each picture, the card is used upright and upside down (0 and 180
        degrees; the pictures are already upright-ish, so sideways is not tried).
     3. For each, the art is cut out with the art box of each frame era among
        the printings (an old card's art is in a slightly different place than a
        modern one's), plus the "whole card" box for full-art cards.
     4. Each cut-out goes through the model once (kept, so no cut-out is ever
        done twice for the same photo) and is compared with every printing's
        saved artwork.
     5. The picture / turn / box whose best printing is the closest is the one
        believed (the app can't know which is right, so it takes the most
        convincing), and ITS closeness numbers are the clue.
   A printing with no saved fingerprint is left out (the ranking then treats it
   as unrelated). If nothing could be compared at all, the answer is null and the
   scanner goes on without the AI clue.
   ===================================================================== */

import { eraOf } from '../core/scannerTypes.ts';
import { ART_BOXES, artTensor, standardCard, type Picture, type Turn } from '../core/modelInput.ts';
import type { AiIndex } from './aiIndex.ts';

// What is needed to know about each printing
export type AiPrinting = { id: string; illus?: string | null; illusBack?: string | null; frame: string };

// What is handed in to do the work
export type AiTools = {
  embed(tensor: Float32Array): Promise<Float32Array>;   // the model: tensor in, 768 numbers out
  index: Pick<AiIndex, 'shrink' | 'similarityToIllustration'>;
};

// Only these two turns are tried: the pictures come from the card finders already upright
const TURNS_TRIED: Turn[] = [0, 180];

// Fingerprints already made, per photo (the list of pictures), so asking again for the same photo
// (the scanner may look at one card twice) never runs the model again for a cut-out it has done
const made = new WeakMap<object, Map<string, Promise<Float32Array>>>();

// The closeness of the photo to each printing, as the printing's id -> a number (null: nothing to go on)
export async function aiScoresFor(pictures: Picture[], printings: AiPrinting[], tools: AiTools): Promise<Map<string, number> | null> {
  if (pictures.length === 0 || printings.length === 0) return null;
  // The boxes worth trying: each era's box among these printings, and the whole card
  const boxNames = [...new Set([...printings.map((p) => eraOf(p.frame)), 'full'])];
  const cache = made.get(pictures) ?? new Map<string, Promise<Float32Array>>();
  made.set(pictures, cache);

  let best: { score: number; scores: Map<string, number> } | null = null;
  for (let pictureAt = 0; pictureAt < pictures.length; pictureAt++) {
    for (const turn of TURNS_TRIED) {
      // The card made the standard size and upright (only when a box needs it: cut-outs below share it)
      let upright: ReturnType<typeof standardCard> | null = null;
      for (const boxName of boxNames) {
        const key = `${pictureAt}:${turn}:${boxName}`;
        if (!cache.has(key)) {
          upright ??= standardCard(pictures[pictureAt], turn);
          cache.set(key, tools.embed(artTensor(upright, ART_BOXES[boxName])));
        }
        const photo = tools.index.shrink(await cache.get(key)!);
        // How close this cut-out is to each printing (the nearer of its front and back artwork)
        const scores = new Map<string, number>();
        let top = -Infinity;
        for (const printing of printings) {
          let closest: number | null = null;
          for (const art of [printing.illus, printing.illusBack]) {
            const value = art ? tools.index.similarityToIllustration(photo, art) : null;
            if (value !== null && (closest === null || value > closest)) closest = value;
          }
          if (closest === null) continue;
          scores.set(printing.id, closest);
          if (closest > top) top = closest;
        }
        if (scores.size > 0 && (!best || top > best.score)) best = { score: top, scores };
      }
    }
  }
  return best ? best.scores : null;
}
