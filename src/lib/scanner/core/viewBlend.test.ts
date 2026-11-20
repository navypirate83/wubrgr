/* =====================================================================
   CHECKS FOR "BLENDING SEVERAL LOOKS AT ONE CARD"
   Run with:  node --test src/lib/scanner/core/viewBlend.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewBlend, confidenceOf, sharpnessOf, BLEND_MAX_VIEWS } from './viewBlend.ts';

test('a tie between the two best matches gives 0.5, a clear win gives close to 1', () => {
  assert.equal(confidenceOf(0.8, 0.8), 0.5);
  assert.ok(confidenceOf(0.9, 0.6) > 0.99);
  assert.equal(confidenceOf(0.9, null), 0.5);
});

test('a sharp picture scores higher than a blurry one', () => {
  const size = 60;
  const sharp = new Uint8ClampedArray(size * size * 4);
  const blurry = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    sharp.set([(i % 2) * 255, (i % 2) * 255, (i % 2) * 255, 255], i * 4);
    blurry.set([128, 128, 128, 255], i * 4);
  }
  assert.ok(sharpnessOf({ data: sharp, width: size, height: size }) > 0.9);
  assert.equal(sharpnessOf({ data: blurry, width: size, height: size }), 0);
});

test('a look the scanner is unsure about is ignored', () => {
  const blend = new ViewBlend();
  assert.equal(blend.add([1, 0, 0], 0.9, 0.55), false);
  assert.equal(blend.blended, null);
  assert.equal(blend.count, 0);
});

test('the blend has length 1 and leans towards the sharper, surer look', () => {
  const blend = new ViewBlend();
  blend.add([1, 0], 0.9, 0.95);
  blend.add([0, 1], 0.1, 0.7);
  const mixed = blend.blended!;
  assert.ok(Math.abs(Math.hypot(mixed[0], mixed[1]) - 1) < 1e-9);
  assert.ok(mixed[0] > mixed[1]);
});

test('only the newest 10 looks are kept', () => {
  const blend = new ViewBlend();
  for (let i = 0; i < BLEND_MAX_VIEWS + 5; i++) blend.add([1, 0], 0.8, 0.9);
  assert.equal(blend.count, BLEND_MAX_VIEWS);
});

test('clear() starts again', () => {
  const blend = new ViewBlend();
  blend.add([1, 0], 0.8, 0.9);
  blend.clear();
  assert.equal(blend.blended, null);
  assert.equal(blend.count, 0);
});
