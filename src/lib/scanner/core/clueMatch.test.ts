/* =====================================================================
   CHECKS FOR READING THE ARTWORK AND SET SYMBOL CLUES
   Run with:  node --test src/lib/scanner/core/clueMatch.test.ts
   Pretend cards are drawn as grey pictures with the art and symbol where each frame era puts them, so we know
   the right answers: the art should be closest to its own fingerprint with the crop for its own era, and the
   symbol should match its own set's symbol, dark on light or light on dark.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { photoClues, subPicture } from './clueMatch.ts';
import { artHash } from './phash.ts';
import { symbolBitsFromGray } from './symbolMatch.ts';
import { ART_BY_ERA, ART_REGION, SYMBOL_REGION, SYMBOL_SPOT, type GrayPicture } from './scannerTypes.ts';

// A pretend card photo: 500 x 700 grey pixels
const W = 500;
const H = 700;
const card = (fill = 200): GrayPicture => ({ data: new Uint8Array(W * H).fill(fill), width: W, height: H });

// Paint a made-up "artwork" into a box of the card: a mix of several smooth waves, a different mix for each
// "seed" (so it has structure all over, like a real picture, rather than one tidy pattern)
function paintArt(picture: GrayPicture, box: readonly number[], seed: number) {
  const [x0, y0, x1, y1] = [box[0] * W, box[1] * H, box[2] * W, box[3] * H].map(Math.round);
  let state = seed * 7919 + 13;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const waves = Array.from({ length: 9 }, () => ({ fx: 1 + random() * 7, fy: 1 + random() * 7, px: random() * 6.28, py: random() * 6.28, amp: 15 + random() * 20 }));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const u = (x - x0) / (x1 - x0);
      const v = (y - y0) / (y1 - y0);
      let value = 128;
      for (const w of waves) value += w.amp * Math.sin(u * w.fx + w.px) * Math.cos(v * w.fy + w.py);
      picture.data[y * W + x] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
}

// Cut one box (shares of the card) out of a card picture, the way the camera cuts a region
const regionOf = (picture: GrayPicture, box: readonly number[]): GrayPicture => subPicture(picture, [0, 0, 1, 1], box as [number, number, number, number])!;

test('a box is cut out of a region where it should be', () => {
  // A picture of the whole card where each pixel's value is its column / 2, so the cut shows where it started
  const gradient: GrayPicture = { data: new Uint8Array(W * H).map((_, i) => (i % W) / 2), width: W, height: H };
  const part = subPicture(gradient, [0, 0, 1, 1], [0.5, 0.25, 0.75, 0.5])!;
  assert.equal(part.width, 125);
  assert.equal(part.height, 175);
  assert.equal(part.data[0], 125);                       // column 250, halved
  // Boxes too small to use give nothing
  assert.equal(subPicture(gradient, [0, 0, 1, 1], [0.5, 0.5, 0.505, 0.505]), null);
});

test('the art is closest to its own fingerprint, with the crop for its own era', () => {
  const photo = card();
  paintArt(photo, ART_BY_ERA['2003'], 5);
  const artRegion = regionOf(photo, ART_REGION);
  const stored = artHash(...(([p]) => [p.data, p.width, p.height] as const)([regionOf(photo, ART_BY_ERA['2003'])]));
  const clues = photoClues({ artRegion });
  const right = clues.artDistance('2003', [stored])!;
  assert.ok(right <= 20, `own era: ${right}`);
  // Another artwork's fingerprint is far away
  const otherPhoto = card();
  paintArt(otherPhoto, ART_BY_ERA['2003'], 11);
  const other = artHash(...(([p]) => [p.data, p.width, p.height] as const)([regionOf(otherPhoto, ART_BY_ERA['2003'])]));
  assert.ok(clues.artDistance('2003', [other])! > right + 30, `other art: ${clues.artDistance('2003', [other])}`);
  // The art cut with a different era's box is further from the stored fingerprint than with its own era's
  assert.ok(clues.artDistance('1993', [stored])! > right, `wrong era: ${clues.artDistance('1993', [stored])} vs ${right}`);
  // A card lined up a little off is still found (the shifted crops cover it)
  const nudged = card();
  paintArt(nudged, [ART_BY_ERA['2003'][0] + 0.02, ART_BY_ERA['2003'][1] - 0.02, ART_BY_ERA['2003'][2] + 0.02, ART_BY_ERA['2003'][3] - 0.02], 5);
  const nudgedDistance = photoClues({ artRegion: regionOf(nudged, ART_REGION) }).artDistance('2003', [stored])!;
  assert.ok(nudgedDistance < clues.artDistance('2003', [other])! - 10, `nudged ${nudgedDistance}`);
  // No art picture, or no stored fingerprints: nothing to say
  assert.equal(photoClues({}).artDistance('2003', [stored]), null);
  assert.equal(clues.artDistance('2003', []), null);
});

// A set symbol drawn at the symbol spot: "circle" or "cross", dark on a light frame or light on a dark one
function paintSymbol(picture: GrayPicture, kind: 'circle' | 'cross', symbolColour: number) {
  const cx = SYMBOL_SPOT.x * W;
  const cy = SYMBOL_SPOT.y * H;
  const half = SYMBOL_SPOT.height * H * 0.4;
  for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const hit = kind === 'circle' ? dx * dx + dy * dy <= half * half : Math.abs(dx) < half * 0.3 || Math.abs(dy) < half * 0.3;
      if (hit) picture.data[y * W + x] = symbolColour;
    }
  }
}
// The stored version of a symbol: a clean black-on-white drawing turned into the 64 x 64 bitmap the catalogue holds
function stored(kind: 'circle' | 'cross'): Uint8Array {
  const size = 80;
  const gray = new Uint8Array(size * size).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const hit = kind === 'circle' ? dx * dx + dy * dy <= 30 * 30 : Math.abs(dx) < 10 || Math.abs(dy) < 10;
      if (hit) gray[y * size + x] = 0;
    }
  }
  return symbolBitsFromGray(gray, size, size)!;
}

test('the symbol matches its own set, dark on light or light on dark', () => {
  for (const [frame, symbolColour] of [[210, 40], [40, 220]] as const) {
    const photo = card(frame);
    paintSymbol(photo, 'circle', symbolColour);
    const clues = photoClues({ symbolRegion: regionOf(photo, SYMBOL_REGION) });
    const circle = clues.symbolOverlap(stored('circle'))!;
    const cross = clues.symbolOverlap(stored('cross'))!;
    assert.ok(circle > 0.7, `circle on ${frame}: ${circle}`);
    assert.ok(cross < circle - 0.2, `cross ${cross} vs circle ${circle}`);
  }
});

test('a symbol that is a little off the usual spot is still found', () => {
  const photo = card(210);
  const shifted = { ...SYMBOL_SPOT, x: SYMBOL_SPOT.x + 0.02, y: SYMBOL_SPOT.y - 0.012 };
  // Draw it by moving the spot for a moment
  const cx = shifted.x * W;
  const cy = shifted.y * H;
  const half = SYMBOL_SPOT.height * H * 0.4;
  for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= half * half) photo.data[y * W + x] = 40;
  const clues = photoClues({ symbolRegion: regionOf(photo, SYMBOL_REGION) });
  assert.ok(clues.symbolOverlap(stored('circle'))! > 0.6);
});

test('a blank symbol area matches nothing, and no picture means nothing is known', () => {
  const blank = photoClues({ symbolRegion: regionOf(card(210), SYMBOL_REGION) });
  assert.equal(blank.symbolOverlap(stored('circle')), 0);
  assert.equal(photoClues({}).symbolOverlap(stored('circle')), null);
});
