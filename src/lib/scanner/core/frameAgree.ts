/* =====================================================================
   DO TWO LOOKS AT THE CARD AGREE? (shared, plain TypeScript, no React)
   In Auto scan the camera looks at the card again and again. A card that is
   still sliding into the guide, or blurred, or caught in glare for a moment, can
   be read wrongly. So the camera waits until two looks IN A ROW read the same
   title before it scans the card. A steady card passes at once (the second
   look comes a fraction of a second after the first); a moving or blurry one
   is skipped and tried again.
   "Agree" doesn't mean letter-for-letter: the text reader can wobble by a
   letter between two photos of the very same card, so names that are nearly
   identical count as the same.
   ===================================================================== */

import { similarity } from './fuzzy.ts';
import { normalizeName } from './text.ts';

// How alike two readings of a title must be to count as the same card (0 to 1; 1 is identical)
export const AGREE_AT = 0.85;

// True when the two title readings are the same card's title. An empty reading never agrees with anything.
export function titlesAgree(a: string, b: string): boolean {
  const first = normalizeName(a);
  const second = normalizeName(b);
  if (!first || !second) return false;
  return similarity(first, second) >= AGREE_AT;
}
