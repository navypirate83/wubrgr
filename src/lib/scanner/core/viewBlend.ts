/* =====================================================================
   BLENDING SEVERAL LOOKS AT ONE CARD (shared, plain TypeScript, no imports)
   A single camera frame can be blurry, caught in glare or taken mid-wobble. The legacy card scanner
   does not trust one frame: for each followed card it keeps the last few "fingerprints" (a fingerprint
   is the list of numbers the AI makes from a picture of the card), gives each one a weight for how
   sharp the picture was and how sure the match was, and blends them into one steadier fingerprint.
   Only that blend is used to name the card. This file is that idea, ported from the legacy scanner's
   MECHANICS.md (section 5). Each number says whether it was READ from the original Android app
   ("original") or is a choice of the legacy copy ("copy").
   In plain words:
     - sharpnessOf: how crisp a flat card picture is, 0 (very blurry) up to nearly 1 (crisp).
     - confidenceOf: how clearly the best match beats the second best (0.5 = a tie, near 1 = a clear win).
     - ViewBlend: keeps the newest 10 good views, then gives their weighted average, scaled to length 1.
   It works on any list of numbers, so it does not care which AI model made them.
   ===================================================================== */

import type { RgbaPicture } from './perspective.ts';

// Original: only views whose match confidence is at least this are blended in
export const BLEND_MIN_CONFIDENCE = 0.6;
// Original: each card keeps this many of its newest views
export const BLEND_MAX_VIEWS = 10;
// Original: confidence = 1 / (1 + e^(-(best - second) / 0.02)); this is the 0.02
export const CONFIDENCE_TEMPERATURE = 0.02;
// Copy: how fast sharpness grows with the picture's detail (v / (v + 150))
const SHARPNESS_HALF = 150;

// How sharp a flat card picture is: from 0 (very blurry) to nearly 1 (crisp). It measures how much the
// brightness jumps between neighbouring pixels (the variance of the "Laplacian", a way to spot fine detail).
export function sharpnessOf(card: RgbaPicture): number {
  const { data, width, height } = card;
  if (width < 3 || height < 3) return 0;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = y * width + x;
      const lap = 4 * grey[at] - grey[at - 1] - grey[at + 1] - grey[at - width] - grey[at + width];
      sum += lap;
      sumSquares += lap * lap;
      count++;
    }
  }
  const variance = Math.max(0, sumSquares / count - (sum / count) ** 2);
  return variance / (variance + SHARPNESS_HALF);
}

// How sure we are of the best match, from how far it beats the second best (both are similarities, -1 to 1).
// A tie gives 0.5. With only one result there is nothing to compare, so it is 0.5 as well (original).
export function confidenceOf(best: number, second: number | null): number {
  if (second === null) return 0.5;
  return 1 / (1 + Math.exp(-(best - second) / CONFIDENCE_TEMPERATURE));
}

// Scale a list of numbers so its length (the square root of the sum of squares) is 1. Returns false for an empty list.
function toLengthOne(values: number[]): boolean {
  const length = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (length < 1e-6) return false;
  for (let i = 0; i < values.length; i++) values[i] /= length;
  return true;
}

// The last few good looks at ONE card, and their blend
export class ViewBlend {
  // The kept fingerprints, oldest first, each with its weight
  private views: { fingerprint: number[]; weight: number }[] = [];
  // The current blend (null until a good view has been added)
  blended: number[] | null = null;

  // Add one look. "sharpness" is 0..1 (sharpnessOf) and "confidence" is 0..1 (confidenceOf).
  // Returns true when the look was used; a look the scanner isn't sure about is ignored.
  add(fingerprint: ArrayLike<number>, sharpness: number, confidence: number): boolean {
    if (confidence < BLEND_MIN_CONFIDENCE) return false;
    const weight = sharpness * confidence;
    if (!(weight > 0)) return false;
    this.views.push({ fingerprint: Array.from(fingerprint), weight });
    while (this.views.length > BLEND_MAX_VIEWS) this.views.shift();
    // The weighted average of the kept fingerprints, then scaled to length 1
    const mixed = new Array<number>(this.views[0].fingerprint.length).fill(0);
    let total = 0;
    for (const view of this.views) {
      for (let i = 0; i < mixed.length; i++) mixed[i] += view.fingerprint[i] * view.weight;
      total += view.weight;
    }
    for (let i = 0; i < mixed.length; i++) mixed[i] /= total;
    this.blended = toLengthOne(mixed) ? mixed : null;
    return this.blended !== null;
  }

  // How many looks are being blended
  get count(): number {
    return this.views.length;
  }

  // Start again (the card was taken away)
  clear(): void {
    this.views = [];
    this.blended = null;
  }
}
