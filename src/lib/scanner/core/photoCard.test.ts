/* =====================================================================
   TESTS for photoCard.ts: grey to colour, the cut-out tries, the flat picture's height, the corner numbers.
   Run with:  npx tsx --test src/lib/scanner/core/photoCard.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cutOutTries, flatHeight, grayToRgba, quadNumbers } from './photoCard.ts';
import type { Quad } from './perspective.ts';

const card: Quad = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }];

test('grey becomes red, green and blue the same, fully solid', () => {
  const rgba = grayToRgba({ data: new Uint8Array([0, 200]), width: 2, height: 1 });
  assert.deepEqual([...rgba.data], [0, 0, 0, 255, 200, 200, 200, 255]);
  assert.equal(rgba.width, 2);
});

test('four ways to cut a find out: as found, widened, and both upside down', () => {
  const tries = cutOutTries(card);
  assert.equal(tries.length, 4);
  assert.deepEqual(tries[0], card);
  // widened: bigger on every side
  assert.ok(tries[1][0].x < card[0].x && tries[1][2].y > card[2].y);
  // upside down: the first corner is the old bottom-right one
  assert.deepEqual(tries[2][0], card[2]);
  assert.deepEqual(tries[3][0], tries[1][2]);
});

test('the flat picture is about as tall as the card looked, within limits', () => {
  assert.equal(flatHeight(card, { w: 3000, h: 4000 }), 1500);
  assert.equal(flatHeight(card, { w: 1000, h: 1000 }), 800);
  assert.equal(flatHeight(card, { w: 500, h: 500 }), 700);
});

test('the corners as eight numbers', () => {
  assert.deepEqual(quadNumbers(card), [0.2, 0.1, 0.8, 0.1, 0.8, 0.9, 0.2, 0.9]);
});
