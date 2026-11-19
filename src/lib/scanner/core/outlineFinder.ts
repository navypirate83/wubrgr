/* =====================================================================
   THE "OUTLINE" CARD FINDER (shared, plain TypeScript, no libraries)
   Finds a card in a photo even when the background is busy (a hand, a
   wooden table, other cards), where the older "detail" finder in
   cardFinder.ts gets fooled because everything has detail.
   How it works, in plain words:
     1. Make a small grey copy of the photo (256 pixels on the long side) for a quick
        search, and a bigger one (768) for fine-tuning. Searching the small copy
        is what keeps this fast enough for a phone.
     2. Try thousands of card-shaped rectangles (63 x 88) at many places, many
        turns (every 5 degrees) and many sizes.
     3. For each rectangle, walk along its four sides and measure how much the
        brightness jumps from just outside the side to just inside. A real card
        edge jumps the same way along the whole side (a dark border against a light
        finger or table), while clutter jumps up and down and averages out.
     4. The score is half the weakest side plus half the average of the four
        sides, so all four sides have to be there.
     5. The best rectangle is nudged around with smaller and smaller moves on the
        bigger copy until it sits exactly on the card.
     6. A card's inner boxes (art frame, text box) have sharp edges too, so the best
        rectangle can be too small. The best clearly LARGER rectangle is also kept
        and polished as a second candidate.
   The answer is a list of candidates (best first); each has the card's four
   corners in the photo's own pixels. flatCard() then straightens a candidate
   into an upright 630 x 880 picture (using perspective.ts).
   It is a port of findCardOutline in scripts/catalogue/embed/real-photos-test.mjs.
   ===================================================================== */

import { warpCard, type Point, type Quad, type RgbaPicture } from './perspective.ts';

// A photo as the camera or canvas hands it over. "channels" says how many numbers each pixel has:
// 4 = red, green, blue, alpha (the default), 3 = red, green, blue, 1 = a grey picture.
export type PhotoPixels = { data: ArrayLike<number>; width: number; height: number; channels?: 1 | 3 | 4 };

// One place the card might be
export type OutlineCandidate = {
  quad: Quad;            // the four corners in the photo's pixels: top-left, top-right, bottom-right, bottom-left (as seen on an upright card)
  score: number;         // how card-like the four edges are (higher is better; typical real cards score 20 to 90)
  kind: 'best' | 'larger'; // the best rectangle, or the best clearly larger one
  centre: Point;         // the middle of the card in the photo's pixels
  length: number;        // the card's long side in the photo's pixels
  width: number;         // the card's short side in the photo's pixels
  angle: number;         // which way the long side points, in radians (0 = to the right)
};

// How the search is sized (the defaults are the test script's numbers)
export type OutlineOptions = {
  coarseSize?: number; // long side of the small search copy
  fineSize?: number;   // long side of the polishing copy
};

// A card is 63 x 88 mm, so its short side is this much of its long side
const CARD_RATIO = 0.716;

// ---------------------------------------------------------------------
// MAKING THE GREY COPIES
// ---------------------------------------------------------------------
// A grey picture as decimals (kept as decimals so the blur does not round things off)
type Gray = { w: number; h: number; scale: number; data: Float32Array };

// For each new pixel along one direction: the first old pixel it uses and how much each counts.
// A "triangle" curve stretched to the shrink amount: it averages the old pixels the new one covers
// when shrinking, and blends the two nearest ones when enlarging.
function triangleWeights(oldSize: number, newSize: number): { starts: Int32Array; weights: Float32Array[] } {
  const scale = oldSize / newSize;
  const stretch = Math.max(1, scale);
  const starts = new Int32Array(newSize);
  const weights: Float32Array[] = [];
  for (let i = 0; i < newSize; i++) {
    const centre = (i + 0.5) * scale;
    const first = Math.max(0, Math.floor(centre - stretch));
    const last = Math.min(oldSize - 1, Math.ceil(centre + stretch) - 1);
    const list = new Float32Array(Math.max(1, last - first + 1));
    let sum = 0;
    for (let k = first; k <= last; k++) {
      const w = Math.max(0, 1 - Math.abs(k + 0.5 - centre) / stretch);
      list[k - first] = w;
      sum += w;
    }
    if (sum === 0) { list[0] = 1; sum = 1; }
    for (let k = 0; k < list.length; k++) list[k] /= sum;
    starts[i] = Math.min(first, oldSize - 1);
    weights.push(list);
  }
  return { starts, weights };
}

// The grey brightness of one source pixel (the usual weights: green counts most)
function brightnessAt(data: ArrayLike<number>, index: number, channels: number): number {
  if (channels === 1) return data[index];
  const at = index * channels;
  return 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2];
}

