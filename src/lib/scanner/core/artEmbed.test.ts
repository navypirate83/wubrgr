/* =====================================================================
   CHECKS FOR THE AI ARTWORK MATCHING (artEmbed.ts)
   Run with:  node --test src/lib/scanner/core/artEmbed.test.ts
   Two kinds of check:
   1. Small made-up examples, so we know the right answers.
   2. A check against the REAL files the experiment made
      (scripts/catalogue/cache/...): squeezing a saved full-size
      fingerprint with the recipe must give back exactly the row the
      search file holds. That proves the phone's arithmetic matches how
      the file was built. It is skipped on a computer without those files.
   ===================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FULL_WIDTH, KEPT_WIDTH, nearest, recipeSize, shrinkEmbedding, similarityTo } from './artEmbed.ts';

// A tiny pretend setup: 4 numbers from the "model", squeezed to 2, so the answers can be worked out by hand
function tinyRecipe(): Float32Array {
  // average = 0,0,0,0; direction 1 = first number; direction 2 = second number
  return Float32Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
}

test('shrinkEmbedding keeps only the chosen directions and rounds to whole numbers', () => {
  const small = shrinkEmbedding([3, 4, 99, 99], tinyRecipe(), 4, 2);
  // Along the two directions the numbers are 3 and 4, a list of length 5, scaled to length 1 then to 127
  assert.deepEqual([...small], [Math.round((3 / 5) * 127), Math.round((4 / 5) * 127)]);
});

test('shrinkEmbedding gives the same answer however bright the photo was', () => {
  const normal = shrinkEmbedding([3, 4, 0, 0], tinyRecipe(), 4, 2);
  const brighter = shrinkEmbedding([6, 8, 0, 0], tinyRecipe(), 4, 2);
  assert.deepEqual([...normal], [...brighter]);
});

test('shrinkEmbedding refuses lists or recipes of the wrong size', () => {
  assert.throws(() => shrinkEmbedding([1, 2, 3], tinyRecipe(), 4, 2));
  assert.throws(() => shrinkEmbedding([1, 2, 3, 4], new Float32Array(5), 4, 2));
});

test('recipeSize is the average plus every direction', () => {
  assert.equal(recipeSize(4, 2), 4 + 2 * 4);
  assert.equal(recipeSize(), FULL_WIDTH + KEPT_WIDTH * FULL_WIDTH);
});

test('nearest finds the artwork a photo came from, best first', () => {
  // Three saved artworks (2 numbers each) and a photo close to the second
  const saved = Int8Array.from([127, 0, 90, 90, 0, 127]);
  const photo = Int8Array.from([85, 95]);
  const found = nearest(photo, saved, 2, undefined, 2);
  assert.equal(found[0].row, 1);
  assert.equal(found.length, 2);
  assert.ok(found[0].similarity > found[1].similarity);
});

test('nearest can be limited to some rows, and similarityTo agrees with it', () => {
  const saved = Int8Array.from([127, 0, 90, 90, 0, 127]);
  const photo = Int8Array.from([127, 0]);
  const found = nearest(photo, saved, 1, [1, 2], 2);
  // Of rows 1 and 2 only, row 1 is closer to the photo (row 0, the true match, is not allowed)
  assert.equal(found[0].row, 1);
  assert.equal(found[0].similarity, similarityTo(photo, saved, 1, 2));
});

test('an identical fingerprint scores about 1', () => {
  const saved = Int8Array.from([127, 0]);
  assert.ok(Math.abs(similarityTo(Int8Array.from([127, 0]), saved, 0, 2) - 1) < 1e-9);
});

// The real-files check
const cache = join(process.cwd(), 'scripts', 'catalogue', 'cache');
const realFiles = [join(cache, 'dino-raw.bin'), join(cache, 'embed-index', 'art-vectors.bin'), join(cache, 'embed-index', 'projection.bin')];
test('squeezing a saved fingerprint with the recipe reproduces the saved search-file row', { skip: !realFiles.every(existsSync) }, () => {
  const rawBytes = readFileSync(realFiles[0]);
  const raw = new Float32Array(rawBytes.buffer, rawBytes.byteOffset, FULL_WIDTH * 20);
  const savedBytes = readFileSync(realFiles[1]);
  const saved = new Int8Array(savedBytes.buffer, savedBytes.byteOffset, savedBytes.byteLength);
  const recipeBytes = readFileSync(realFiles[2]);
  const recipe = new Float32Array(recipeBytes.buffer, recipeBytes.byteOffset, recipeBytes.byteLength / 4);
  for (let row = 0; row < 20; row++) {
    const small = shrinkEmbedding(raw.subarray(row * FULL_WIDTH, (row + 1) * FULL_WIDTH), recipe);
    const expected = saved.subarray(row * KEPT_WIDTH, (row + 1) * KEPT_WIDTH);
    // Allow a difference of 1 in a number (rounding of decimals can fall either way)
    for (let i = 0; i < KEPT_WIDTH; i++) assert.ok(Math.abs(small[i] - expected[i]) <= 1, `row ${row} number ${i}`);
    // And the artwork must find itself first among all rows
    assert.equal(nearest(small, saved, 1)[0].row, row);
  }
});
