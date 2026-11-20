/* =====================================================================
   SNAPPING A CARD'S CORNERS ONTO ITS REAL EDGES (shared, plain TypeScript, no imports of its own
   except the picture types)
   The card finder gives corners that are close but often a pixel or two off (the blurry edge, a shadow,
   the card's rounded corners). The flat picture made from those corners then has a sliver of table in
   it, or loses a sliver of card, and everything read from it is a little less reliable. This file
   nudges the four corners onto the real edges. It is a port of "refine_quad" from the legacy card
   scanner; the idea and the numbers are that app's, not read from the original Android app.
   The steps, in plain words:
     1. Each side of the card is treated as a line. Each HALF of a side is looked at on its own
        (so a side that is a little tilted gets its tilt corrected too).
     2. For each half, try small steps outward and inward from where the side is now. At every step,
        walk along that half and add up how sharply the brightness changes across the line: a real
        card edge changes a lot all the way along.
     3. Of the steps that are strong peaks (at least 40% as strong as the strongest), choose the one
        nearest where the side already was. A farther peak is more likely a shadow or a line printed
        on the card than the card's edge.
     4. Each side's two chosen points make a new side line. Each new corner is where two neighbouring
        side lines cross. If anything looks wrong (a side too short, lines that never cross, a
        corner that would move too far) the corners are returned unchanged.
   The corners are in the picture's own pixels, in this order: top-left, top-right, bottom-right,
   bottom-left.
   ===================================================================== */

import type { Point, Quad, RgbaPicture } from './perspective.ts';

// How far (as a share of the card's short side) a side may be moved. Ours: from the legacy scanner.
export const SNAP_REACH = 0.025;
// A peak counts only if it is at least this share as strong as the strongest one
const PEAK_SHARE = 0.4;
// Each side is fitted in two halves: these are where along the side (0 = one corner, 1 = the next) each half is measured
const HALVES: [number, number][] = [[0.12, 0.48], [0.52, 0.88]];
// How many spots along a half are measured at each step
const SAMPLES_PER_HALF = 10;
// The size of each step outward or inward, in pixels
const STEP = 0.5;

// How bright the picture is at any position, blending the four nearest pixels
function brightnessAt(picture: RgbaPicture, x: number, y: number): number {
  const { data, width, height } = picture;
  const cx = Math.min(Math.max(x, 0), width - 1.001);
  const cy = Math.min(Math.max(y, 0), height - 1.001);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const grey = (xx: number, yy: number) => {
    const at = (yy * width + xx) * 4;
    return 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2];
  };
  const top = grey(x0, y0) * (1 - fx) + grey(x0 + 1, y0) * fx;
  const bottom = grey(x0, y0 + 1) * (1 - fx) + grey(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// The point where two lines cross (each line is given by two points), or null when they run side by side
function crossing(a: [Point, Point], b: [Point, Point]): Point | null {
  const r = { x: a[1].x - a[0].x, y: a[1].y - a[0].y };
  const s = { x: b[1].x - b[0].x, y: b[1].y - b[0].y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((b[0].x - a[0].x) * s.y - (b[0].y - a[0].y) * s.x) / denom;
  return { x: a[0].x + r.x * t, y: a[0].y + r.y * t };
}

// Move the four corners onto the card's real edges. "quad" is in the picture's pixels. Returns the new corners.
export function snapCorners(picture: RgbaPicture, quad: Quad, reachShare = SNAP_REACH): Quad {
  const centre = { x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4 };
  const shortSide = Math.min(distance(quad[0], quad[1]), distance(quad[1], quad[2]));
  const reach = Math.max(shortSide * reachShare, 2);
  const lines: [Point, Point][] = [];
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const length = distance(a, b);
    if (length < 4) return quad;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    // The direction pointing straight out of the card from this side
    let nx = -uy;
    let ny = ux;
    if (((a.x + b.x) / 2 - centre.x) * nx + ((a.y + b.y) / 2 - centre.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const fitted: Point[] = [];
    for (const [t0, t1] of HALVES) {
      // How strong the edge is at each trial step outward or inward
      const steps = Math.ceil((reach * 2) / STEP);
      const responses: { offset: number; strength: number }[] = [];
      for (let s = 0; s <= steps; s++) {
        const offset = -reach + s * STEP;
        let strength = 0;
        for (let k = 0; k < SAMPLES_PER_HALF; k++) {
          const t = t0 + ((t1 - t0) * k) / (SAMPLES_PER_HALF - 1);
          const px = a.x + (b.x - a.x) * t + nx * offset;
          const py = a.y + (b.y - a.y) * t + ny * offset;
          strength += Math.abs(brightnessAt(picture, px + nx, py + ny) - brightnessAt(picture, px - nx, py - ny));
        }
        responses.push({ offset, strength });
      }
      const strongest = Math.max(...responses.map((r) => r.strength));
      // Of the strong peaks, take the one nearest where the side already was
      let chosen = 0;
      let nearest = Infinity;
      responses.forEach((r, j) => {
        const left = j > 0 ? responses[j - 1].strength : -Infinity;
        const right = j + 1 < responses.length ? responses[j + 1].strength : -Infinity;
        const isPeak = r.strength >= left && r.strength >= right;
        if (strongest > 0 && isPeak && r.strength >= PEAK_SHARE * strongest && Math.abs(r.offset) < nearest) {
          nearest = Math.abs(r.offset);
          chosen = r.offset;
        }
      });
      const tm = (t0 + t1) / 2;
      fitted.push({ x: a.x + (b.x - a.x) * tm + nx * chosen, y: a.y + (b.y - a.y) * tm + ny * chosen });
    }
    lines.push([fitted[0], fitted[1]]);
  }
  // Each new corner is where the side ending at it meets the side starting at it
  const out: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const corner = crossing(lines[(i + 3) % 4], lines[i]);
    if (!corner || distance(corner, quad[i]) > reach * 3) return quad;
    out.push(corner);
  }
  return out as Quad;
}