// Shrink the photo to w x h in grey
function shrinkToGray(photo: { data: ArrayLike<number>; width: number; height: number; channels?: number }, w: number, h: number): Float32Array {
  const channels = photo.channels ?? 4;
  const across = triangleWeights(photo.width, w);
  const down = triangleWeights(photo.height, h);
  // Across first: every source row squeezed to w values
  const middle = new Float32Array(photo.height * w);
  for (let y = 0; y < photo.height; y++) {
    const row = y * photo.width;
    for (let x = 0; x < w; x++) {
      const list = across.weights[x];
      const first = across.starts[x];
      let sum = 0;
      for (let k = 0; k < list.length; k++) sum += brightnessAt(photo.data, row + first + k, channels) * list[k];
      middle[y * w + x] = sum;
    }
  }
  // Then down
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const list = down.weights[y];
    const first = down.starts[y];
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = 0; k < list.length; k++) sum += middle[(first + k) * w + x] * list[k];
      out[y * w + x] = sum;
    }
  }
  return out;
}

// A gentle blur (a "gaussian" of width 1 pixel) so tiny speckles do not count as edges
function blur(data: Float32Array, w: number, h: number, sigma = 1): Float32Array {
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) { kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += kernel[i + radius]; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) s += data[y * w + Math.min(w - 1, Math.max(0, x + i))] * kernel[i + radius];
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * kernel[i + radius];
      out[y * w + x] = s;
    }
  }
  return out;
}

// The size a copy with long side "size" gets, for a picture photoW x photoH
function copySize(photoW: number, photoH: number, size: number): { w: number; h: number; scale: number } {
  const scale = Math.max(photoW, photoH) / size;
  return { w: Math.max(2, Math.round(photoW / scale)), h: Math.max(2, Math.round(photoH / scale)), scale };
}

// ---------------------------------------------------------------------
// SCORING ONE RECTANGLE
// ---------------------------------------------------------------------
// How strongly does the rectangle (middle cx,cy, long side L, long side pointing at angle phi) look like
// a card edge? Returns -1 when the rectangle is mostly outside the picture.
function rectScore(img: Gray, cx: number, cy: number, L: number, phi: number): number {
  const W = L * CARD_RATIO;
  const ux = Math.cos(phi), uy = Math.sin(phi); // along the long side
  const vx = -uy, vy = ux; // along the short side
  const d = Math.max(1.5, L * 0.02); // how far inside and outside each side to look
  const { w, h, data } = img;
  let weakest = Infinity;
  let total = 0;
  for (let s = 0; s < 4; s++) {
    // Each side: which way is "out" (nx,ny), how far from the middle (offset), which way the side runs (ax,ay), how long
    let nx: number, ny: number, offset: number, ax: number, ay: number, length: number;
    if (s === 0) { nx = ux; ny = uy; offset = L / 2; ax = vx; ay = vy; length = W; }
    else if (s === 1) { nx = -ux; ny = -uy; offset = L / 2; ax = vx; ay = vy; length = W; }
    else if (s === 2) { nx = vx; ny = vy; offset = W / 2; ax = ux; ay = uy; length = L; }
    else { nx = -vx; ny = -vy; offset = W / 2; ax = ux; ay = uy; length = L; }
    const step = Math.max(2, length / 24);
    let sum = 0, count = 0, tried = 0;
    for (let t = -length / 2 + step / 2; t < length / 2; t += step) {
      tried++;
      const px = cx + nx * offset + ax * t, py = cy + ny * offset + ay * t;
      const ix = Math.round(px - nx * d), iy = Math.round(py - ny * d);
      const ox = Math.round(px + nx * d), oy = Math.round(py + ny * d);
      if (ix < 0 || iy < 0 || ox < 0 || oy < 0 || ix >= w || ox >= w || iy >= h || oy >= h) continue;
      sum += data[iy * w + ix] - data[oy * w + ox];
      count++;
    }
    if (count < tried * 0.75) return -1; // mostly outside the photo
    const side = Math.abs(sum / count);
    if (side < weakest) weakest = side;
    total += side;
  }
  return 0.5 * weakest + 0.5 * (total / 4);
}

// A spot found by the search: its middle, long side, turn and score
type Spot = { score: number; cx: number; cy: number; L: number; phi: number };

