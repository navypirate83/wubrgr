/* =====================================================================
   THE ART FINGERPRINT (shared by the scanner on Android, the scanner on
   the web, and the script that builds the card catalogue)
   A "perceptual hash" is a short fingerprint of a picture. Two photos of
   the same artwork (a different size, a little blurry, brighter or darker)
   give nearly the same fingerprint, and different artwork gives a very
   different one. This is how the scanner tells apart old printings of a
   card when the printed set code can't be read: it fingerprints the art in
   the camera photo and finds the closest fingerprint in the catalogue.
   How it's worked out (256 bits = 32 bytes):
     1. the picture is made grey, then shrunk to 32 x 32 squares by averaging
     2. a DCT (a way of splitting a picture into smooth "waves", the same idea
        JPEG uses) is done on those 32 x 32 squares
     3. the 16 x 16 slowest waves are kept (256 numbers: the overall shape
        of the picture, not its fine detail)
     4. each number becomes a 1 if it's above the middle value of them all,
        otherwise 0
   Two fingerprints are compared by counting how many of the 256 bits
   differ (the "Hamming distance"): 0 is identical, and under about 40 is
   usually the same artwork.
   This one file is used by the catalogue build script AND by the app, so
   a fingerprint made from a camera photo means the same as the stored ones.
   Plain TypeScript with no imports (so a script can run it directly).
   ===================================================================== */

// The fingerprint is this many bytes (256 bits)
export const HASH_BYTES = 32;

// The picture is shrunk to this many squares across and down, and this many
// of the slowest waves across and down are kept (16 x 16 = 256 bits)
const SHRUNK = 32;
const KEPT = 16;

// Make a colour picture (red, green, blue, alpha for each pixel, as a camera
// or a canvas gives it) grey: one number from 0 to 255 per pixel
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
  }
  return gray;
}

// Shrink a grey picture to size x size by averaging the pixels that fall in
// each square (a pixel only partly inside a square counts for that part)
function shrink(gray: ArrayLike<number>, width: number, height: number, size: number): Float64Array {
  // First across (width -> size), then down (height -> size)
  const across = new Float64Array(size * height);
  const stepX = width / size;
  for (let y = 0; y < height; y++) {
    for (let tx = 0; tx < size; tx++) {
      const from = tx * stepX;
      const to = from + stepX;
      let sum = 0;
      for (let x = Math.floor(from); x < Math.min(width, Math.ceil(to)); x++) {
        const weight = Math.min(x + 1, to) - Math.max(x, from);
        sum += gray[y * width + x] * weight;
      }
      across[y * size + tx] = sum / stepX;
    }
  }
  const out = new Float64Array(size * size);
  const stepY = height / size;
  for (let ty = 0; ty < size; ty++) {
    const from = ty * stepY;
    const to = from + stepY;
    for (let tx = 0; tx < size; tx++) {
      let sum = 0;
      for (let y = Math.floor(from); y < Math.min(height, Math.ceil(to)); y++) {
        const weight = Math.min(y + 1, to) - Math.max(y, from);
        sum += across[y * size + tx] * weight;
      }
      out[ty * size + tx] = sum / stepY;
    }
  }
  return out;
}

// The cosines the DCT needs, worked out once: COS[k][n] = cos(pi * (2n + 1) * k / 2N)
const COS: Float64Array[] = Array.from({ length: KEPT }, (_, k) =>
  Float64Array.from({ length: SHRUNK }, (_, n) => Math.cos((Math.PI * (2 * n + 1) * k) / (2 * SHRUNK))));

// The fingerprint of a grey picture (width x height, one number per pixel)
export function artHash(gray: ArrayLike<number>, width: number, height: number): Uint8Array {
  const small = shrink(gray, width, height, SHRUNK);
  // The DCT, rows first: for each row, its first KEPT waves
  const rows = new Float64Array(SHRUNK * KEPT);
  for (let y = 0; y < SHRUNK; y++) {
    for (let u = 0; u < KEPT; u++) {
      let sum = 0;
      for (let x = 0; x < SHRUNK; x++) sum += small[y * SHRUNK + x] * COS[u][x];
      rows[y * KEPT + u] = sum;
    }
  }
  // Then columns: the first KEPT waves down each of those
  const waves = new Float64Array(KEPT * KEPT);
  for (let u = 0; u < KEPT; u++) {
    for (let v = 0; v < KEPT; v++) {
      let sum = 0;
      for (let y = 0; y < SHRUNK; y++) sum += rows[y * KEPT + u] * COS[v][y];
      waves[v * KEPT + u] = sum;
    }
  }
  // The middle value of the waves (leaving out the first, which is just the
  // picture's overall brightness), and a 1 for each wave above it
  const sorted = Array.from(waves.slice(1)).sort((a, b) => a - b);
  const middle = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
  const hash = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < KEPT * KEPT; i++) {
    if (waves[i] > middle) hash[i >> 3] |= 1 << (i & 7);
  }
  return hash;
}

// How many of the 256 bits differ between two fingerprints (0: identical)
export function hammingDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let bits = 0;
  for (let i = 0; i < HASH_BYTES; i++) {
    let x = a[i] ^ b[i];
    while (x) { bits += x & 1; x >>= 1; }
  }
  return bits;
}

// A fingerprint as 64 letters and digits (for saving in a text file), and back
export function hashToHex(hash: ArrayLike<number>): string {
  let hex = '';
  for (let i = 0; i < HASH_BYTES; i++) hex += hash[i].toString(16).padStart(2, '0');
  return hex;
}
export function hexToHash(hex: string): Uint8Array {
  const hash = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < HASH_BYTES; i++) hash[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return hash;
}
