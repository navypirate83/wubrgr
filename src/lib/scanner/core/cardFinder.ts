/* =====================================================================
   FINDING A CARD IN A CAMERA PICTURE (shared, plain TypeScript)
   This is what lets you hold a card at any angle instead of lining it up.
   It takes a small copy of one camera frame and answers: "where are the four
   corners of the card?" (or "no card here"). No outside library is used. The
   steps, in plain words:
     1. Guess what the table looks like: the colour found along the picture's
        outer edge (the card is expected to sit in the middle, away from the edge).
     2. Mark every pixel that is clearly a different colour from the table. The
        card shows up as a big blob. (The best cut-off between "table" and "not
        table" is found automatically, so it works in dim or bright light.)
     3. Fill in holes (a pale card art on a pale table), trim off thin things such as a
        thumb, and keep the biggest blob.
     4. Take the blob's outline, find its four corners (the two points farthest
        apart are one pair of opposite corners; the points farthest to each side of
        the line between them are the other two).
     5. Check it really looks like a card (about 63 : 88, mostly filled in, not
        touching the picture's edge), then say which corner is the top-left.
   Because it works from the colour difference between the card and what's under
   it, a card that is the same colour as the table (a black-bordered card on a
   black table) can't be found. Then it says "no card" and nothing is guessed.
   The answers are in fractions of the picture (0 to 1 across and down).
   ===================================================================== */

import type { Point, Quad, RgbaPicture } from './perspective';

/* ---------- small helpers ---------- */

// The usual tuning numbers: how much of the picture the card must fill, how card-shaped it must be, how well it fills its outline
const MIN_AREA = 0.06;
const MIN_FILL = 0.8;
const MIN_ASPECT = 1.15;
const MAX_ASPECT = 1.75;
const MIN_CONTRAST = 28;

// A card's rounded corners and the blurry edge make the found outline a little smaller than the real card:
// this much (as a share of the card's width and height) is added back on each side
export const EDGE_GROW = { x: 0.006, y: 0.005 };

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// The middle value of a column of counts (the median)
function medianOf(histogram: Uint32Array, total: number): number {
  let seen = 0;
  for (let value = 0; value < 256; value++) {
    seen += histogram[value];
    if (seen * 2 >= total) return value;
  }
  return 255;
}

// What the table looks like: the middle colour along the picture's outer edge
function tableColour(rgba: ArrayLike<number>, width: number, height: number): [number, number, number] {
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.05));
  const counts = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) { x = width - ring - 1; continue; }
      const i = (y * width + x) * 4;
      counts[0][rgba[i]]++;
      counts[1][rgba[i + 1]]++;
      counts[2][rgba[i + 2]]++;
      total++;
    }
  }
  return [medianOf(counts[0], total), medianOf(counts[1], total), medianOf(counts[2], total)];
}

// The best cut-off between two groups of numbers 0 to 255 (Otsu's method), plus how far apart the groups' averages are
function bestCutoff(histogram: Uint32Array, total: number): { cutoff: number; gap: number; share: number } {
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * histogram[v];
  let low = 0;
  let sumLow = 0;
  let bestSpread = -1;
  let result = { cutoff: 0, gap: 0, share: 0 };
  for (let cut = 0; cut < 255; cut++) {
    low += histogram[cut];
    sumLow += cut * histogram[cut];
    const high = total - low;
    if (low === 0 || high === 0) continue;
    const meanLow = sumLow / low;
    const meanHigh = (sumAll - sumLow) / high;
    const spread = low * high * (meanLow - meanHigh) * (meanLow - meanHigh);
    if (spread > bestSpread) { bestSpread = spread; result = { cutoff: cut, gap: meanHigh - meanLow, share: high / total }; }
  }
  return result;
}

// Grow every set pixel by "radius" in all directions (a square), or with "shrink" set, eat that far into them
function grow(mask: Uint8Array, width: number, height: number, radius: number, shrink: boolean): Uint8Array {
  const wanted = shrink ? 0 : 1;
  const across = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(width - 1, x + radius); k++) if (mask[y * width + k] === wanted) { hit = 1; break; }
      across[y * width + x] = hit;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(height - 1, y + radius); k++) if (across[k * width + x]) { hit = 1; break; }
      out[y * width + x] = shrink ? 1 - hit : hit;
    }
  }
  return out;
}

