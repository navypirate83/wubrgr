/* =====================================================================
   STRAIGHTENING A TILTED CARD (shared, plain TypeScript, no imports)
   When a card is held at an angle, its four corners in the camera picture form a
   lopsided four-sided shape instead of a neat upright rectangle. This file turns
   that shape back into a flat, upright card picture, the way a flat-bed scanner
   would have seen it:
     1. homographyFromPoints works out the "stretching rule" that carries four
        points onto four other points (it solves a little set of equations).
     2. warpCard walks over every pixel of the NEW flat picture, uses the rule
        to ask "where in the camera picture does this pixel come from?", and
        copies the colour from there (blending the four nearest pixels so the
        result is smooth, not blocky).
   The scanner's reading code then works on that straight picture, exactly as if
   the card had been lined up perfectly.
   ===================================================================== */

export type Point = { x: number; y: number };
// The four corners of a card in this order: top-left, top-right, bottom-right, bottom-left
export type Quad = [Point, Point, Point, Point];
// A picture as the browser hands it over: red, green, blue, alpha for every pixel
export type RgbaPicture = { data: ArrayLike<number>; width: number; height: number };

// Eight numbers describing how points are stretched (x and y are worked out from u and v, see applyHomography)
export type Homography = [number, number, number, number, number, number, number, number];

const UNIT_SQUARE: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

// The rule that carries four points ("from") exactly onto four others ("to"). Each pair gives two
// equations; eight equations for eight unknowns are solved by the usual "subtract rows" method.
export function homographyFromPoints(from: Quad, to: Quad): Homography {
  const rows: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const { x: u, y: v } = from[k];
    const { x, y } = to[k];
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let col = 0; col < 8; col++) {
    // Swap up the row with the biggest number in this column (keeps the sums accurate)
    let best = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[best][col])) best = r;
    [rows[col], rows[best]] = [rows[best], rows[col]];
    const pivot = rows[col][col];
    if (Math.abs(pivot) < 1e-12) throw new Error('These corners cannot be straightened');
    for (let c = col; c < 9; c++) rows[col][c] /= pivot;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = rows[r][col];
      if (factor === 0) continue;
      for (let c = col; c < 9; c++) rows[r][c] -= factor * rows[col][c];
    }
  }
  return rows.map((row) => row[8]) as Homography;
}

// Where a point goes under the rule
export function applyHomography(h: Homography, u: number, v: number): Point {
  const w = h[6] * u + h[7] * v + 1;
  return { x: (h[0] * u + h[1] * v + h[2]) / w, y: (h[3] * u + h[4] * v + h[5]) / w };
}

// The rule that takes a flat card, with (0,0) its top-left and (1,1) its bottom-right, to where it sits in the camera picture
export const cardToPicture = (quad: Quad): Homography => homographyFromPoints(UNIT_SQUARE, quad);

// How long the card's tallest side looks in the camera picture (in pixels): used to choose how big to make the flat picture
export function longestSide(quad: Quad): number {
  let longest = 0;
  for (let k = 0; k < 4; k++) {
    const a = quad[k];
    const b = quad[(k + 1) % 4];
    longest = Math.max(longest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return longest;
}

// The flat, upright card picture: "outWidth" x "outHeight" pixels, as red-green-blue-alpha numbers
export function warpCard(source: RgbaPicture, quad: Quad, outWidth: number, outHeight: number): Uint8ClampedArray {
  const rule = cardToPicture(quad);
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const { data, width, height } = source;
  const lastX = width - 1;
  const lastY = height - 1;
  let o = 0;
  for (let j = 0; j < outHeight; j++) {
    const v = (j + 0.5) / outHeight;
    for (let i = 0; i < outWidth; i++) {
      const u = (i + 0.5) / outWidth;
      const w = rule[6] * u + rule[7] * v + 1;
      // Where this pixel comes from in the camera picture (pixel centres sit half a pixel in)
      let x = (rule[0] * u + rule[1] * v + rule[2]) / w - 0.5;
      let y = (rule[3] * u + rule[4] * v + rule[5]) / w - 0.5;
      x = x < 0 ? 0 : x > lastX ? lastX : x;
      y = y < 0 ? 0 : y > lastY ? lastY : y;
      // Blend the four nearest camera pixels
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, lastX);
      const y1 = Math.min(y0 + 1, lastY);
      const fx = x - x0;
      const fy = y - y0;
      const a = (y0 * width + x0) * 4;
      const b = (y0 * width + x1) * 4;
      const c = (y1 * width + x0) * 4;
      const d = (y1 * width + x1) * 4;
      for (let k = 0; k < 3; k++) {
        const top = data[a + k] * (1 - fx) + data[b + k] * fx;
        const bottom = data[c + k] * (1 - fx) + data[d + k] * fx;
        out[o + k] = top * (1 - fy) + bottom * fy;
      }
      out[o + 3] = 255;
      o += 4;
    }
  }
  return out;
}
