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
        camera made (always the LAST one). We don't know which one is the real card.
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
   FEWER MODEL RUNS (the model is the slow part: about 18 runs for a card with 3 eras, if every
   combination were tried). The combinations are tried in the order most likely to be right, and the
   search STOPS as soon as one of them is clearly strong (its best printing is at least STRONG_MATCH
   alike), because a clearly strong match is already the answer the full search would have chosen:
     a. FIRST LOOK: for each picture (the outline finder's best one, then the camera's own crop, then
        any others), upright and then upside down, only the most likely box is cut out (the frame era
        that most of the printings have). That is at most 2 x 3 = 6 runs, and usually 1 or 2: the right
        card, the right way up, is a clearly strong match straight away.
     b. If nothing was strong, the other boxes are tried, starting with the picture and turn that
        looked best in the first look (whole-card box last), but only for pictures and turns that
        did not look far worse than the best one (SECOND_LOOK_WINDOW): an upside-down card never
        turns out to be the answer when the right way up looked much better.
     c. If nothing is ever strong, everything has been tried and the closest one is used, exactly as before.
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

// How alike (cosine closeness, -1 to 1) a cut-out's best printing must be for the search to stop there.
// WHERE IT COMES FROM: it is the same line rank.ts uses to call an AI closeness "matches" (0.8 and up). On the 32 real
// phone photos (scripts/catalogue/embed/ai-fewer-runs.mjs) the top artwork never changed for any stopping level from 0.6
// to 0.9 (19 of 19 photos whose card has several artworks, 10 of 10 right where the right printing is known), so 0.8 sits
// well inside the safe range while still cutting the runs from 13.6 to 7.5 on average. Re-check with more photos.
export const STRONG_MATCH = 0.8;

// After the first look, only pictures/turns whose first look scored within this of the best first look get their other
// boxes tried. On the same photos the picture and turn the full search finally chose was never more than 0.06 behind
// the best first look (and was the best one for 18 of 19), so 0.2 leaves plenty of room.
export const SECOND_LOOK_WINDOW = 0.2;

// Fingerprints already made, per photo (the list of pictures), so asking again for the same photo
// (the scanner may look at one card twice) never runs the model again for a cut-out it has done
const made = new WeakMap<object, Map<string, Promise<Float32Array>>>();

// What can be adjusted (the app uses the defaults; tests and the experiment script use the rest)
export type AiClueOptions = {
  stopAt?: number;                                                       // stop at the first cut-out this alike (Infinity: try everything)
  window?: number;                                                       // after the first look, only dig further into pictures/turns whose first look was within this of the best first look (Infinity: all)
  onTry?: (tried: { picture: number; turn: Turn; box: string; top: number }) => void;   // told about every cut-out looked at
};

// The order the pictures are tried in: the outline finder's best one first, then the camera's own crop
// (always the last picture), then any others (the finder's "larger" one)
export function pictureOrder(count: number): number[] {
  const order = [0];
  if (count > 1) order.push(count - 1);
  for (let at = 1; at < count - 1; at++) order.push(at);
  return order;
}

// The boxes worth trying, most likely first: the frame era most of the printings have, then the other eras,
// and the whole card last (it is only needed for full-art cards). Eras with equally many printings keep the
// order they are first met in.
export function boxOrder(printings: AiPrinting[]): string[] {
  const howMany = new Map<string, number>();
  for (const p of printings) howMany.set(eraOf(p.frame), (howMany.get(eraOf(p.frame)) ?? 0) + 1);
  const eras = [...howMany.keys()].sort((a, b) => howMany.get(b)! - howMany.get(a)!);
  return [...eras.filter((era) => era !== 'full'), 'full'];
}

// The closeness of the photo to each printing, as the printing's id -> a number (null: nothing to go on)
export async function aiScoresFor(pictures: Picture[], printings: AiPrinting[], tools: AiTools, options: AiClueOptions = {}): Promise<Map<string, number> | null> {
  if (pictures.length === 0 || printings.length === 0) return null;
  const stopAt = options.stopAt ?? STRONG_MATCH;
  const window = options.window ?? SECOND_LOOK_WINDOW;
  const boxNames = boxOrder(printings);
  const cache = made.get(pictures) ?? new Map<string, Promise<Float32Array>>();
  made.set(pictures, cache);
  // The straightened card for each picture and turn, made only when a box needs it and then shared
  const uprights = new Map<string, ReturnType<typeof standardCard>>();

  let best: { score: number; scores: Map<string, number> } | null = null;
  // Look at one cut-out: run the model if this one hasn't been done, compare with every printing, and
  // remember it if it is the closest so far. Gives back how alike its best printing was.
  const tryOne = async (pictureAt: number, turn: Turn, boxName: string): Promise<number> => {
    const key = `${pictureAt}:${turn}:${boxName}`;
    if (!cache.has(key)) {
      const cardKey = `${pictureAt}:${turn}`;
      if (!uprights.has(cardKey)) uprights.set(cardKey, standardCard(pictures[pictureAt], turn));
      cache.set(key, tools.embed(artTensor(uprights.get(cardKey)!, ART_BOXES[boxName])));
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
    if (scores.size === 0) return -Infinity;
    options.onTry?.({ picture: pictureAt, turn, box: boxName, top });
    if (!best || top > best.score) best = { score: top, scores };
    return top;
  };

  // A. The first look: only the most likely box, for each picture and turn
  const looked: { pictureAt: number; turn: Turn; top: number }[] = [];
  for (const pictureAt of pictureOrder(pictures.length)) {
    for (const turn of TURNS_TRIED) {
      const top = await tryOne(pictureAt, turn, boxNames[0]);
      if (top >= stopAt) return best!.scores;
      looked.push({ pictureAt, turn, top });
    }
  }
  // B. The other boxes, starting with the picture and turn that looked best (the sort keeps the earlier one when equal)
  const promising = [...looked].sort((a, b) => b.top - a.top).filter((l) => l.top >= looked.reduce((m, x) => Math.max(m, x.top), -Infinity) - window);
  for (const { pictureAt, turn } of promising) {
    for (const boxName of boxNames.slice(1)) {
      if ((await tryOne(pictureAt, turn, boxName)) >= stopAt) return best!.scores;
    }
  }
  return best ? (best as { scores: Map<string, number> }).scores : null;
}