// Pixels with nothing set around them that can be reached from the picture's edge are the table; any
// "not set" pixel the edge can't reach is a hole in the card, so it is set
function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const reached = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (index: number) => { if (!mask[index] && !reached[index]) { reached[index] = 1; stack.push(index); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (index >= width) push(index - width);
    if (index < mask.length - width) push(index + width);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] || !reached[i] ? 1 : 0;
  return out;
}

// The biggest connected blob of set pixels (marked 1 in the answer), and its size
function biggestBlob(mask: Uint8Array, width: number, height: number): { blob: Uint8Array; size: number } {
  const seen = new Uint8Array(mask.length);
  let bestStart = -1;
  let bestSize = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let size = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop()!;
      size++;
      const x = index % width;
      const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index >= width ? index - width : -1, index < mask.length - width ? index + width : -1];
      for (const next of neighbours) if (next >= 0 && mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
    }
    if (size > bestSize) { bestSize = size; bestStart = start; }
  }
  const blob = new Uint8Array(mask.length);
  if (bestStart < 0) return { blob, size: 0 };
  blob[bestStart] = 1;
  stack.push(bestStart);
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % width;
    const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index >= width ? index - width : -1, index < mask.length - width ? index + width : -1];
    for (const next of neighbours) if (next >= 0 && mask[next] && !blob[next]) { blob[next] = 1; stack.push(next); }
  }
  return { blob, size: bestSize };
}

