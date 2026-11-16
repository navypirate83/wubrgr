/* =====================================================================
   MATCHING A SET SYMBOL (shared, plain TypeScript, no imports)
   On older cards the set symbol (at the right end of the type line) says which
   set the card is from. The scanner crops it out of the photo, and this turns
   the crop into a plain black-and-white 64 x 64 picture, the same kind the
   catalogue holds for every set (1 bit a pixel, 1 = dark, row by row, 8 pixels
   a byte, the first pixel in the top bit), so the two can be compared.
   - symbolBitsFromGray: a grey crop -> black-and-white. The colour of the symbol
     doesn't matter (a rare symbol is gold, a common one black), because only
     dark against light is kept: the middle between the darkest and lightest
     parts of the crop (Otsu's way) is the line between them.
   - normalizeSymbol: cuts the picture down to the symbol's own box and stretches
     it back to 64 x 64, so a symbol cropped a little loosely still lines up.
   - symbolScore: how much two symbols overlap, 0 to 1 (intersection over union).
   The scanner only compares a crop against the sets the card was printed in
   (never against every set), so even a rough match is enough to tell them apart.
   ===================================================================== */

export const SYMBOL_SIZE = 64;
export const SYMBOL_BYTES = (SYMBOL_SIZE * SYMBOL_SIZE) / 8;

const getBit = (bits: Uint8Array, i: number): boolean => ((bits[i >> 3] >> (7 - (i & 7))) & 1) === 1;
const setBit = (bits: Uint8Array, i: number): void => { bits[i >> 3] |= 0x80 >> (i & 7); };

// The grey level that best splits dark from light (Otsu's method)
function otsu(gray: ArrayLike<number>): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];
  let backgroundSum = 0;
  let backgroundCount = 0;
  let best = 128;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    backgroundCount += histogram[t];
    if (backgroundCount === 0) continue;
    const foregroundCount = total - backgroundCount;
    if (foregroundCount === 0) break;
    backgroundSum += t * histogram[t];
    const meanBackground = backgroundSum / backgroundCount;
    const meanForeground = (sum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) { bestVariance = variance; best = t; }
  }
  return best;
}

// A grey crop (width x height) as a 64 x 64 black-and-white symbol. Null if the crop is
// all one tone (no symbol in it: that's a signal too, see narrow.ts).
export function symbolBitsFromGray(gray: ArrayLike<number>, width: number, height: number): Uint8Array | null {
  let low = 255;
  let high = 0;
  for (let i = 0; i < gray.length; i++) { low = Math.min(low, gray[i]); high = Math.max(high, gray[i]); }
  if (high - low < 40) return null;
  const line = otsu(gray);
  const bits = new Uint8Array(SYMBOL_BYTES);
  // Each of the 64 x 64 squares is dark if most of the pixels under it are
  for (let y = 0; y < SYMBOL_SIZE; y++) {
    const y0 = Math.floor((y * height) / SYMBOL_SIZE);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / SYMBOL_SIZE));
    for (let x = 0; x < SYMBOL_SIZE; x++) {
      const x0 = Math.floor((x * width) / SYMBOL_SIZE);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / SYMBOL_SIZE));
      let dark = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { count++; if (gray[yy * width + xx] <= line) dark++; }
      if (dark * 2 > count) setBit(bits, y * SYMBOL_SIZE + x);
    }
  }
  return bits;
}

// Cut a symbol down to its own box and stretch that back to 64 x 64
export function normalizeSymbol(bits: Uint8Array): Uint8Array {
  let minX = SYMBOL_SIZE, minY = SYMBOL_SIZE, maxX = -1, maxY = -1;
  for (let y = 0; y < SYMBOL_SIZE; y++) {
    for (let x = 0; x < SYMBOL_SIZE; x++) {
      if (getBit(bits, y * SYMBOL_SIZE + x)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
  }
  const out = new Uint8Array(SYMBOL_BYTES);
  if (maxX < 0) return out;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  for (let y = 0; y < SYMBOL_SIZE; y++) {
    for (let x = 0; x < SYMBOL_SIZE; x++) {
      if (getBit(bits, (minY + Math.floor((y * h) / SYMBOL_SIZE)) * SYMBOL_SIZE + minX + Math.floor((x * w) / SYMBOL_SIZE))) setBit(out, y * SYMBOL_SIZE + x);
    }
  }
  return out;
}

// How much two symbols overlap: 0 (none) to 1 (the same shape)
export function symbolScore(a: Uint8Array, b: Uint8Array): number {
  const x = normalizeSymbol(a);
  const y = normalizeSymbol(b);
  let both = 0;
  let either = 0;
  for (let i = 0; i < SYMBOL_BYTES; i++) {
    const and = x[i] & y[i];
    const or = x[i] | y[i];
    for (let bit = 0; bit < 8; bit++) { both += (and >> bit) & 1; either += (or >> bit) & 1; }
  }
  return either === 0 ? 0 : both / either;
}
