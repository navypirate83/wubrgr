/* =====================================================================
   CHECKS FOR "SNAPPING A CARD'S CORNERS ONTO ITS REAL EDGES"
   Run with:  node --test src/lib/scanner/core/cornerSnap.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { snapCorners } from './cornerSnap.ts';
import type { Quad, RgbaPicture } from './perspective.ts';

// A dark 300 x 300 picture with a bright card-shaped rectangle from (100,60) to (200,200)
function scene(): RgbaPicture {
  const width = 300;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= 100 && x < 200 && y >= 60 && y < 200;
      const at = (y * width + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = inside ? 220 : 30;
      data[at + 3] = 255;
    }
  }
  return { data, width, height };
}

// Corners of the real rectangle, each moved by (dx, dy)
function quadOff(dx: number, dy: number): Quad {
  return [{ x: 100 + dx, y: 60 + dy }, { x: 200 + dx, y: 60 + dy }, { x: 200 + dx, y: 200 + dy }, { x: 100 + dx, y: 200 + dy }];
}

const error = (q: Quad) => Math.max(...[[100, 60], [200, 60], [200, 200], [100, 200]].map(([x, y], k) => Math.hypot(q[k].x - x, q[k].y - y)));

test('corners that are 3 pixels too far out are pulled back onto the card edge', () => {
  const out: Quad = [{ x: 97, y: 57 }, { x: 203, y: 57 }, { x: 203, y: 203 }, { x: 97, y: 203 }];
  assert.ok(error(out) > 4);
  assert.ok(error(snapCorners(scene(), out)) < 1.5);
});

test('corners that are 3 pixels too far in are pushed out onto the card edge', () => {
  const inward: Quad = [{ x: 103, y: 63 }, { x: 197, y: 63 }, { x: 197, y: 197 }, { x: 103, y: 197 }];
  assert.ok(error(snapCorners(scene(), inward)) < 1.5);
});

test('corners already on the edge stay put', () => {
  assert.ok(error(snapCorners(scene(), quadOff(0, 0))) < 1);
});

test('a plain picture with no edge leaves the corners alone', () => {
  const flat: RgbaPicture = { data: new Uint8ClampedArray(300 * 300 * 4).fill(100), width: 300, height: 300 };
  const start = quadOff(2, 2);
  const out = snapCorners(flat, start);
  start.forEach((p, k) => assert.ok(Math.hypot(out[k].x - p.x, out[k].y - p.y) < 1e-6));
});
