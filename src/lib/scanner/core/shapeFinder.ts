/* =====================================================================
   THE "SHAPE" CARD FINDER (shared, plain TypeScript, no libraries)
   A third way to find a card in a camera picture, ported from the legacy card scanner's finder
   (its detect.rs; see that app's MECHANICS.md section 2). The other two finders in this folder
   work from COLOUR (cardFinder.ts: "different from the table") or from a search for a card-shaped
   rectangle (outlineFinder.ts). This one works from EDGES and SHAPES, so it does not care what colour the
   card is: a black-bordered card, a gold foil or a full-art card are all just "a closed shape".
   The steps, in plain words:
     1. Shrink the picture (longest side 640, keeping its shape).
     2. Find edges: places where the colour changes sharply (a Sobel filter on red, green and blue after a
        small blur, keeping the strongest). The cut-off is picked for each picture by Otsu's method (the
        cut-off that best splits "weak" from "strong"), with a floor so a plain table doesn't turn into edges.
     3. Fatten the edge lines a little so small gaps in a card's border close up.
     4. Paint everything reachable from the picture's border without crossing an edge as "outside". What is
        left are closed shapes: the cards.
     5. Trim every shape inward a little (cuts off thin shadows, separates cards that barely touch).
     6. Look at each shape on its own. Its "rubber band" outline is simplified to four corners (or the
        smallest tilted rectangle that fits round it); the shape must fill at least 95% of those four
        corners, must be card-shaped (63 x 88), must not touch the picture's edge, and must be big enough.
        A shape that fails may be two cards joined by a shadow, so it is trimmed harder and tried again.
     7. Keep the confident ones, best first, and drop any that overlap a better one by more than 45%.
   The answer is in fractions of the picture (0 to 1 across and down), corners ordered top-left, top-right,
   bottom-right, bottom-left and turned so the card stands upright (long sides up and down), the same as
   cardFinder.ts, so the rest of the scanner can use it in the same way.
   Every number says whether it was READ from the original Android app ("original") or is a choice of the
   legacy copy ("copy").
   ===================================================================== */

import type { Point, Quad, RgbaPicture } from './perspective.ts';

/* ---------- the numbers ---------- */

// Original: card shapes smaller than 100 pixels of a 416 x 416 picture are ignored
const MIN_AREA_OF_416 = 100;
const DETECT_SIZE = 416;
// Original: the outline is simplified at this share of its length to find 4 corners
const APPROX_EPSILON = 0.02;
// Original: the shape must fill at least this much of its 4-corner outline
const MIN_FILL = 0.95;
// Original: a find needs a score of at least this to count
const MIN_SCORE = 0.25;
// Original: finds overlapping by more than this share are merged
const MERGE_OVERLAP = 0.45;
// Original: the card must sit inside 0.5% to 99.5% of the picture
const EDGE_MARGIN = 0.005;
// Copy: the longest side of the working picture
export const WORK_LONG_SIDE = 640;
// Copy: how many times edges are thickened, and how many pixels shapes are trimmed
const DILATE_PASSES = 2;
const TRIM_PASSES = 3;
// Copy: the weakest colour change that may count as an edge
const EDGE_MIN_STRENGTH = 60;
// Copy: a card is 63 x 88, so its short side is this share of its long side; how far off may still score well
const CARD_ASPECT = 63 / 88;
const ASPECT_TOLERANCE = 0.12;
// Copy: a card covering this share of the picture (or more) gets full size marks
const FULL_SCORE_AREA = 0.03;

/* ---------- small picture helpers ---------- */

// The result: the card's corners and how sure we are
export type ShapeFind = { quad: Quad; score: number; fill: number };

type Grid = { w: number; h: number };

