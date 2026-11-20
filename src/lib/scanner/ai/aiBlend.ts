/* =====================================================================
   THE AI CLUE FROM SEVERAL LOOKS AT THE SAME CARD (plain TypeScript; the model and the saved fingerprints
   are handed in, so tests can use made-up ones)
   One look at a card can be blurry or caught in glare, and then the AI's fingerprint of its artwork is a little
   off. In Track mode the camera sees the same card several times while it holds still. This takes the
   look the AI already chose (aiClue.ts) and the earlier looks at that same card, makes a fingerprint of the SAME
   part of each (the same turn and box, so they can be fairly compared), and blends them with the legacy scanner's
   rule (core/viewBlend.ts): sharper and surer looks count more, unsure looks are left out. The blended
   fingerprint is then compared with each printing's saved artwork, exactly as a single look would be.
   A look is "sure" when its closest artwork beats the second closest by a clear margin (confidenceOf). Printings
   that share one artwork have the same score, so they are counted as ONE artwork, or the gap would always be zero.
   If fewer than two looks can be blended, nothing changes and the caller keeps the single-look answer.
   ===================================================================== */

import { ART_BOXES, artTensor, standardCard, type Picture, type Turn } from '../core/modelInput.ts';
import { ViewBlend, confidenceOf, sharpnessOf } from '../core/viewBlend.ts';
import type { AiPrinting, AiTools } from './aiClue.ts';

// An earlier look at the card: a flat upright picture of it, and how sharp that picture is (0 to 1)
export type EarlierLook = { picture: Picture; sharpness: number };

// How alike a photo fingerprint is to each printing's artwork (the nearer of front and back), as id -> number
function scoresOf(photo: Int8Array, printings: AiPrinting[], tools: AiTools): Map<string, number> {
  const scores = new Map<string, number>();
  for (const printing of printings) {
    let closest: number | null = null;
    for (const art of [printing.illus, printing.illusBack]) {
      const value = art ? tools.index.similarityToIllustration(photo, art) : null;
      if (value !== null && (closest === null || value > closest)) closest = value;
    }
    if (closest !== null) scores.set(printing.id, closest);
  }
  return scores;
}

// How sure a set of scores is: the best artwork against the second best DIFFERENT artwork
function confidenceOfScores(scores: Map<string, number>, printings: AiPrinting[]): number {
  const perArt = new Map<string, number>();
  for (const printing of printings) {
    const score = scores.get(printing.id);
    if (score === undefined) continue;
    const art = printing.illus ?? printing.id;
    if (score > (perArt.get(art) ?? -Infinity)) perArt.set(art, score);
  }
  const sorted = [...perArt.values()].sort((a, b) => b - a);
  return sorted.length === 0 ? 0 : confidenceOf(sorted[0], sorted.length > 1 ? sorted[1] : null);
}

// The sharpness of a look's picture (a picture without an alpha channel is not measured: it counts as middling)
const sharpnessOfPicture = (picture: Picture): number =>
  picture.channels === 3 ? 0.5 : sharpnessOf({ data: picture.data, width: picture.width, height: picture.height });

// The scores for each printing from the blend of the chosen look and the earlier looks, or null when fewer than two
// looks could be blended (the caller then keeps the single-look scores).
// "chosen" is what aiClue.ts settled on: its photo fingerprint, the picture it came from, and which turn and box it used.
export async function blendedScores(
  chosen: { photo: Int8Array; picture: Picture; turn: Turn; box: string },
  earlier: EarlierLook[],
  printings: AiPrinting[],
  tools: AiTools,
): Promise<Map<string, number> | null> {
  const blend = new ViewBlend();
  // The earlier looks first (oldest first), then the chosen look as the newest
  for (const look of earlier) {
    try {
      const photo = tools.index.shrink(await tools.embed(artTensor(standardCard(look.picture, chosen.turn), ART_BOXES[chosen.box])));
      blend.add(photo, look.sharpness, confidenceOfScores(scoresOf(photo, printings, tools), printings));
    } catch {
      /* one look failing only means it is left out */
    }
  }
  blend.add(chosen.photo, sharpnessOfPicture(chosen.picture), confidenceOfScores(scoresOf(chosen.photo, printings, tools), printings));
  if (blend.count < 2 || !blend.blended) return null;
  // Back to the saved files' kind of fingerprint: whole numbers from -127 to 127
  const mixed = Int8Array.from(blend.blended, (v) => Math.round(v * 127));
  const scores = scoresOf(mixed, printings, tools);
  return scores.size > 0 ? scores : null;
}
