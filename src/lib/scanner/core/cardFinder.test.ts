/* =====================================================================
   CHECKS FOR THE CARD FINDER AND THE STRAIGHTENER
   Run with:  node --test src/lib/scanner/core/*.test.ts
   Each check draws a pretend camera picture (a card of known corners on a
   "table", with a little camera noise) and asks the finder where the card is,
   so we know the answer in advance. We also straighten a tilted picture and
   compare it with the flat original.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { blendQuads, findCard, quadCentre, quadShift } from './cardFinder.ts';
import { applyHomography, homographyFromPoints, warpCard, type Point, type Quad } from './perspective.ts';

const W = 320;
const H = 180;

// Repeatable "random" numbers, so a failing check fails the same way each time
function randoms(seed: number) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

// The pretend card as a flat picture: a black border, a coloured inside with a gradient, rounded corners
function cardColour(u: number, v: number): [number, number, number] | null {
  // Rounded corners (about 5% of the width)
  const radius = 0.048;
  const rx = 0.5 - Math.abs(u - 0.5);
  const ry = (0.5 - Math.abs(v - 0.5)) * (88 / 63);
  if (rx < radius && ry < radius && Math.hypot(radius - rx, radius - ry) > radius) return null;
  if (u < 0.05 || u > 0.95 || v < 0.035 || v > 0.965) return [20, 20, 20];
  return [60 + 160 * u, 80 + 120 * v, 200 - 150 * u];
}

// A picture of the card (corners "quad", in this scene's pixels) on a table, with optional extras drawn on top
function scene(quad: Quad, options: { table?: [number, number, number]; extra?: (x: number, y: number) => boolean; seed?: number } = {}) {
  const table = options.table ?? [120, 90, 60];
  const random = randoms(options.seed ?? 1);
  const backwards = homographyFromPoints(quad, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = applyHomography(backwards, x + 0.5, y + 0.5);
      let colour: [number, number, number] | null = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? cardColour(p.x, p.y) : null;
      if (!colour && options.extra?.(x, y)) colour = [224, 172, 140];
      colour = colour ?? table;
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = colour[k] + (random() - 0.5) * 12;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const quadOf = (...points: number[]): Quad => [0, 2, 4, 6].map((k) => ({ x: points[k], y: points[k + 1] })) as Quad;

// A card of the right shape, turned by "degrees" and squeezed a little for the camera's angle
function tilted(centre: Point, height: number, degrees: number, squeeze = 0): Quad {
  const halfW = (height * 63) / 88 / 2;
  const halfH = height / 2;
  const turn = (degrees * Math.PI) / 180;
  const corners: [number, number][] = [[-halfW + squeeze, -halfH], [halfW - squeeze, -halfH], [halfW, halfH], [-halfW, halfH]];
  return corners.map(([x, y]) => ({ x: centre.x + x * Math.cos(turn) - y * Math.sin(turn), y: centre.y + x * Math.sin(turn) + y * Math.cos(turn) })) as Quad;
}

// How far each found corner is from the true one, in card widths
function worstError(found: Quad, truth: Quad): number {
  const cardWidth = Math.hypot(truth[0].x - truth[1].x, truth[0].y - truth[1].y);
  let worst = 0;
  for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.hypot(found[k].x * W - truth[k].x, found[k].y * H - truth[k].y) / cardWidth);
  return worst;
}

/* ---------- straightening ---------- */

test('the stretching rule carries the four corners onto the four corners', () => {
  const from = quadOf(0, 0, 1, 0, 1, 1, 0, 1);
  const to = quadOf(30, 10, 200, 40, 180, 160, 20, 120);
  const rule = homographyFromPoints(from, to);
  for (let k = 0; k < 4; k++) {
    const p = applyHomography(rule, from[k].x, from[k].y);
    assert.ok(Math.abs(p.x - to[k].x) < 1e-6 && Math.abs(p.y - to[k].y) < 1e-6);
  }
});