// Shrink (or grow) an RGBA picture to the given size: an average over blocks when shrinking a lot, then a smooth blend
function resizeRgba(pic: RgbaPicture, outW: number, outH: number): Uint8ClampedArray {
  let { data, width, height } = pic as { data: ArrayLike<number>; width: number; height: number };
  // First a whole-number block average if the picture is much bigger, so no detail is skipped over
  const block = Math.max(1, Math.floor(Math.min(width / outW, height / outH)));
  if (block > 1) {
    const w2 = Math.floor(width / block);
    const h2 = Math.floor(height / block);
    const small = new Uint8ClampedArray(w2 * h2 * 4);
    for (let y = 0; y < h2; y++) {
      for (let x = 0; x < w2; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < block; dy++) for (let dx = 0; dx < block; dx++) sum += data[((y * block + dy) * width + x * block + dx) * 4 + c];
          small[(y * w2 + x) * 4 + c] = sum / (block * block);
        }
        small[(y * w2 + x) * 4 + 3] = 255;
      }
    }
    data = small; width = w2; height = h2;
  }
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(Math.max(((y + 0.5) * height) / outH - 0.5, 0), height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, height - 1);
    const fy = sy - y0;
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(Math.max(((x + 0.5) * width) / outW - 0.5, 0), width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, width - 1);
      const fx = sx - x0;
      for (let c = 0; c < 3; c++) {
        const top = data[(y0 * width + x0) * 4 + c] * (1 - fx) + data[(y0 * width + x1) * 4 + c] * fx;
        const bottom = data[(y1 * width + x0) * 4 + c] * (1 - fx) + data[(y1 * width + x1) * 4 + c] * fx;
        out[(y * outW + x) * 4 + c] = top * (1 - fy) + bottom * fy;
      }
      out[(y * outW + x) * 4 + 3] = 255;
    }
  }
  return out;
}

// Soften each colour channel with a small 5-step blur, across then down. Returns three lists (red, green, blue).
function blurChannels(rgba: Uint8ClampedArray, w: number, h: number): Float32Array[] {
  const k = [1, 4, 6, 4, 1];
  const planes: Float32Array[] = [];
  for (let c = 0; c < 3; c++) {
    const across = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = 0; i < 5; i++) s += k[i] * rgba[(y * w + Math.min(Math.max(x + i - 2, 0), w - 1)) * 4 + c];
        across[y * w + x] = s / 16;
      }
    }
    const plane = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = 0; i < 5; i++) s += k[i] * across[Math.min(Math.max(y + i - 2, 0), h - 1) * w + x];
        plane[y * w + x] = s / 16;
      }
    }
    planes.push(plane);
  }
  return planes;
}

// Otsu's method: the cut-off that best splits the values into a "weak" group and a "strong" group
function otsu(values: Float32Array): number {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max <= 0) return Infinity;
  const bins = 256;
  const hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * (bins - 1)))] += 1;
  let total = 0;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) { total += hist[i]; sumAll += i * hist[i]; }
  let w0 = 0, sum0 = 0, bestVar = -1, bestT = 0;
  for (let t = 0; t < bins; t++) {
    w0 += hist[t];
    if (w0 === 0) continue;
    const w1 = total - w0;
    if (w1 === 0) break;
    sum0 += t * hist[t];
    const m0 = sum0 / w0;
    const m1 = (sumAll - sum0) / w1;
    const between = w0 * w1 * (m0 - m1) * (m0 - m1);
    if (between > bestVar) { bestVar = between; bestT = t; }
  }
  return ((bestT + 0.5) / (bins - 1)) * max;
}

// Mark the places where the colour changes sharply (Sobel on each colour, strongest kept; automatic cut-off)
function edgeMap(rgba: Uint8ClampedArray, g: Grid): Uint8Array {
  const { w, h } = g;
  const planes = blurChannels(rgba, w, h);
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let best = 0;
      for (const p of planes) {
        const i = y * w + x;
        const gx = p[i - w + 1] + 2 * p[i + 1] + p[i + w + 1] - (p[i - w - 1] + 2 * p[i - 1] + p[i + w - 1]);
        const gy = p[i + w - 1] + 2 * p[i + w] + p[i + w + 1] - (p[i - w - 1] + 2 * p[i - w] + p[i - w + 1]);
        const m = Math.sqrt(gx * gx + gy * gy);
        if (m > best) best = m;
      }
      mag[y * w + x] = best;
    }
  }
  const cut = Math.max(otsu(mag), EDGE_MIN_STRENGTH);
  const edges = new Uint8Array(w * h);
  for (let i = 0; i < mag.length; i++) edges[i] = mag[i] > cut ? 1 : 0;
  return edges;
}

