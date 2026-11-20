/* =====================================================================
   CHECKS FOR THE "SHAPE" CARD FINDER
   Run with:  node --test src/lib/scanner/core/shapeFinder.test.ts
   Each picture is made up: a plain table with one or two card-shaped rectangles on it.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { findCardByShape, findShapes } from './shapeFinder.ts';
import type { RgbaPicture } from './perspective.ts';

// A 320 x 450 picture of a plain beige table, with cards drawn on it. A card is a dark border round a light inside
// (or, with plain = true, all one light colour).
function scene(cards: { x: number; y: number; w: number; h: number }[], plain = false): RgbaPicture {
  const width = 320, height = 450;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let colour = [190, 160, 120];
      for (const c of cards) {
        if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
          const inside = x >= c.x + 8 && x < c.x + c.w - 8 && y >= c.y + 8 && y < c.y + c.h - 8;
          colour = inside || plain ? [230, 235, 240] : [25, 25, 30];
        }
      }
      data.set([colour[0], colour[1], colour[2], 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

test('a card on a plain table is found, with its corners close to the real ones (top-left first)', () => {
  const quad = findCardByShape(scene([{ x: 80, y: 100, w: 140, h: 196 }]), 320);
  assert.ok(quad);
  const truth = [[80, 100], [220, 100], [220, 296], [80, 296]];
  quad!.forEach((p, k) => {
    assert.ok(Math.abs(p.x * 320 - truth[k][0]) < 4, `corner ${k} x`);
    assert.ok(Math.abs(p.y * 450 - truth[k][1]) < 4, `corner ${k} y`);
  });
});

test('a plain table with no card gives nothing', () => {
  assert.equal(findCardByShape(scene([]), 320), null);
});

test('a shape that is not card-shaped is not taken for a card', () => {
  assert.equal(findCardByShape(scene([{ x: 40, y: 150, w: 240, h: 90 }]), 320), null);
});

test('a card touching the edge of the picture is not taken (it is only partly in view)', () => {
  assert.equal(findCardByShape(scene([{ x: 0, y: 100, w: 140, h: 196 }], true), 320), null);
});

test('two cards side by side are both found, and the best comes first', () => {
  const found = findShapes(scene([{ x: 20, y: 120, w: 120, h: 168 }, { x: 180, y: 120, w: 120, h: 168 }]), 320);
  assert.equal(found.length, 2);
  assert.ok(found[0].score >= found[1].score);
});

test('a card lying on its side comes back standing upright (long sides up and down)', () => {
  const quad = findCardByShape(scene([{ x: 60, y: 140, w: 196, h: 140 }]), 320)!;
  assert.ok(quad);
  const side = (a: number, b: number) => Math.hypot((quad[a].x - quad[b].x) * 320, (quad[a].y - quad[b].y) * 450);
  assert.ok(side(0, 3) > side(0, 1));
});