test('a tilted, squeezed card is straightened back to the flat card', () => {
  const quad = tilted({ x: 160, y: 90 }, 150, 20, 12);
  const picture = scene(quad);
  const out = warpCard(picture, quad, 126, 176);
  // Compare with the flat card, away from the rounded corners and the edge
  let total = 0;
  let count = 0;
  for (let j = 14; j < 162; j += 3) {
    for (let i = 10; i < 116; i += 3) {
      const expected = cardColour((i + 0.5) / 126, (j + 0.5) / 176)!;
      const at = (j * 126 + i) * 4;
      total += Math.abs(out[at] - expected[0]) + Math.abs(out[at + 1] - expected[1]);
      count += 2;
    }
  }
  assert.ok(total / count < 8, `the straightened card differs from the flat card by ${(total / count).toFixed(1)} on average`);
});

/* ---------- finding the card ---------- */

test('finds an upright card', () => {
  const truth = tilted({ x: 160, y: 90 }, 150, 0);
  const found = findCard(scene(truth));
  assert.ok(found);
  assert.ok(worstError(found!, truth) < 0.04, `corners off by ${worstError(found!, truth).toFixed(3)} card widths`);
});

test('finds a card turned 25 degrees, 40 degrees the other way, and 75 degrees (the top corner stays the top-left)', () => {
  for (const degrees of [25, -40, 75]) {
    const truth = tilted({ x: 150, y: 90 }, 140, degrees);
    const found = findCard(scene(truth));
    assert.ok(found, `no card found at ${degrees} degrees`);
    // The finder starts from the short side that is higher up, so compare with the truth in that same order
    const turned = (k: number) => truth[k];
    const upper = turned(0).y + turned(1).y <= turned(2).y + turned(3).y;
    const expected: Quad = upper ? truth : [truth[2], truth[3], truth[0], truth[1]];
    assert.ok(worstError(found!, expected) < 0.05, `at ${degrees} degrees the corners are off by ${worstError(found!, expected).toFixed(3)} card widths`);
  }
});

test('finds a card seen at an angle (one side looks narrower)', () => {
  const truth = tilted({ x: 170, y: 90 }, 150, 8, 14);
  const found = findCard(scene(truth));
  assert.ok(found);
  assert.ok(worstError(found!, truth) < 0.05);
});

test('finds a card on a pale table and on a dark table', () => {
  for (const table of [[225, 220, 205], [60, 70, 95]] as [number, number, number][]) {
    const truth = tilted({ x: 160, y: 90 }, 140, 12);
    const found = findCard(scene(truth, { table }));
    assert.ok(found, `no card found on the table ${table}`);
    assert.ok(worstError(found!, truth) < 0.05, `on table ${table} corners are off by ${worstError(found!, truth).toFixed(3)} card widths`);
  }
});

test('a thumb on the card edge does not pull the corners out of place', () => {
  const truth = tilted({ x: 150, y: 88 }, 140, 0);
  // A fingertip sticking out from the card's lower right: 9 pixels wide, 9 long
  const extra = (x: number, y: number) => x > truth[2].x - 12 && x < truth[2].x - 3 && y > truth[2].y - 4 && y < truth[2].y + 9;
  const found = findCard(scene(truth, { extra }));
  assert.ok(found);
  assert.ok(worstError(found!, truth) < 0.08, `corners off by ${worstError(found!, truth).toFixed(3)} card widths`);
});

test('says "no card" for an empty table, a tiny card, a square, and a card cut off by the edge', () => {
  const empty = scene(tilted({ x: -500, y: -500 }, 100, 0));
  assert.equal(findCard(empty), null);
  assert.equal(findCard(scene(tilted({ x: 160, y: 90 }, 40, 0))), null);
  const square = quadOf(100, 30, 200, 30, 200, 130, 100, 130);
  assert.equal(findCard(scene(square)), null);
  assert.equal(findCard(scene(tilted({ x: 160, y: 20 }, 150, 0))), null);
});

/* ---------- following the card ---------- */

test('the following helpers measure movement, blend and find the middle', () => {
  const a = tilted({ x: 160, y: 90 }, 100, 0).map((p) => ({ x: p.x / W, y: p.y / H })) as Quad;
  const b = a.map((p) => ({ x: p.x + 0.1, y: p.y })) as Quad;
  assert.ok(Math.abs(quadShift(a, b) - 0.1) < 1e-9);
  assert.equal(quadShift(a, a), 0);
  const half = blendQuads(a, b, 0.5);
  assert.ok(Math.abs(quadShift(a, half) - 0.05) < 1e-9);
  const middle = quadCentre(a);
  assert.ok(Math.abs(middle.x - 0.5) < 1e-9 && Math.abs(middle.y - 0.5) < 1e-9);
});