// Make edge lines one pixel thicker in every direction
function dilate(mask: Uint8Array, g: Grid): Uint8Array {
  const { w, h } = g;
  const out = mask.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

// Starting from every border pixel, spread through non-edge pixels and mark them "outside" (1 = outside)
function floodOutside(edges: Uint8Array, g: Grid): Uint8Array {
  const { w, h } = g;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const k = y * w + x;
    if (!edges[k] && !outside[k]) { outside[k] = 1; stack.push(k); }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % w, y = (k / w) | 0;
    if (x > 0) seed(x - 1, y);
    if (x + 1 < w) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y + 1 < h) seed(x, y + 1);
  }
  return outside;
}

// Shrink every shape (the "not outside" pixels) by one pixel per pass: a pixel stays only if all 8 neighbours are inside too
function trimShapes(outside: Uint8Array, g: Grid, passes: number): Uint8Array {
  const { w, h } = g;
  let out = outside.slice();
  for (let p = 0; p < passes; p++) {
    const prev = out.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (prev[y * w + x]) continue;
        let keep = x > 0 && y > 0 && x + 1 < w && y + 1 < h;
        if (keep) {
          scan: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (prev[(y + dy) * w + x + dx]) { keep = false; break scan; }
        }
        if (!keep) out[y * w + x] = 1;
      }
    }
  }
  return out;
}

// Split the "not outside" pixels into separate connected pieces; each piece is a list of pixel positions
function labelRegions(outside: Uint8Array, g: Grid): Int32Array[] {
  const { w, h } = g;
  const seen = outside.slice();
  const regions: Int32Array[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start]) continue;
    const pixels: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      pixels.push(k);
      const x = k % w, y = (k / w) | 0;
      const push = (nk: number) => { if (!seen[nk]) { seen[nk] = 1; stack.push(nk); } };
      if (x > 0) push(k - 1);
      if (x + 1 < w) push(k + 1);
      if (y > 0) push(k - w);
      if (y + 1 < h) push(k + w);
    }
    regions.push(Int32Array.from(pixels));
  }
  return regions;
}

// Trim one piece `extra` more pixels and return what is left as separate pieces
function splitRegion(pixels: Int32Array, g: Grid, extra: number): Int32Array[] {
  const outside = new Uint8Array(g.w * g.h).fill(1);
  for (const k of pixels) outside[k] = 0;
  return labelRegions(trimShapes(outside, g, extra), g);
}

/* ---------- geometry ---------- */

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// The "rubber band" around a set of points (Andrew's monotone chain), as the corner points in order
function convexHull(points: Point[]): Point[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const unique: Point[] = [];
  for (const p of pts) if (!unique.length || unique[unique.length - 1].x !== p.x || unique[unique.length - 1].y !== p.y) unique.push(p);
  if (unique.length < 3) return unique;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Total length of a closed outline
const perimeter = (poly: Point[]) => poly.reduce((s, p, i) => s + distance(p, poly[(i + 1) % poly.length]), 0);

// Area inside a closed outline (the sign depends on direction)
function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// Distance from point p to the line through a and b
function lineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return distance(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

// Simplify an open line (Douglas-Peucker): keep only the points that stick out more than eps from a straight line
function douglasPeucker(pts: Point[], eps: number, out: Point[]): void {
  if (pts.length < 3) { out.push(pts[0]); return; }
  const a = pts[0], b = pts[pts.length - 1];
  let index = 0, biggest = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = lineDistance(pts[i], a, b);
    if (d > biggest) { biggest = d; index = i; }
  }
  if (biggest > eps) {
    douglasPeucker(pts.slice(0, index + 1), eps, out);
    douglasPeucker(pts.slice(index), eps, out);
  } else {
    out.push(a);
  }
}

// Simplify a closed outline: start from the two points farthest apart and simplify both halves
function approxClosed(poly: Point[], eps: number): Point[] {
  const n = poly.length;
  if (n <= 4) return poly.slice();
  const farthest = (from: Point) => {
    let best = 0, bestD = 0;
    poly.forEach((p, i) => { const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2; if (d > bestD) { bestD = d; best = i; } });
    return best;
  };
  const i0 = farthest(poly[0]);
  const i1 = farthest(poly[i0]);
  const s = Math.min(i0, i1), e = Math.max(i0, i1);
  const first = poly.slice(s, e + 1);
  const second = poly.slice(e).concat(poly.slice(0, s + 1));
  const out: Point[] = [];
  douglasPeucker(first, eps, out);
  douglasPeucker(second, eps, out);
  const deduped = out.filter((p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y);
  if (deduped.length > 1 && deduped[0].x === deduped[deduped.length - 1].x && deduped[0].y === deduped[deduped.length - 1].y) deduped.pop();
  return deduped;
}

// The smallest rectangle (at any angle) that fits round a convex outline, found by trying each outline side as one rectangle side
function minAreaRect(hull: Point[]): Quad | null {
  let best: { area: number; quad: Quad } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len, uy = dy / len, vx = -uy, vy = ux;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const pu = p.x * ux + p.y * uy, pv = p.x * vx + p.y * vy;
      minU = Math.min(minU, pu); maxU = Math.max(maxU, pu); minV = Math.min(minV, pv); maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const corner = (u: number, v: number): Point => ({ x: u * ux + v * vx, y: u * uy + v * vy });
      best = { area, quad: [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)] };
    }
  }
  return best ? best.quad : null;
}

