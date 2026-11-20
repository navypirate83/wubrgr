/* =====================================================================
   CHECKS FOR GETTING A PICTURE READY FOR OCR
   Run with:  node --test src/lib/scanner/core/ocrPrep.test.ts
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { removeEdgeBlobs } from './ocrPrep.ts';

// A white 40 x 20 picture; "black" is a list of [x, y] to paint black
function picture(black: [number, number][]): Uint8Array {
  const p = new Uint8Array(40 * 20).fill(255);
  for (const [x, y] of black) p[y * 40 + x] = 0;
  return p;
}
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
};

test('a bar joined to the edge is wiped, and the characters inside stay', () => {
  const p = picture([...rect(0, 0, 39, 1), ...rect(5, 8, 8, 14), ...rect(12, 8, 15, 14)]);
  assert.equal(removeEdgeBlobs(p, 40, 20), true);
  assert.equal(p[0], 255);                 // the bar is gone
  assert.equal(p[10 * 40 + 6], 0);         // the first character is still there
  assert.equal(p[10 * 40 + 13], 0);        // and the second
});

test('a picture with nothing touching the edge is left alone', () => {
  const p = picture(rect(5, 5, 9, 12));
  assert.equal(removeEdgeBlobs(p, 40, 20), false);
  assert.equal(p[8 * 40 + 6], 0);
});

test('if the text itself is what touches the edge (most of the black), nothing is wiped', () => {
  const p = picture([...rect(0, 4, 20, 14), ...rect(30, 8, 31, 9)]);
  assert.equal(removeEdgeBlobs(p, 40, 20), false);
  assert.equal(p[8 * 40 + 5], 0);
});

test('a blob touching the edge only at a corner is wiped too (diagonal contact counts)', () => {
  const p = picture([[0, 0], [1, 1], [2, 2], ...rect(10, 8, 14, 14), ...rect(20, 8, 24, 14)]);
  assert.equal(removeEdgeBlobs(p, 40, 20), true);
  assert.equal(p[2 * 40 + 2], 255);
  assert.equal(p[10 * 40 + 12], 0);
});

import { stretchContrast } from './ocrPrep.ts';

test('a dull picture is stretched to use the whole range, keeping its order', () => {
  const dull = new Uint8Array(200);
  for (let i = 0; i < 200; i++) dull[i] = 100 + Math.floor(i / 10);   // 100 to 119
  const out = stretchContrast(dull);
  assert.ok(Math.min(...out) <= 5);
  assert.ok(Math.max(...out) >= 250);
  assert.ok(out[0] <= out[100] && out[100] <= out[199]);
});

test('a flat picture stays flat instead of blowing up', () => {
  const out = stretchContrast(new Uint8Array(50).fill(128));
  assert.equal(new Set(out).size, 1);
});
