/* =====================================================================
   READING THE ARTWORK AND SET SYMBOL CLUES FROM A PHOTO (shared, plain TypeScript)
   When the info line can't be read (older cards), the scanner knows the card's NAME and so every
   printing it could be. Two things in the photo tell those printings apart:
     - the ARTWORK: each printing's art has a stored fingerprint (see phash.ts). Different artwork
       gives a very different fingerprint, and the photo's art matches the right one closely.
     - the SET SYMBOL: a small picture at the right end of the type line, which says which set.
   The trick that makes both work well: each frame design (1993, 1997, 2003, 2015) puts the art and
   the symbol in a slightly different place, and the catalogue says which design each printing has. So
   each candidate printing is judged using the crop for ITS OWN frame, not one crop for every card.
   (Testing on real scans: one crop for everything had the art about 60 bits off the stored fingerprint,
   and the right set symbol came first only about 1 time in 7; per-era crops brought the art to
   about 15 to 25 bits off.)
   The camera takes just ONE picture of the art area and ONE of the symbol area (see scannerTypes.ts);
   this file cuts them up. Nothing here belongs to only one platform.
   Value imports in the core files end in ".ts" so the checks can run them directly with Node.
   ===================================================================== */

import { ART_BY_ERA, ART_REGION, ART_SHIFT_STEPS, SYMBOL_OFFSETS, SYMBOL_REGION, SYMBOL_SPOT } from './scannerTypes.ts';
import type { Box, Era, GrayPicture, ScanExtras } from './scannerTypes.ts';
import { artHash, hammingDistance } from './phash.ts';
import { invertSymbol, normalizeSymbol, overlapOfNormalized, symbolBitsFromGray } from './symbolMatch.ts';

// A part of a picture, given as a box in "shares of the card" (0 to 1) when the picture itself covers "region"
// of the card. Null if the part is too small to use.
export function subPicture(picture: GrayPicture, region: Box, box: Box): GrayPicture | null {
  const across = region[2] - region[0];
  const down = region[3] - region[1];
  const x0 = Math.max(0, Math.round(((box[0] - region[0]) / across) * picture.width));
  const y0 = Math.max(0, Math.round(((box[1] - region[1]) / down) * picture.height));
  const x1 = Math.min(picture.width, Math.round(((box[2] - region[0]) / across) * picture.width));
  const y1 = Math.min(picture.height, Math.round(((box[3] - region[1]) / down) * picture.height));
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < 4 || height < 4) return null;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (y0 + y) * picture.width + x0;
    data.set(picture.data.subarray(from, from + width), y * width);
  }
  return { data, width, height };
}

// The fingerprints of one era's art box, cut out a few slightly different ways from the art picture: moved a bit
// in each direction (the card is never lined up exactly, and a fingerprint is sensitive to that)
export function eraArtHashes(artRegion: GrayPicture, era: Era): Uint8Array[] {
  const box = ART_BY_ERA[era];
  const hashes: Uint8Array[] = [];
  for (const dx of ART_SHIFT_STEPS) {
    for (const dy of ART_SHIFT_STEPS) {
      const part = subPicture(artRegion, ART_REGION, [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy]);
      if (part) hashes.push(artHash(part.data, part.width, part.height));
    }
  }
  return hashes;
}

// The symbol area cut into small windows around where the symbol should be, each as a normalized black-and-white
// symbol, both ways round. (Empty windows, with no symbol in them, are left out.)
export function symbolWindows(symbolRegion: GrayPicture): Uint8Array[] {
  const windows: Uint8Array[] = [];
  for (const dx of SYMBOL_OFFSETS.x) {
    for (const dy of SYMBOL_OFFSETS.y) {
      const x = SYMBOL_SPOT.x + dx;
      const y = SYMBOL_SPOT.y + dy;
      const part = subPicture(symbolRegion, SYMBOL_REGION, [x - SYMBOL_SPOT.width / 2, y - SYMBOL_SPOT.height / 2, x + SYMBOL_SPOT.width / 2, y + SYMBOL_SPOT.height / 2]);
      const bits = part && symbolBitsFromGray(part.data, part.width, part.height);
      if (bits) windows.push(normalizeSymbol(bits), normalizeSymbol(invertSymbol(bits)));
    }
  }
  return windows;
}

export type PhotoClues = {
  // How many bits the photo's art is from these stored fingerprints, with the crop for this frame era
  // (the closest of the printing's faces). Null if the photo has no art picture.
  artDistance(era: Era, stored: Uint8Array[]): number | null;
  // How much the photo's symbol overlaps a set's stored symbol, 0 to 1. Null if the photo has no symbol picture.
  symbolOverlap(setSymbol: Uint8Array): number | null;
};

// Ready the clues from what the camera read. The slower parts (fingerprints per era, the symbol windows)
// are worked out the first time they're asked for, and kept.
export function photoClues(extras: ScanExtras | undefined): PhotoClues {
  const art = extras?.artRegion ?? null;
  const symbolPicture = extras?.symbolRegion ?? null;
  const byEra = new Map<Era, Uint8Array[]>();
  let windows: Uint8Array[] | null = null;
  const theWindows = () => (windows ??= symbolPicture ? symbolWindows(symbolPicture) : []);
  // A stored symbol is normalized once, however many windows it's compared against
  const normalizedStored = new WeakMap<Uint8Array, Uint8Array>();
  return {
    artDistance(era, stored) {
      if (!art || stored.length === 0) return null;
      if (!byEra.has(era)) byEra.set(era, eraArtHashes(art, era));
      let best = Infinity;
      for (const hash of byEra.get(era)!) for (const other of stored) best = Math.min(best, hammingDistance(hash, other));
      return best === Infinity ? null : best;
    },
    symbolOverlap(setSymbol) {
      if (!symbolPicture) return null;
      let reference = normalizedStored.get(setSymbol);
      if (!reference) { reference = normalizeSymbol(setSymbol); normalizedStored.set(setSymbol, reference); }
      let best = 0;
      for (const window of theWindows()) best = Math.max(best, overlapOfNormalized(window, reference));
      return best;
    },
  };
}
