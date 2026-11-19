/* =====================================================================
   HAS THE PICTURE CHANGED? (shared, plain TypeScript, no imports)
   Reading the text on a card is the slow part of a scan. When the camera looks
   at the very same scene again (the card that was just scanned still lying
   there, or an empty table), there is nothing new to read, so the reading can
   be skipped. To tell "the same scene" cheaply, each look is squeezed down to a
   tiny grey "signature" (a grid of about 16 x 22 brightness numbers, like a very
   blurry thumbnail) and two signatures are compared.
   - tinyFromGray / tinyFromRgba make a signature from a picture.
   - signatureDifference says how different two signatures are, from 0 (the
     same) up to about 1 (completely different).
   - sameFrame / changedFrame turn that into a yes/no with safe cut-offs.
   The comparison ignores the picture getting slightly brighter or darker as a
   whole (the camera adjusting its exposure) but not a shadow or a different
   card. The cut-offs are careful guesses: they have not been tuned on a real
   phone yet, which is why callers only use a "same" answer to SKIP work they
   would otherwise do, and always fall back to doing the work.
   ===================================================================== */

// The size of a signature: about the shape of a card
export const SIGNATURE_WIDTH = 16;
export const SIGNATURE_HEIGHT = 22;

// Below this difference two looks count as the same scene
export const SAME_BELOW = 0.035;
// Above this difference two looks count as clearly different (a new card, or a card taken away)
export const CHANGED_ABOVE = 0.12;

// A box inside a picture, as shares of the picture's width and height: left, top, right, bottom
export type Share = readonly [number, number, number, number];
const WHOLE: Share = [0, 0, 1, 1];

// Squeeze a box of a picture down to a grid of average brightnesses. "brightnessAt" gives one pixel's
// brightness (0 to 255); the box is cut into grid cells and each cell's pixels are averaged.
function squeeze(width: number, height: number, box: Share, brightnessAt: (x: number, y: number) => number): Uint8Array {
  const left = Math.max(0, Math.min(width - 1, Math.floor(box[0] * width)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(box[1] * height)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(box[2] * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(box[3] * height)));
  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const out = new Uint8Array(SIGNATURE_WIDTH * SIGNATURE_HEIGHT);
  for (let gy = 0; gy < SIGNATURE_HEIGHT; gy++) {
    // The rows of the picture that fall in this grid row (always at least one)
    const y0 = top + Math.floor((gy * boxHeight) / SIGNATURE_HEIGHT);
    const y1 = Math.max(y0 + 1, top + Math.floor(((gy + 1) * boxHeight) / SIGNATURE_HEIGHT));
    for (let gx = 0; gx < SIGNATURE_WIDTH; gx++) {
      const x0 = left + Math.floor((gx * boxWidth) / SIGNATURE_WIDTH);
      const x1 = Math.max(x0 + 1, left + Math.floor(((gx + 1) * boxWidth) / SIGNATURE_WIDTH));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) { sum += brightnessAt(x, y); count++; }
      }
      out[gy * SIGNATURE_WIDTH + gx] = count ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

// A signature from a grey picture (one number from 0 to 255 per pixel, row by row)
export function tinyFromGray(gray: ArrayLike<number>, width: number, height: number, box: Share = WHOLE): Uint8Array {
  return squeeze(width, height, box, (x, y) => gray[y * width + x]);
}

// A signature from a colour picture as the browser gives it (red, green, blue, opacity for each pixel)
export function tinyFromRgba(rgba: ArrayLike<number>, width: number, height: number, box: Share = WHOLE): Uint8Array {
  return squeeze(width, height, box, (x, y) => {
    const i = (y * width + x) * 4;
    return 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  });
}

// How different two signatures are: 0 is the same, about 1 is as different as can be.
// Most of the answer is how much the PATTERN differs (each signature with its own average taken off, so a
// change in overall brightness doesn't count much), plus a little for how far the averages are apart.
// Signatures of different sizes can't be compared: that counts as completely different.
export function signatureDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < a.length; i++) { meanA += a[i]; meanB += b[i]; }
  meanA /= a.length;
  meanB /= a.length;
  let pattern = 0;
  for (let i = 0; i < a.length; i++) pattern += Math.abs(a[i] - meanA - (b[i] - meanB));
  pattern /= a.length * 255;
  return pattern + (0.5 * Math.abs(meanA - meanB)) / 255;
}

// True when the two looks show the same scene (careful: only a clear match counts)
export const sameFrame = (a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined, below = SAME_BELOW): boolean =>
  !!a && !!b && signatureDifference(a, b) < below;

// True when the two looks are clearly different scenes
export const changedFrame = (a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined, above = CHANGED_ABOVE): boolean =>
  !!a && !!b && signatureDifference(a, b) > above;
