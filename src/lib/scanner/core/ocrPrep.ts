/* =====================================================================
   GETTING A PICTURE READY FOR OCR (shared, plain TypeScript, no imports)
   Text recognition works best on clean black text on a plain white background.
   A card's small print is the other way round on dark cards (pale text on a
   dark frame), is tiny, and may sit on a coloured or glossy background. So a
   crop of the card is made ready like this:
     1. made grey (see phash.ts: rgbaToGray)
     2. made bigger (done by the platform's canvas, which smooths it nicely;
        small text needs about 3 times its size for OCR to read it well)
     3. turned into pure black and white with binarizeForOcr: the dividing line
        between dark and light is found automatically (Otsu's method), and the
        picture is flipped if needed so the TEXT is black and the BACKGROUND
        white (the background is the bigger part of a crop of a line of text).
   ===================================================================== */

// Black text on a white background from a grey crop: 0 for text, 255 for background.
// The text is taken to be the smaller of the two sides; "flip" takes the other side
// instead, for a crop where that guess is wrong (a title bar with a lot of dark frame in it).
export function binarizeForOcr(gray: ArrayLike<number>, flip = false): Uint8Array {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];
  let backgroundSum = 0;
  let backgroundCount = 0;
  let line = 128;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    backgroundCount += histogram[t];
    if (backgroundCount === 0) continue;
    const foregroundCount = total - backgroundCount;
    if (foregroundCount === 0) break;
    backgroundSum += t * histogram[t];
    const meanBelow = backgroundSum / backgroundCount;
    const meanAbove = (sum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (meanBelow - meanAbove) ** 2;
    if (variance > bestVariance) { bestVariance = variance; line = t; }
  }
  // Which side is the background? The side with more pixels.
  let below = 0;
  for (let t = 0; t <= line; t++) below += histogram[t];
  const darkIsBackground = (below * 2 > total) !== flip;
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const dark = gray[i] <= line;
    // text is the minority side: black (0); the background is white (255)
    out[i] = (dark !== darkIsBackground) ? 0 : 255;
  }
  return out;
}

// Wipe out black blobs that touch the edge of the crop (turn them white), leaving the characters inside it alone.
// A crop of the small print also catches a strip of whatever is next to it (the bottom edge of the text box, the card's
// frame): that comes out as a big black bar or smear joined to the crop's edge, and it can throw off the text reader's
// finding of the lines. Real characters sit inside the crop with a margin round them, so they don't touch the edge.
// If this would wipe out most of the black (the text itself touches the edge), nothing is changed.
// The picture is a list of 0 (black) and 255 (white), row after row, changed in place. Returns true if it changed anything.
export function removeEdgeBlobs(binary: Uint8Array, width: number, height: number): boolean {
  const seen = new Uint8Array(binary.length);
  const stack: number[] = [];
  const wiped: number[] = [];
  const start = (x: number, y: number) => {
    const k = y * width + x;
    if (binary[k] === 0 && !seen[k]) { seen[k] = 1; stack.push(k); }
  };
  for (let x = 0; x < width; x++) { start(x, 0); start(x, height - 1); }
  for (let y = 0; y < height; y++) { start(0, y); start(width - 1, y); }
  while (stack.length) {
    const k = stack.pop()!;
    wiped.push(k);
    const x = k % width;
    const y = (k / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nk = ny * width + nx;
        if (binary[nk] === 0 && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
      }
    }
  }
  if (wiped.length === 0) return false;
  let black = 0;
  for (let i = 0; i < binary.length; i++) if (binary[i] === 0) black++;
  // More than 60% of the black is attached to the edge: the text is probably touching it, so leave the picture as it was
  if (wiped.length > 0.6 * black) return false;
  for (const k of wiped) binary[k] = 255;
  return true;
}

// The grey picture with its contrast stretched: the darkest 2% of the pixels become black and the lightest 2% white, and the rest
// is spread between them. (Without turning it into pure black and white, which breaks letters up on a textured background:
// the text reader copes with grey, and the stretch gives it the contrast a dull or faded title bar lacks.)
export function stretchContrast(gray: ArrayLike<number>): Uint8Array {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
  const total = gray.length;
  let seen = 0;
  let low = 0;
  while (low < 255 && seen + histogram[low] < total * 0.02) seen += histogram[low++];
  seen = 0;
  let high = 255;
  while (high > 0 && seen + histogram[high] < total * 0.02) seen += histogram[high--];
  const out = new Uint8Array(gray.length);
  const spread = Math.max(1, high - low);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - low) / spread) * 255)));
  return out;
}