// Move each side of a 4-corner shape inward by px pixels (outward if px is negative)
function shrinkQuad(q: Point[], px: number): Point[] {
  if (px === 0) return q;
  const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
  return q.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    // A corner moves about 1.4 times as far as the sides next to it
    return d > Math.abs(px) * 2 ? { x: p.x - (dx / d) * px * Math.SQRT2, y: p.y - (dy / d) * px * Math.SQRT2 } : p;
  });
}

// Put four corners in order: sort by height; the top two left-to-right are top-left/top-right, the bottom two are bottom-right/bottom-left
function orderCorners(q: Point[]): Point[] {
  const s = q.slice().sort((a, b) => a.y - b.y);
  const top = [s[0], s[1]].sort((a, b) => a.x - b.x);
  const bottom = [s[2], s[3]].sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

// How much two boxes (left, top, width, height) overlap: shared area / combined area
function overlap(a: number[], b: number[]): number {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const shared = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const both = a[2] * a[3] + b[2] * b[3] - shared;
  return both > 0 ? shared / both : 0;
}

/* ---------- judging one shape ---------- */

// Decide whether one connected piece is a card; if so, describe it. "extra" is how many more pixels than usual it was trimmed.
function judge(pixels: Int32Array, g: Grid, frame: { w: number; h: number }, minArea: number, extra: number): (ShapeFind & { box: number[] }) | null {
  const { w, h } = g;
  const area = pixels.length;
  // Too small to be a card, or the whole picture
  if (area < minArea || area > 0.95 * w * h) return null;
  // The outline: the rubber band round the piece, built from the corners of its border pixels
  const member = new Uint8Array(w * h);
  for (const k of pixels) member[k] = 1;
  const corners: Point[] = [];
  for (const k of pixels) {
    const x = k % w, y = (k / w) | 0;
    const border = x === 0 || y === 0 || x + 1 >= w || y + 1 >= h || !member[k - 1] || !member[k + 1] || !member[k - w] || !member[k + w];
    if (border) corners.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
  }
  const hull = convexHull(corners);
  if (hull.length < 3) return null;
  // Simplify to 4 corners, or use the smallest tilted rectangle round it
  const simplified = approxClosed(hull, APPROX_EPSILON * perimeter(hull));
  let quad: Point[] | null = simplified.length === 4 ? simplified : minAreaRect(hull);
  if (!quad) return null;
  const quadArea = Math.abs(polygonArea(quad));
  if (quadArea <= 0) return null;
  const fill = Math.min(1, area / quadArea);
  if (fill < MIN_FILL) return null;
  // The edge lines were fattened and the shape trimmed: move the corners by the difference so they sit on the real border
  quad = shrinkQuad(quad, DILATE_PASSES - (TRIM_PASSES + extra));
  // Pixels of the working picture -> fractions of the picture
  let q = orderCorners(quad.map((p) => ({ x: p.x / w, y: p.y / h })));
  // Stand the card upright in real picture pixels (long sides up and down)
  const side = (a: Point, b: Point) => Math.hypot((a.x - b.x) * frame.w, (a.y - b.y) * frame.h);
  const horiz = side(q[0], q[1]) + side(q[3], q[2]);
  const vert = side(q[0], q[3]) + side(q[1], q[2]);
  if (horiz > vert) q = [q[1], q[2], q[3], q[0]];
  // The box round the card must not touch the picture's edge
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  if (x0 < EDGE_MARGIN || y0 < EDGE_MARGIN || x1 > 1 - EDGE_MARGIN || y1 > 1 - EDGE_MARGIN) return null;
  // The score: how card-shaped, how solid and how big
  const short = Math.min(horiz, vert) / 2, long = Math.max(horiz, vert) / 2;
  const ratio = long > 0 ? short / long : 0;
  const aspectScore = Math.exp(-(((ratio - CARD_ASPECT) / ASPECT_TOLERANCE) ** 2));
  const fillScore = Math.min(1, Math.max(0, (fill - MIN_FILL) / (1 - MIN_FILL)));
  const sizeScore = Math.min(1, Math.max(0, quadArea / (w * h) / FULL_SCORE_AREA));
  const score = aspectScore * (0.6 + 0.4 * fillScore) * (0.5 + 0.5 * sizeScore);
  return { quad: q as Quad, score, fill, box: [x0, y0, x1 - x0, y1 - y0] };
}

/* ---------- the finder ---------- */

// Find every card in a picture, best first. "workLongSide" is the size of the working copy (longest side).
export function findShapes(picture: RgbaPicture, workLongSide = WORK_LONG_SIDE): ShapeFind[] {
  const scale = workLongSide / Math.max(picture.width, picture.height, 1);
  const w = Math.max(16, Math.round(picture.width * scale));
  const h = Math.max(16, Math.round(picture.height * scale));
  const g: Grid = { w, h };
  const small = resizeRgba(picture, w, h);
  const edges = edgeMap(small, g);
  let thick = edges;
  for (let i = 0; i < DILATE_PASSES; i++) thick = dilate(thick, g);
  const outside = trimShapes(floodOutside(thick, g), g, TRIM_PASSES);
  const minArea = (MIN_AREA_OF_416 / (DETECT_SIZE * DETECT_SIZE)) * w * h;
  const frame = { w: picture.width, h: picture.height };
  const found: (ShapeFind & { box: number[] })[] = [];
  for (const region of labelRegions(outside, g)) {
    const one = judge(region, g, frame, minArea, 0);
    if (one) { found.push(one); continue; }
    // Not card-shaped: maybe two cards joined by a shadow. Trim harder and try the pieces.
    if (region.length < 3 * minArea) continue;
    for (const extra of [2, 4, 7]) {
      const ok = splitRegion(region, g, extra).map((part) => judge(part, g, frame, minArea, extra)).filter((d): d is ShapeFind & { box: number[] } => d !== null);
      if (ok.length) { found.push(...ok); break; }
    }
  }
  const confident = found.filter((d) => d.score >= MIN_SCORE).sort((a, b) => b.score - a.score);
  const kept: typeof confident = [];
  for (const d of confident) if (kept.every((k) => overlap(k.box, d.box) <= MERGE_OVERLAP)) kept.push(d);
  return kept.map(({ quad, score, fill }) => ({ quad, score, fill }));
}

// Ours: when looking for THE card in a live picture, a shape smaller than this share of the picture is not taken
// (a card held up to be scanned fills far more; on the test photos a stray 1% corner of a hand was once taken for one)
export const MIN_CARD_SHARE = 0.04;

// The best card in the picture, or null (the same kind of answer as findCard in cardFinder.ts)
export function findCardByShape(picture: RgbaPicture, workLongSide = WORK_LONG_SIDE): Quad | null {
  for (const found of findShapes(picture, workLongSide)) {
    // The corners are fractions of the picture, so the card's area share is the area of its corners
    const q = found.quad;
    let twice = 0;
    for (let i = 0; i < 4; i++) twice += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
    if (Math.abs(twice) / 2 >= MIN_CARD_SHARE) return q;
  }
  return null;
}
