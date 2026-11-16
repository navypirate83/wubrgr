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
