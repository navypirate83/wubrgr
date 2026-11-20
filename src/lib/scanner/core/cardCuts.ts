/* =====================================================================
   CHOOSING BETWEEN SEVERAL CUT-OUTS OF A CARD (shared, plain TypeScript, no libraries)
   The card finders give the four corners of "the card", but on real photos they are often a little wrong
   in two known ways:
     1. THE BORDER IS MISSED. A black-bordered card in a dark sleeve, or on a dark mat, has no clear line
        between its border and what is around it, so the finder stops at the coloured frame INSIDE the
        border. The cut-out then has no bottom strip, and that strip is where the collector number is.
     2. A BOX INSIDE THE CARD IS TAKEN FOR THE CARD (the text box or the artwork), often sideways.
   The cure for both is the same: make more than one cut-out, read each, and keep the one whose text makes
   sense. This file holds the two small pieces of that which need no camera or text reader:
     - widenToWholeCard: from corners that sit on the inner frame, work out where the whole card's corners are
       (a modern card's border is a known share of the card on each side);
     - readingScore: how much sense a read makes, so the cut-outs can be compared and the trying can stop early.
       Two things are strong signs that the cut-out really is the card, the right way up: the title is a real
       card's name (matched closely, not loosely: junk text often looks a little like SOME name), and the info
       line's set code and collector number are a printing that exists.
   The camera (ScannerCamera.web.tsx) does the cutting and reading.
   ===================================================================== */

import type { Point, Quad } from './perspective.ts';

// How thick a modern card's border is, as shares of the WHOLE card's width (left, right) and height (top, bottom).
// Measured on Scryfall scans of the 2015 frame: the coloured frame starts about 4% in from each side and 3% down
// from the top, and stops about 7% above the bottom edge (the black strip there holds the collector number).
export const BORDER = { left: 0.04, right: 0.04, top: 0.03, bottom: 0.07 } as const;

// A point part of the way from a to b ("share" may be below 0 or above 1: that is past the ends)
const along = (a: Point, b: Point, share: number): Point => ({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share });

// The whole card's corners, given corners that sit on the frame just inside its border.
// The corners are in the order top-left, top-right, bottom-right, bottom-left of the upright card (any units).
export function widenToWholeCard(inner: Quad): Quad {
  const [tl, tr, br, bl] = inner;
  // The inner frame covers this much of the card across and down
  const across = 1 - BORDER.left - BORDER.right;
  const down = 1 - BORDER.top - BORDER.bottom;
  // How far past each end to go, as a share of the inner frame's own width or height
  const left = -BORDER.left / across, right = 1 + BORDER.right / across;
  const top = -BORDER.top / down, bottom = 1 + BORDER.bottom / down;
  // First stretch the left and right sides up and down, then stretch the new top and bottom sides outward
  const leftTop = along(tl, bl, top), leftBottom = along(tl, bl, bottom);
  const rightTop = along(tr, br, top), rightBottom = along(tr, br, bottom);
  return [along(leftTop, rightTop, left), along(leftTop, rightTop, right), along(leftBottom, rightBottom, right), along(leftBottom, rightBottom, left)];
}

// What was learned from one read, for scoring it
export type ReadSigns = {
  name: 'real' | 'partly' | 'no';   // the title: a real card's name matched closely, matched only partly (some letters lost), or not at all
  printingExists: boolean;          // the set code and collector number together are a printing in the catalogue
  setIsReal: boolean;               // the set code is a real set's
  numberWasRead: boolean;           // some collector number was read
};

// How much sense a read of one cut-out makes (0 to 5):
//   2 for a real card's name in the title (matched closely), or 1 for a name matched only partly,
//   2 for a set code and collector number that are a real printing,
//   and, ONLY when there is already one of those signs, half a point each for a real set code and for a collector number
//   (alone they prove nothing: junk text often has some digits in it, and a short junk word can be a set code by chance).
export function readingScore(signs: ReadSigns): number {
  const strong = (signs.name === 'real' ? 2 : signs.name === 'partly' ? 1 : 0) + (signs.printingExists ? 2 : 0);
  if (strong === 0) return 0;
  return strong + (signs.setIsReal ? 0.5 : 0) + (signs.numberWasRead ? 0.5 : 0);
}

// A read with both strong signs: nothing more to gain from trying another cut-out
export const FULL_SCORE = 4;
// A read with one strong sign: the card has been found, so there is no need to look for it somewhere else in the picture
export const FOUND_SCORE = 2;