// ---------------------------------------------------------------------
// THE SEARCH
// ---------------------------------------------------------------------
// Find the candidate cards in a photo. Returns the best card first, then (if there is one) the best
// clearly larger rectangle. Returns an empty list only for a photo too small to search.
export function findOutlines(photo: PhotoPixels, options: OutlineOptions = {}): OutlineCandidate[] {
  const coarseSize = options.coarseSize ?? 256;
  const fineSize = options.fineSize ?? 768;
  if (photo.width < 8 || photo.height < 8) return [];
  const channels = photo.channels ?? 4;
  const source = { data: photo.data, width: photo.width, height: photo.height, channels };

  // The two grey copies. The big one is shrunk from the photo (the photo is only walked over once); the
  // small one is shrunk from the big one's unblurred grey, which is much cheaper. Each is then blurred.
  const bigSize = copySize(photo.width, photo.height, fineSize);
  const bigRaw = shrinkToGray(source, bigSize.w, bigSize.h);
  const smallSize = copySize(photo.width, photo.height, coarseSize);
  const smallRaw = shrinkToGray({ data: bigRaw, width: bigSize.w, height: bigSize.h, channels: 1 }, smallSize.w, smallSize.h);
  const big: Gray = { ...bigSize, data: blur(bigRaw, bigSize.w, bigSize.h) };
  const small: Gray = { ...smallSize, data: blur(smallRaw, smallSize.w, smallSize.h) };

  // Coarse search on the small copy: every size, every 5 degrees, every 4th pixel across and down.
  // Sizes grow by 12% each time, from 45 to 205 pixels (the scale of the small copy).
  let best: Spot = { score: -1, cx: 0, cy: 0, L: 0, phi: 0 };
  const bestOfSize: Spot[] = [];
  for (let L = 45; L <= 205; L *= 1.12) {
    let bestHere: Spot = { score: -1, cx: 0, cy: 0, L, phi: 0 };
    for (let deg = 0; deg < 180; deg += 5) {
      const phi = (deg * Math.PI) / 180;
      for (let cy = 0; cy < small.h; cy += 4) {
        for (let cx = 0; cx < small.w; cx += 4) {
          const score = rectScore(small, cx, cy, L, phi);
          if (score > best.score) best = { score, cx, cy, L, phi };
          if (score > bestHere.score) bestHere = { score, cx, cy, L, phi };
        }
      }
    }
    bestOfSize.push(bestHere);
  }
  if (best.score < 0) return [];

  // The second candidate: the best rectangle that is clearly larger than the best one, if it is nearly as good
  const larger = bestOfSize.filter((c) => c.L > best.L * 1.2).sort((a, b) => b.score - a.score)[0];
  const starts: { spot: Spot; kind: 'best' | 'larger' }[] = [{ spot: best, kind: 'best' }];
  if (larger && larger.score > best.score * 0.6) starts.push({ spot: larger, kind: 'larger' });

  // Polish each one on the big copy, with smaller and smaller moves (4, 2, then 1 pixel; and turns and growth to match)
  const results: OutlineCandidate[] = [];
  for (const { spot, kind } of starts) {
    const k = small.scale / big.scale;
    let cur: Spot = { score: -1, cx: spot.cx * k, cy: spot.cy * k, L: spot.L * k, phi: spot.phi };
    for (const [move, turn, grow] of [[4, 0.04, 0.04], [2, 0.02, 0.02], [1, 0.01, 0.01]]) {
      let local: Spot = { ...cur, score: -1 };
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dr = -2; dr <= 2; dr++) for (let dl = -2; dl <= 2; dl++) {
        const cx = cur.cx + dx * move, cy = cur.cy + dy * move, L = cur.L * (1 + dl * grow), phi = cur.phi + dr * turn;
        const score = rectScore(big, cx, cy, L, phi);
        if (score > local.score) local = { score, cx, cy, L, phi };
      }
      cur = local;
    }
    results.push(toCandidate(cur, big.scale, kind));
  }
  return results;
}

// Turn a spot on the big copy into corners in the photo's own pixels (half a pixel added because
// a pixel of the copy covers the photo from its start to its end, and the spot is at its middle)
function toCandidate(spot: Spot, scale: number, kind: 'best' | 'larger'): OutlineCandidate {
  const cx = (spot.cx + 0.5) * scale, cy = (spot.cy + 0.5) * scale;
  const length = spot.L * scale;
  const width = length * CARD_RATIO;
  const ux = Math.cos(spot.phi), uy = Math.sin(spot.phi); // along the long side
  // The "across" direction points the other way from the one used for scoring, so the straightened card is not mirrored
  const vx = uy, vy = -ux;
  const corner = (a: number, b: number): Point => ({ x: cx + ux * a * length + vx * b * width, y: cy + uy * a * length + vy * b * width });
  const quad: Quad = [corner(-0.5, -0.5), corner(-0.5, 0.5), corner(0.5, 0.5), corner(0.5, -0.5)];
  return { quad, score: spot.score, kind, centre: { x: cx, y: cy }, length, width, angle: spot.phi };
}

// ---------------------------------------------------------------------
// STRAIGHTENING THE FOUND CARD
// ---------------------------------------------------------------------
// The flat, upright card picture (630 x 880 red-green-blue-alpha pixels by default) for a candidate,
// taken from the FULL photo (so it is as sharp as the camera was). The photo must have 4 numbers per
// pixel. The card may come out upside down or sideways (the card finder cannot tell); the scanner
// tries all four turns later (see modelInput.ts).
export function flatCard(photo: RgbaPicture, candidate: OutlineCandidate, outWidth = 630, outHeight = 880): RgbaPicture {
  return { data: warpCard(photo, candidate.quad, outWidth, outHeight), width: outWidth, height: outHeight };
}