// The outline of the blob wrapped tight like a rubber band (the "convex hull"), going around it
function hullOf(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let k = sorted.length - 1; k >= 0; k--) {
    const p = sorted[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const areaOf = (shape: Point[]) => Math.abs(shape.reduce((sum, p, k) => { const q = shape[(k + 1) % shape.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;

// A point inside a four-cornered shape, "s" of the way across and "t" of the way down (can be past 0 or 1)
function inside(quad: Quad, s: number, t: number): Point {
  const [a, b, c, d] = quad;
  return {
    x: (1 - t) * ((1 - s) * a.x + s * b.x) + t * ((1 - s) * d.x + s * c.x),
    y: (1 - t) * ((1 - s) * a.y + s * b.y) + t * ((1 - s) * d.y + s * c.y),
  };
}

/* ---------- the finder ---------- */

// Four corners (top-left, top-right, bottom-right, bottom-left, in fractions of the picture), or null if no card is seen
export function findCard(picture: RgbaPicture): Quad | null {
  const { data, width, height } = picture;
  const pixels = width * height;

  // 1 and 2: how different each pixel is from the table, and the cut-off between "table" and "card"
  const table = tableColour(data, width, height);
  const histogram = new Uint32Array(256);
  const difference = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const d = (Math.abs(data[i * 4] - table[0]) + Math.abs(data[i * 4 + 1] - table[1]) + Math.abs(data[i * 4 + 2] - table[2])) / 3;
    difference[i] = d;
    histogram[difference[i]]++;
  }
  const { cutoff, gap, share } = bestCutoff(histogram, pixels);
  if (gap < MIN_CONTRAST || share < MIN_AREA || share > 0.9) return null;
  const marked = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) marked[i] = difference[i] > Math.max(cutoff, 14) ? 1 : 0;

  // 3: fill holes, trim thin things, keep the biggest blob, then give back what the trimming took off the card's own edge
  const solid = fillHoles(marked, width, height);
  const radius = Math.max(1, Math.round(width / 60));
  const trimmed = grow(grow(solid, width, height, radius, true), width, height, radius, false);
  const core = biggestBlob(trimmed, width, height);
  if (core.size < pixels * MIN_AREA) return null;
  const near = grow(core.blob, width, height, radius + 1, false);
  const region = new Uint8Array(pixels);
  let regionSize = 0;
  for (let i = 0; i < pixels; i++) if (solid[i] && near[i]) { region[i] = 1; regionSize++; }

  // 4: the outline's points (pixels with a non-card pixel beside them), wrapped into a hull, then the four corners
  const edge: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!region[i]) continue;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !region[i - 1] || !region[i + 1] || !region[i - width] || !region[i + width]) edge.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  const hull = hullOf(edge);
  if (hull.length < 4) return null;
  let first = hull[0];
  let second = hull[1];
  let diagonal = 0;
  for (let a = 0; a < hull.length; a++) {
    for (let b = a + 1; b < hull.length; b++) {
      const d = distance(hull[a], hull[b]);
      if (d > diagonal) { diagonal = d; first = hull[a]; second = hull[b]; }
    }
  }
  let third: Point | null = null;
  let fourth: Point | null = null;
  let thirdAway = 0;
  let fourthAway = 0;
  for (const p of hull) {
    const away = cross(first, second, p) / diagonal;
    if (away > thirdAway) { thirdAway = away; third = p; }
    if (-away > fourthAway) { fourthAway = -away; fourth = p; }
  }
  if (!third || !fourth || thirdAway < diagonal * 0.15 || fourthAway < diagonal * 0.15) return null;
  // Put the four corners in order around the shape (clockwise as seen on the screen)
  const middle = { x: (first.x + second.x + third.x + fourth.x) / 4, y: (first.y + second.y + third.y + fourth.y) / 4 };
  const around = [first, third, second, fourth].sort((a, b) => Math.atan2(a.y - middle.y, a.x - middle.x) - Math.atan2(b.y - middle.y, b.x - middle.x));

  // 5: does it look like a card?
  const outline = areaOf(around);
  if (outline < pixels * MIN_AREA || regionSize / outline < MIN_FILL || regionSize / outline > 1.1) return null;
  for (const p of around) if (p.x < 1.5 || p.y < 1.5 || p.x > width - 1.5 || p.y > height - 1.5) return null;
  const sides = around.map((p, k) => distance(p, around[(k + 1) % 4]));
  const pairA = (sides[0] + sides[2]) / 2;
  const pairB = (sides[1] + sides[3]) / 2;
  const aspect = Math.max(pairA, pairB) / Math.min(pairA, pairB);
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null;
  if (Math.max(sides[0], sides[2]) / Math.min(sides[0], sides[2]) > 1.7 || Math.max(sides[1], sides[3]) / Math.min(sides[1], sides[3]) > 1.7) return null;

  // Which corner is which: the card's top is its short side that sits higher up on the screen
  const shortStarts = pairA < pairB ? [0, 2] : [1, 3];
  const lift = (start: number) => (around[start].y + around[(start + 1) % 4].y) - (around[(start + 2) % 4].y + around[(start + 3) % 4].y);
  const start = lift(shortStarts[0]) <= lift(shortStarts[1]) ? shortStarts[0] : shortStarts[1];
  const ordered = [0, 1, 2, 3].map((k) => around[(start + k) % 4]) as Quad;

  // Add back the rounded corners' and blurry edge's share, then turn into fractions of the picture
  const growX = EDGE_GROW.x / (1 - 2 * EDGE_GROW.x);
  const growY = EDGE_GROW.y / (1 - 2 * EDGE_GROW.y);
  const full: Quad = [inside(ordered, -growX, -growY), inside(ordered, 1 + growX, -growY), inside(ordered, 1 + growX, 1 + growY), inside(ordered, -growX, 1 + growY)];
  return full.map((p) => ({ x: p.x / width, y: p.y / height })) as Quad;
}

/* ---------- following the card from one frame to the next ---------- */

// How far the farthest-moved corner has moved (in fractions of the picture's width)
export function quadShift(a: Quad, b: Quad): number {
  let most = 0;
  for (let k = 0; k < 4; k++) most = Math.max(most, Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y));
  return most;
}

// A blend of the last outline and the new one (so the drawn outline doesn't jitter); "keep" is how much of the old one stays
export function blendQuads(old: Quad, fresh: Quad, keep: number): Quad {
  return fresh.map((p, k) => ({ x: old[k].x * keep + p.x * (1 - keep), y: old[k].y * keep + p.y * (1 - keep) })) as Quad;
}

// The middle of the card
export function quadCentre(quad: Quad): Point {
  return { x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4 };
}
